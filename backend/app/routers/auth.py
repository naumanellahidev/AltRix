"""
Auth router: login, logout, me, refresh, password reset, permissions, roles.
Production-hardened with:
- Rate limiting on login and password reset
- Audit logging for login/logout
- Redis caching for permissions and roles
- Token refresh via request body (secure)
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Any, Dict, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import text

from app.cache import (
    cache,
    cache_key_permissions,
    cache_key_roles,
    invalidate_user_role_cache,
    TTL_PERMISSIONS,
    TTL_USER_ROLES,
)
from pydantic import BaseModel, Field
from app.config import settings
from app.dependencies import CurrentUser, DbSession
from app.schemas import (
    LoginRequest, LoginResponse, UserInfo, MessageResponse,
    SchoolPermissionsOut, UserRoleBriefOut, UserProfileOut
)
from app.utils.audit import log_audit_event, AuditAction
from app.utils.permissions import expand_roles
from app.utils.rate_limit import limiter

from app.utils.jwt import create_access_token, create_refresh_token, decode_supabase_token

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("app.auth")

#: Roles permitted to look up another user's role assignments.
ROLE_LOOKUP_ROLES = {
    "super_admin", "school_owner", "principal", "vice_principal",
    "school_admin", "hr_manager",
}



# ─── Refresh token cookie ─────────────────────────────────────────────────────
#
# The refresh token is the long-lived credential (30 days), so it is the one
# worth getting out of reach of script. Stored in localStorage it can be read by
# any XSS on the origin; as an HttpOnly cookie it cannot be read by JavaScript
# at all, which breaks the "one XSS equals a permanent account takeover" chain.
#
# SameSite=Strict means the browser will not attach it to cross-site requests,
# which is what protects these endpoints from CSRF. The path confines it to the
# two endpoints that need it, so it is not sent on every API call.
REFRESH_COOKIE_NAME = "altrix_refresh"
REFRESH_COOKIE_PATH = "/api/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        # Plain http on localhost cannot set a Secure cookie, which would make
        # local development impossible to sign in to.
        secure=settings.is_production,
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production,
        samesite="strict",
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="User login",
    description="Authenticate with email/password via Supabase. Returns JWT access and refresh tokens.",
)
@limiter.limit("5/minute")
async def login(request: Request, response: Response, body: LoginRequest, db: DbSession):
    """
    Login using email/password via Supabase Auth API.
    Rate limited: 5 attempts per minute per IP.
    """
    from app.utils.brute_force import check_brute_force, record_failed_attempt, clear_failed_attempts, detect_suspicious_login
    import hashlib
    import bcrypt

    # 1. Brute-force check BEFORE attempting auth
    await check_brute_force(request, body.email)

    # Query auth.users directly on the VPS (case-insensitive & whitespace trimmed)
    result = await db.execute(
        text("SELECT id, email, encrypted_password FROM auth.users WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email)) LIMIT 1"),
        {"email": body.email}
    )
    user = result.fetchone()

    is_valid = False
    if user and user.encrypted_password:
        try:
            hash_bytes = user.encrypted_password.encode('utf-8')
            if hash_bytes.startswith(b"$2a$") or hash_bytes.startswith(b"$2y$"):
                hash_bytes = b"$2b$" + hash_bytes[4:]
            
            is_valid = bcrypt.checkpw(
                body.password.encode('utf-8'),
                hash_bytes
            )
        except Exception as e:
            logger.warning(f"Bcrypt check failed: {e}")
            is_valid = False

        # Native PostgreSQL pgcrypto crypt fallback if bcrypt returned False or failed
        if not is_valid:
            try:
                crypt_check = await db.execute(
                    text("SELECT (encrypted_password = crypt(:password, encrypted_password)) AS is_ok FROM auth.users WHERE id = :user_id"),
                    {"password": body.password, "user_id": user.id}
                )
                row = crypt_check.fetchone()
                if row and row.is_ok:
                    is_valid = True
            except Exception as db_e:
                logger.warning(f"DB pgcrypto check fallback failed: {db_e}")

    if not is_valid or user is None:
        # Record failed login attempt (brute force and persistent SQL table)
        await record_failed_attempt(request, body.email, db=db)
        
        try:
            await db.execute(
                text("""
                    INSERT INTO failed_login_attempts (email, ip_address, user_agent, failure_reason)
                    VALUES (:email, :ip, :ua, :reason)
                """),
                {
                    "email": body.email,
                    "ip": request.client.host if request.client else "unknown",
                    "ua": request.headers.get("User-Agent", "")[:500],
                    "reason": "Invalid credentials",
                }
            )
            await db.commit()
        except Exception as db_err:
            logger.warning(f"Failed to record failed login attempt to DB: {db_err}")

        # Log audit event
        await log_audit_event(
            db=db,
            action=AuditAction.LOGIN,
            resource_type="auth",
            resource_id=body.email,
            new_values={"success": False, "email": body.email},
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user_id: str = str(user.id)
    email: str = str(user.email or body.email)
    
    # Generate local tokens
    access_token = create_access_token(user_id=user_id, email=email)
    refresh_token = create_refresh_token(user_id=user_id, email=email)

    # Clear brute-force counters on success
    ip = request.client.host if request.client else None
    await clear_failed_attempts(body.email, ip)

    # Detect suspicious login patterns (new IP, etc.)
    await detect_suspicious_login(request, user_id, email, db=db)

    # Log audit event
    await log_audit_event(
        db=db,
        action=AuditAction.LOGIN,
        resource_type="auth",
        resource_id=user_id,
        new_values={"success": True, "email": email},
        user_id=user_id,
        request=request,
    )

    # Track active session in DB
    try:
        token_hash = hashlib.sha256(access_token.encode("utf-8")).hexdigest()
        await db.execute(
            text("""
                INSERT INTO active_sessions (user_id, school_id, ip_address, user_agent, token_hash, is_active)
                VALUES (:user_id, :school_id, :ip, :ua, :token_hash, TRUE)
            """),
            {
                "user_id": user_id,
                "school_id": request.headers.get("X-School-Id"),
                "ip": request.client.host if request.client else "unknown",
                "ua": request.headers.get("User-Agent", "")[:500],
                "token_hash": token_hash,
            }
        )
        await db.commit()
    except Exception as session_err:
        logger.warning(f"Failed to record active session: {session_err}")

    # Fire Event Bus trigger for login
    try:
        from app.services.event_bus import EnterpriseEventBus
        from app.schemas import EventEnvelope
        school_id_header = request.headers.get("X-School-Id")
        await EnterpriseEventBus.publish(EventEnvelope(
            event_name="UserLogin",
            category="security",
            school_id=school_id_header if school_id_header else None,
            user_id=user_id if user_id else None,
            entity_type="user",
            payload={"email": email, "ip": request.client.host if request.client else "unknown"},
            source="auth_router",
        ), db)
    except Exception as eb_err:
        logger.warning(f"Event bus publish failed (non-blocking): {eb_err}")

    # Load user roles scoped to tenant or any school
    user_roles = []
    try:
        import uuid
        uid_obj = uuid.UUID(user_id)

        # Check platform_super_admins
        res_super = await db.execute(
            text("SELECT user_id FROM platform_super_admins WHERE user_id = :uid LIMIT 1"),
            {"uid": uid_obj}
        )
        if res_super.fetchone() is not None:
            user_roles.append("super_admin")

        school_id_header = request.headers.get("X-School-Id")
        if school_id_header:
            try:
                sid_obj = uuid.UUID(school_id_header)
                result_roles = await db.execute(
                    text(
                        """
                        SELECT role FROM user_roles
                        WHERE user_id = :uid AND (school_id = :sid OR school_id IS NULL)
                        UNION
                        SELECT 'school_owner' FROM school_owner_assignments
                        WHERE owner_user_id = :uid AND school_id = :sid
                        """
                    ),
                    {"uid": uid_obj, "sid": sid_obj},
                )
                for row in result_roles.fetchall():
                    if row[0] not in user_roles:
                        user_roles.append(row[0])
            except (ValueError, TypeError):
                # A malformed X-School-Id is the caller's error, not a failure
                # to read roles: fall through to the school-agnostic lookup
                # below. A database error is not caught here and still raises.
                logger.debug("Ignoring malformed X-School-Id header %r during login",
                             school_id_header)
        
        if not user_roles or user_roles == ["super_admin"]:
            res_any = await db.execute(
                text("SELECT role FROM user_roles WHERE user_id = :uid LIMIT 5"),
                {"uid": uid_obj}
            )
            for row in res_any.fetchall():
                if row[0] not in user_roles:
                    user_roles.append(row[0])
    except Exception as roles_err:
        logger.warning(f"Failed to pre-load user roles for login: {roles_err}")

    # The refresh token goes back as an HttpOnly cookie and deliberately NOT in
    # the body: anything returned here is readable by script on the page, which
    # is the exposure this change exists to remove.
    _set_refresh_cookie(response, refresh_token)

    return LoginResponse(
        access_token=access_token,
        refresh_token=None,
        user_id=user_id,
        email=email,
        roles=user_roles,
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="User logout",
    description="Invalidates the current Supabase session and logs the event.",
)
async def logout(request: Request, response: Response, current_user: CurrentUser, db: DbSession):
    """Logout: invalidate Supabase session + blacklist token + audit log."""
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()

    if token:
        # Token invalidation is handled locally below

        # Blacklist current token
        import hashlib
        from app.utils.jwt import decode_supabase_token
        from app.utils.security import blacklist_token
        from datetime import datetime, timezone, timedelta
        
        jti = None
        expires_at = None
        try:
            payload = await decode_supabase_token(token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if exp:
                expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        except Exception:
            pass

        if not jti:
            jti = hashlib.sha256(token.encode("utf-8")).hexdigest()
        if not expires_at:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

        await blacklist_token(db, jti, UUID(current_user.id), expires_at)

        # Close only the session being logged out. Matching on user_id as well
        # signed the user out of every device, so logging out on a phone wiped
        # the desktop session record too.
        try:
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            await db.execute(
                text("""
                    UPDATE active_sessions
                    SET is_active = FALSE, logged_out_at = NOW(), logout_reason = 'logout'
                    WHERE token_hash = :token_hash AND is_active = TRUE
                """),
                {"token_hash": token_hash}
            )
            await db.commit()
        except Exception as e:
            logger.warning(f"Failed to invalidate active session: {e}")

        # Drop cached authorization so a role change made while logged in is not
        # resurrected by the next login reading a stale cache entry.
        await invalidate_user_role_cache(current_user.id, current_user.school_id)

    await log_audit_event(
        db=db,
        action=AuditAction.LOGOUT,
        resource_type="auth",
        resource_id=current_user.id,
        user_id=current_user.id,
        school_id=current_user.school_id,
        request=request,
    )

    _clear_refresh_cookie(response)
    return MessageResponse(message="Logged out successfully")


@router.post(
    "/refresh",
    response_model=LoginResponse,
    summary="Refresh access token",
    description="Exchange a refresh token for a new access token.",
)
async def refresh_token(body: dict, request: Request, response: Response, db: DbSession):
    """
    Refresh the access token using a refresh token.
    Accepts JSON body: {"refresh_token": "..."}

    This endpoint is the only way a session outlives the access-token lifetime,
    so it repeats every revocation check rather than just verifying the
    signature. Skipping them previously meant logout, password reset and
    deactivation were all effectively no-ops for 30 days.
    """
    # Prefer the HttpOnly cookie. The request body is still accepted so that
    # sessions created before the cookie existed can be exchanged once and
    # migrated across; the response always sets the cookie afterwards.
    token = request.cookies.get(REFRESH_COOKIE_NAME) or body.get("refresh_token", "")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token supplied",
        )

    import hashlib
    from datetime import datetime as _dt, timezone as _tz
    from app.utils.jwt import decode_supabase_token, create_access_token, create_refresh_token
    from app.utils.security import is_token_blacklisted, tokens_invalidated_before

    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    # A rejected token will never become valid again, so drop the cookie rather
    # than letting the browser retry with it forever.
    _clear_refresh_cookie(response)

    try:
        payload = await decode_supabase_token(token)
    except Exception:
        raise invalid

    # Only a real refresh token may be exchanged. Without this an access token
    # could be rolled forward indefinitely, so it would never actually expire.
    if payload.get("token_type") != "refresh":
        raise invalid

    user_id_raw = payload.get("sub")
    email_raw = payload.get("email")
    if not user_id_raw or not email_raw:
        raise invalid
    user_id_str: str = str(user_id_raw)
    email_str: str = str(email_raw)

    # Revoked at logout?
    jti = payload.get("jti") or hashlib.sha256(token.encode("utf-8")).hexdigest()
    if await is_token_blacklisted(db, jti):
        raise invalid

    # Issued before a password change or a "sign out everywhere"?
    cutoff = await tokens_invalidated_before(db, user_id_str)
    if cutoff is not None:
        issued_at = payload.get("iat")
        if issued_at is None:
            raise invalid
        if cutoff.tzinfo is None:
            cutoff = cutoff.replace(tzinfo=_tz.utc)
        if _dt.fromtimestamp(int(issued_at), tz=_tz.utc) < cutoff:
            raise invalid

    # Does the account still exist? A deleted or disabled user must not be able
    # to keep minting access tokens from an old refresh token.
    try:
        res_user = await db.execute(
            text("SELECT id, email FROM auth.users WHERE id = :uid LIMIT 1"),
            {"uid": user_id_str},
        )
        row_user = res_user.fetchone()
        if not row_user:
            raise invalid
        email_str = str(row_user.email or email_str)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Refresh user lookup failed for {user_id_str}: {e}")
        raise invalid

    # Rotate: the presented refresh token is retired so a captured copy cannot
    # be reused alongside the new one.
    try:
        exp = payload.get("exp")
        expires_at = (
            _dt.fromtimestamp(int(exp), tz=_tz.utc) if exp
            else _dt.now(_tz.utc) + timedelta(days=settings.refresh_token_expire_days)
        )
        from app.utils.security import blacklist_token
        await blacklist_token(db, jti, UUID(user_id_str), expires_at)
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to rotate refresh token for {user_id_str}: {e}")

    access_token = create_access_token(user_id=user_id_str, email=email_str)
    new_refresh_token = create_refresh_token(user_id=user_id_str, email=email_str)
    _set_refresh_cookie(response, new_refresh_token)

    return LoginResponse(
        access_token=access_token,
        refresh_token=None,
        user_id=user_id_str,
        email=email_str,
        roles=[],
    )


@router.get(
    "/me",
    response_model=UserInfo,
    summary="Current user info",
    description="Returns the authenticated user's ID, email, roles, and school context.",
)
async def get_me(current_user: CurrentUser, db: DbSession):
    """Return current user info with roles."""
    return UserInfo(
        id=current_user.id,
        email=current_user.email,
        roles=current_user.roles,
        school_id=current_user.school_id,
        campus_id=current_user.campus_id,
        is_super_admin=current_user.is_super_admin,
    )


def _hash_reset_token(raw_token: str) -> str:
    """
    Hash a password reset token for storage.

    SHA-256 without a salt is the right primitive here (unlike for passwords):
    the token is 48 random bytes, so it has no guessable preimage, and lookup
    must be a single indexed equality match.
    """
    import hashlib
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


class PasswordResetVerifyResponse(BaseModel):
    valid: bool
    email: Optional[str] = None
    error: Optional[str] = None


class PasswordResetConfirmRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8)


@router.post(
    "/password-reset-request",
    response_model=MessageResponse,
    summary="Request password reset",
    description="Sends a password reset email via Central Email Service. Rate limited.",
)
@limiter.limit("5/5minutes")
async def request_password_reset(request: Request, body: dict, db: DbSession):
    """
    Generate single-use crypto reset token and send branded reset email.
    Accepts JSON body: {"email": "..."}
    """
    import secrets
    from datetime import datetime, timezone, timedelta
    from app.services.email_service import CentralEmailService

    raw_email = body.get("email") if isinstance(body, dict) else str(body)
    clean_email = (raw_email or "").strip().lower()

    if clean_email and "@" in clean_email:
        # Check if user exists in auth.users
        res_u = await db.execute(
            text("SELECT id, email FROM auth.users WHERE LOWER(TRIM(email)) = :email LIMIT 1"),
            {"email": clean_email}
        )
        user_row = res_u.fetchone()

        if user_row:
            user_id = user_row.id
            reset_token = secrets.token_urlsafe(48)
            expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
            ip_addr = request.client.host if request.client else "unknown"

            # Invalidate prior pending resets
            await db.execute(
                text("UPDATE public.password_resets SET status = 'revoked' WHERE user_id = :uid AND status = 'pending'"),
                {"uid": user_id}
            )

            # Only the hash is stored. The raw token exists solely in the email
            # we are about to send, so a leaked backup or a stray read of this
            # table cannot be replayed into account takeovers.
            await db.execute(
                text("""
                    INSERT INTO public.password_resets (token, user_id, email, status, expires_at, ip_address)
                    VALUES (:token, :uid, :email, 'pending', :expires_at, :ip)
                """),
                {
                    "token": _hash_reset_token(reset_token),
                    "uid": user_id,
                    "email": clean_email,
                    "expires_at": expires_at,
                    "ip": ip_addr,
                }
            )
            await db.commit()

            # Construct reset link
            reset_link = f"https://altrixcore.com/reset-password?token={reset_token}"

            # Dispatch branded reset email
            await CentralEmailService.send_event(
                event_name="password_reset",
                recipient=clean_email,
                context={
                    "email": clean_email,
                    "reset_link": reset_link,
                    "expires_in": "1 hour",
                    "support_email": "support@altrixcore.com",
                },
                db=db,
            )

            logger.info(f"Dispatched secure password reset email to: {clean_email}")

        await log_audit_event(
            db=db,
            action=AuditAction.PASSWORD_RESET,
            resource_type="auth",
            resource_id=clean_email,
            new_values={"email": clean_email},
            request=request,
        )

    # Always return identical response to prevent user enumeration
    return MessageResponse(message="If an account exists with that email, a password reset link has been sent.")


@router.get(
    "/password-reset-verify",
    response_model=PasswordResetVerifyResponse,
    summary="Verify Password Reset Token",
)
async def verify_password_reset_token(
    token: str = Query(..., description="Reset token"),
    db: DbSession = None,
):
    """Verify validity of password reset token."""
    if not token or len(token.strip()) < 20:
        return PasswordResetVerifyResponse(valid=False, error="Invalid token format")

    res = await db.execute(
        text("SELECT id, user_id, email, status, expires_at FROM public.password_resets WHERE token = :token LIMIT 1"),
        {"token": _hash_reset_token(token)}
    )
    row = res.fetchone()

    if not row:
        return PasswordResetVerifyResponse(valid=False, error="Reset link is invalid or expired.")
    if row.status == "consumed":
        return PasswordResetVerifyResponse(valid=False, error="This reset link has already been used.")
    if row.status == "revoked":
        return PasswordResetVerifyResponse(valid=False, error="This reset link has been invalidated. Please request a new one.")
    if row.expires_at and row.expires_at < datetime.now(timezone.utc):
        return PasswordResetVerifyResponse(valid=False, error="This reset link has expired. Please request a new one.")

    return PasswordResetVerifyResponse(valid=True, email=row.email)


@router.post(
    "/password-reset-confirm",
    response_model=MessageResponse,
    summary="Confirm Password Reset",
)
@limiter.limit("5/minute")
async def confirm_password_reset(
    request: Request,
    body: PasswordResetConfirmRequest,
    db: DbSession = None,
):
    """Set new password using verified reset token."""
    token = body.token.strip()
    pwd = body.password.strip()

    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    res = await db.execute(
        text("SELECT id, user_id, email, status, expires_at FROM public.password_resets WHERE token = :token LIMIT 1"),
        {"token": _hash_reset_token(token)}
    )
    row = res.fetchone()

    if not row or row.status != "pending" or (row.expires_at and row.expires_at < datetime.now(timezone.utc)):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user_id = row.user_id
    email = row.email

    # Update password in auth.users
    await db.execute(
        text("UPDATE auth.users SET encrypted_password = crypt(:pwd, gen_salt('bf', 10)), updated_at = NOW() WHERE id = :uid"),
        {"pwd": pwd, "uid": user_id}
    )

    # Mark reset token consumed
    await db.execute(
        text("UPDATE public.password_resets SET status = 'consumed', consumed_at = NOW() WHERE id = :id"),
        {"id": row.id}
    )

    # Invalidate active sessions for security
    await db.execute(
        text("UPDATE public.active_sessions SET is_active = FALSE, logged_out_at = NOW(), logout_reason = 'password_reset' WHERE user_id = :uid"),
        {"uid": user_id}
    )

    # Marking session rows inactive is only bookkeeping — nothing in the request
    # path reads them. Revoke the tokens themselves, otherwise an attacker who
    # already holds one keeps access after the victim resets their password,
    # which is the exact scenario a reset is meant to end.
    from app.utils.security import invalidate_all_user_tokens
    await invalidate_all_user_tokens(db, user_id, reason="password_reset")
    await invalidate_user_role_cache(str(user_id))

    await db.commit()

    # Dispatch confirmation email
    from app.services.email_service import CentralEmailService
    await CentralEmailService.send_event(
        event_name="password_changed",
        recipient=email,
        context={"email": email, "support_email": "support@altrixcore.com"},
        db=db,
    )

    # Log audit event
    await log_audit_event(
        db=db,
        action=AuditAction.PASSWORD_RESET,
        resource_type="auth",
        resource_id=str(user_id),
        user_id=str(user_id),
        new_values={"password_changed": True, "email": email},
        request=request,
    )

    return MessageResponse(message="Password successfully reset! You can now log in with your new password.")


@router.get(
    "/roles",
    summary="User roles across all schools",
    description="Returns all school memberships and roles for the current user.",
)
async def get_user_roles(current_user: CurrentUser, db: DbSession):
    """Return all roles for the current user across all schools. Cached."""
    cache_key = cache_key_roles(current_user.id)
    cached = await cache.get(cache_key)
    if cached:
        return cached

    try:
        result = await db.execute(
            text("""
                SELECT ur.school_id, ur.role, ur.campus_id, s.name as school_name, s.slug as school_slug
                FROM user_roles ur
                JOIN schools s ON ur.school_id = s.id
                WHERE ur.user_id = :uid
                ORDER BY s.name, ur.role
            """),
            {"uid": current_user.id},
        )
        rows = result.fetchall()
        response = {
            "user_id": current_user.id,
            "schools": [
                {
                    "school_id": str(row[0]),
                    "role": row[1],
                    "campus_id": str(row[2]) if row[2] else None,
                    "school_name": row[3],
                    "school_slug": row[4],
                }
                for row in rows
            ],
        }
        await cache.set(cache_key, response, ttl=TTL_USER_ROLES)
        return response

    except Exception as e:
        logger.warning(f"DB exception querying user roles: {e}")
        return {
            "user_id": current_user.id,
            "schools": [],
        }


@router.get(
    "/permissions",
    response_model=SchoolPermissionsOut,
    summary="User permissions",
    description="Returns computed permission flags for the current user in the active school. Cached for 5 minutes.",
)
async def get_permissions(current_user: CurrentUser):
    """Return permissions for the current user in the active school context. Cached."""
    school_id_str = current_user.school_id or ""
    cache_key = cache_key_permissions(current_user.id, school_id_str)

    cached = await cache.get(cache_key)
    if cached:
        return SchoolPermissionsOut(**cached)

    from app.utils.permissions import (
        expand_roles,
        can_manage_staff,
        can_manage_students,
        can_manage_finance,
    )

    effective_roles = expand_roles(current_user.roles)
    has_hr_manager = "hr_manager" in effective_roles

    can_manage_staff_val = can_manage_staff(effective_roles) or has_hr_manager
    can_manage_students_val = can_manage_students(effective_roles)
    can_work_crm_val = (
        can_manage_staff_val
        or "marketing_staff" in effective_roles
        or "counselor" in effective_roles
    )
    can_manage_finance_val = can_manage_finance(effective_roles)

    result = SchoolPermissionsOut(
        isPlatformSuperAdmin=current_user.is_super_admin,
        canManageStaff=can_manage_staff_val,
        canManageStudents=can_manage_students_val,
        canWorkCrm=can_work_crm_val,
        canManageFinance=can_manage_finance_val,
    )

    await cache.set(cache_key, result.model_dump(), ttl=TTL_PERMISSIONS)
    return result


# NOTE: a second POST /logout handler lived here. It was unreachable (the real
# logout is registered earlier) and did nothing but answer
# {"success": true} — no token blacklisting, no session close. Removed so the
# file does not suggest logout has two implementations.



@router.get(
    "/user-roles",
    response_model=List[UserRoleBriefOut],
    summary="Get roles for a specific user in a school",
)
async def get_user_school_roles(
    school_id: UUID,
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Retrieve roles for a specific user within a school.

    Not paginated on purpose: the result is one user's roles inside one school.
    The row count is bounded by how many roles exist, which is a handful.

    Unauthenticated, this let anyone enumerate who holds which role at any
    institute — a ready-made target list of that school's owners and principals.
    Callers must belong to the school, and may only look up other people if they
    administer it.
    """
    from app.utils.tenant_guard import require_tenant_access
    require_tenant_access(school_id, current_user, resource_description="user roles")

    if str(user_id) != str(current_user.id):
        effective_roles = expand_roles(current_user.roles)
        if not (current_user.is_super_admin or effective_roles & ROLE_LOOKUP_ROLES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You may only look up your own roles",
            )

    import uuid
    try:
        sid_obj = uuid.UUID(str(school_id)) if isinstance(school_id, str) else school_id
        uid_obj = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            text("SELECT role FROM user_roles WHERE school_id = :sid AND user_id = :uid"),
            {"sid": sid_obj, "uid": uid_obj},
        )
        rows = result.fetchall()
        return [UserRoleBriefOut(role=row[0]) for row in rows]
    except Exception as e:
        logger.warning(f"DB exception querying user school roles: {e}")
        return []


@router.get(
    "/profiles/{user_id}",
    response_model=UserProfileOut,
    summary="Get user profile",
    description="Retrieve a user's profile by their UUID.",
)
async def get_user_profile(user_id: UUID, current_user: CurrentUser, db: DbSession):
    """Retrieve profile by user ID."""
    try:
        from app.models.core import Profile
        from sqlalchemy import select
        result = await db.execute(select(Profile).where(Profile.id == user_id))
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=404, detail=f"Profile {user_id} not found")

        return UserProfileOut.model_validate(profile)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"DB exception querying profile {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# NOTE: a /debug-deploy-log endpoint used to live here. It streamed the server's
# deployment logs to any unauthenticated caller — those logs routinely contain
# connection strings and environment values. Read deployment logs on the host.
