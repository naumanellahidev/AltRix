"""
Staff Invitation & Account Activation Router for AltRix Cloud OS.
Provides production-grade, cryptographically secure invitation-based onboarding:
- Passwordless staff invitation by authorized administrators
- Single-use, time-limited cryptographic activation tokens
- Server-side token validation & email verification
- Self-service password creation during activation
- Full lifecycle management (Pending, Sent, Opened, Verified, Activated, Expired, Revoked)
"""
import json
import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import bcrypt

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, AuthenticatedUser
from app.services.email_service import CentralEmailService
from app.utils.audit import log_audit_event, AuditAction
from app.utils.jwt import create_access_token
from app.utils.rate_limit import limiter

router = APIRouter(prefix="/auth/invitations", tags=["Staff Invitations & Activation"])
logger = logging.getLogger("app.auth.invitations")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class CreateInvitationRequest(BaseModel):
    email: EmailStr
    role: str = Field(..., description="Assigned role: teacher, admin, hr_manager, accountant, etc.")
    displayName: Optional[str] = Field(None, description="Staff member full name")
    schoolSlug: Optional[str] = None
    schoolId: Optional[str] = None
    campusId: Optional[str] = None


class VerifyInvitationResponse(BaseModel):
    valid: bool
    email: Optional[str] = None
    displayName: Optional[str] = None
    role: Optional[str] = None
    schoolName: Optional[str] = None
    schoolSlug: Optional[str] = None
    expiresAt: Optional[str] = None
    error: Optional[str] = None


class ActivateAccountRequest(BaseModel):
    token: str = Field(..., description="Secure opaque invitation token")
    password: str = Field(..., min_length=8, description="Staff member chosen password")
    displayName: Optional[str] = None


class InvitationActionRequest(BaseModel):
    invitationId: str


class UpdateInvitationRequest(BaseModel):
    invitationId: str
    displayName: Optional[str] = None
    role: Optional[str] = None
    campusId: Optional[str] = None


# ---------------------------------------------------------------------------
# Helper: Permission verification
# ---------------------------------------------------------------------------
async def _authorize_invite_manager(
    db: AsyncSession,
    user_id: str,
    school_id: Optional[uuid.UUID],
) -> bool:
    """Check if current user is Super Admin, School Owner, Principal, VP, or HR Manager."""
    try:
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except ValueError:
        return False

    # 1. Super Admin
    res_sa = await db.execute(
        text("SELECT user_id FROM public.platform_super_admins WHERE user_id = :uid LIMIT 1"),
        {"uid": uid},
    )
    if res_sa.fetchone():
        return True

    if not school_id:
        return False

    # 2. School Owner
    res_own = await db.execute(
        text("SELECT owner_user_id FROM public.school_owner_assignments WHERE school_id = :sid AND owner_user_id = :uid LIMIT 1"),
        {"sid": school_id, "uid": uid},
    )
    if res_own.fetchone():
        return True

    # 3. Principal, VP, Admin, or HR Manager
    res_roles = await db.execute(
        text("""
            SELECT role FROM public.user_roles
            WHERE user_id = :uid AND (school_id = :sid OR school_id IS NULL)
        """),
        {"uid": uid, "sid": school_id},
    )
    roles = [r[0] for r in res_roles.fetchall()]
    allowed = {"principal", "vice_principal", "admin", "school_admin", "hr_manager", "school_owner", "super_admin"}
    return bool(set(roles).intersection(allowed))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post(
    "/create",
    summary="Create & Send Staff Invitation",
    description="Authorized admin invites a new staff member. Generates a secure single-use token and dispatches branded email.",
)
@limiter.limit("20/minute")
async def create_invitation(
    request: Request,
    body: CreateInvitationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    clean_email = str(body.email).strip().lower()
    if "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    # Resolve School ID & Name
    school_id: Optional[uuid.UUID] = None
    school_name = "AltRix Institute"
    school_slug = "altrix"

    if body.schoolId:
        try:
            school_id = uuid.UUID(body.schoolId)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid schoolId")
    elif body.schoolSlug:
        res_s = await db.execute(
            text("SELECT id, name, slug FROM public.schools WHERE slug = :slug LIMIT 1"),
            {"slug": body.schoolSlug.strip().lower()},
        )
        row_s = res_s.fetchone()
        if row_s:
            school_id = row_s.id
            school_name = row_s.name
            school_slug = row_s.slug
    elif current_user.school_id:
        try:
            school_id = uuid.UUID(current_user.school_id)
        except ValueError:
            pass

    if school_id:
        res_info = await db.execute(
            text("SELECT name, slug FROM public.schools WHERE id = :sid LIMIT 1"),
            {"sid": school_id},
        )
        row_i = res_info.fetchone()
        if row_i:
            school_name = row_i.name
            school_slug = row_i.slug

    # Permission check
    is_authorized = await _authorize_invite_manager(db, current_user.id, school_id)
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Forbidden: You lack permission to invite staff for this institution")

    # Check if user is already actively registered in this tenant
    res_existing_user = await db.execute(
        text("SELECT id FROM auth.users WHERE LOWER(TRIM(email)) = :email LIMIT 1"),
        {"email": clean_email},
    )
    existing_user = res_existing_user.fetchone()

    if existing_user and school_id:
        res_existing_role = await db.execute(
            text("SELECT role FROM public.user_roles WHERE user_id = :uid AND school_id = :sid LIMIT 1"),
            {"uid": existing_user.id, "sid": school_id},
        )
        if res_existing_role.fetchone():
            raise HTTPException(
                status_code=400,
                detail=f"User with email '{clean_email}' already exists with an active role in this institution.",
            )

    # Campus ID
    campus_id: Optional[uuid.UUID] = None
    if body.campusId and body.campusId.strip():
        try:
            campus_id = uuid.UUID(body.campusId.strip())
        except ValueError:
            campus_id = None

    # Generate cryptographically secure opaque token (64 chars)
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=48)
    invitation_id = uuid.uuid4()
    actor_uid = uuid.UUID(current_user.id) if isinstance(current_user.id, str) else current_user.id

    # Invalidate any previous pending invitations for this email in this school
    if school_id:
        await db.execute(
            text("""
                UPDATE public.user_invitations
                SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = :aid
                WHERE LOWER(email) = :email AND school_id = :sid AND status IN ('pending', 'sent', 'opened')
            """),
            {"email": clean_email, "sid": school_id, "aid": actor_uid},
        )

    # Insert new invitation
    await db.execute(
        text("""
            INSERT INTO public.user_invitations (
                id, token, email, role, display_name, school_id, campus_id, invited_by_user_id, status, created_at, expires_at
            ) VALUES (
                :id, :token, :email, :role, :displayName, :school_id, :campus_id, :aid, 'sent', NOW(), :expires_at
            )
        """),
        {
            "id": invitation_id,
            "token": token,
            "email": clean_email,
            "role": body.role,
            "displayName": body.displayName or clean_email.split("@")[0],
            "school_id": school_id,
            "campus_id": campus_id,
            "aid": actor_uid,
            "expires_at": expires_at,
        },
    )
    await db.commit()

    # Construct secure activation link
    activation_link = f"https://altrixcore.com/activate-account/{token}"

    # Dispatch branded invitation email through Central Email Service
    email_result = await CentralEmailService.send_event(
        event_name="staff_invitation",
        recipient=clean_email,
        context={
            "name": body.displayName or clean_email.split("@")[0],
            "tenant_name": school_name,
            "role": body.role.replace("_", " ").title(),
            "activation_link": activation_link,
            "expires_in": "48 hours",
            "support_email": "support@altrixcore.com",
        },
        db=db,
    )

    # Audit log
    await log_audit_event(
        db=db,
        action=AuditAction.CREATE,
        resource_type="invitation",
        resource_id=str(invitation_id),
        user_id=str(current_user.id),
        school_id=str(school_id) if school_id else None,
        new_values={"email": clean_email, "role": body.role, "email_dispatched": email_result["ok"]},
        request=request,
    )

    return {
        "ok": True,
        "invitationId": str(invitation_id),
        "email": clean_email,
        "role": body.role,
        "status": "sent",
        "expiresAt": expires_at.isoformat(),
        "emailDispatched": email_result["ok"],
    }
@router.get(
    "/verify",
    response_model=VerifyInvitationResponse,
    summary="Verify Invitation Token",
    description="Public endpoint: validates an invitation token and returns associated metadata without exposing sensitive credentials.",
)
@limiter.limit("30/minute")
async def verify_invitation(
    request: Request,
    token: str = Query(..., description="Single-use cryptographic token"),
    db: AsyncSession = Depends(get_db),
):
    token = token.strip()
    # Handle splat tokens that may include trailing slashes or sub-segments (e.g. token/n/A)
    if "/" in token:
        token_parts = [p.strip() for p in token.split("/") if p.strip() and p.strip() != "n" and p.strip() != "A" and p.strip().lower() != "n/a"]
        if token_parts:
            token = token_parts[0]

    res = await db.execute(
        text("""
            SELECT i.id, i.email, i.role, i.display_name, i.status, i.expires_at,
                   s.name as school_name, s.slug as school_slug
            FROM public.user_invitations i
            LEFT JOIN public.schools s ON i.school_id = s.id
            WHERE i.token = :token
            LIMIT 1
        """),
        {"token": token},
    )
    row = res.fetchone()

    if not row:
        return VerifyInvitationResponse(valid=False, error="Invitation token not found. Please verify your email link.")

    if row.status == "activated":
        return VerifyInvitationResponse(valid=False, error="This invitation has already been used to activate an account.")

    if row.status == "revoked":
        return VerifyInvitationResponse(valid=False, error="This invitation has been revoked by your school administrator.")

    if row.expires_at and row.expires_at < datetime.now(timezone.utc):
        return VerifyInvitationResponse(valid=False, error="This invitation has expired. Please ask your administrator to resend the invite.")

    # Mark as opened if first time
    if row.status == "sent":
        await db.execute(
            text("UPDATE public.user_invitations SET status = 'opened', opened_at = NOW() WHERE id = :id"),
            {"id": row.id},
        )
        await db.commit()

    return VerifyInvitationResponse(
        valid=True,
        email=row.email,
        displayName=row.display_name,
        role=row.role,
        schoolName=row.school_name or "AltRix Cloud",
        schoolSlug=row.school_slug or "altrix",
        expiresAt=row.expires_at.isoformat() if row.expires_at else None,
    )


@router.post(
    "/activate",
    summary="Activate Account & Set Password",
    description="Public activation: validates token, creates password, verifies email, assigns tenant & role, marks token consumed, and logs user in.",
)
@limiter.limit("10/minute")
async def activate_account(
    request: Request,
    body: ActivateAccountRequest,
    db: AsyncSession = Depends(get_db),
):
    token = body.token.strip()
    pwd = body.password.strip()

    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    # Clean multi-segment tokens if present
    if "/" in token:
        token_parts = [p.strip() for p in token.split("/") if p.strip() and p.strip() != "n" and p.strip() != "A" and p.strip().lower() != "n/a"]
        if token_parts:
            token = token_parts[0]

    # Re-verify token server-side
    res = await db.execute(
        text("""
            SELECT i.id, i.email, i.role, i.display_name, i.school_id, i.campus_id, i.status, i.expires_at, i.invited_by_user_id
            FROM public.user_invitations i
            WHERE i.token = :token
            LIMIT 1
        """),
        {"token": token},
    )
    invite = res.fetchone()

    if not invite:
        raise HTTPException(status_code=400, detail="Invalid invitation token")
    if invite.status == "activated":
        raise HTTPException(status_code=400, detail="This invitation has already been used.")
    if invite.status == "revoked":
        raise HTTPException(status_code=400, detail="This invitation has been revoked.")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This invitation has expired.")

    clean_email = invite.email.strip().lower()
    full_name = body.displayName or invite.display_name or clean_email.split("@")[0]
    assigned_role = invite.role
    school_id = invite.school_id
    actor_uid = invite.invited_by_user_id

    # Securely hash password in Python using bcrypt
    hashed_pwd = bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")

    # 1. Create or update auth.users
    res_u = await db.execute(
        text("SELECT id FROM auth.users WHERE LOWER(TRIM(email)) = :email LIMIT 1"),
        {"email": clean_email},
    )
    existing_u = res_u.fetchone()

    if existing_u:
        user_id = existing_u.id
        await db.execute(
            text("""
                UPDATE auth.users
                SET encrypted_password = :hashed_pwd,
                    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
                    updated_at = NOW()
                WHERE id = :uid
            """),
            {"hashed_pwd": hashed_pwd, "uid": user_id},
        )
    else:
        user_id = uuid.uuid4()
        raw_app_meta = json.dumps({"provider": "email", "providers": ["email"]})
        raw_user_meta = json.dumps({"full_name": full_name, "name": full_name})
        await db.execute(
            text("""
                INSERT INTO auth.users (
                    id, email, encrypted_password, email_confirmed_at,
                    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
                ) VALUES (
                    :uid, :email, :hashed_pwd, NOW(),
                    CAST(:app_meta AS jsonb), CAST(:user_meta AS jsonb), NOW(), NOW(), 'authenticated', 'authenticated'
                )
            """),
            {
                "uid": user_id,
                "email": clean_email,
                "hashed_pwd": hashed_pwd,
                "app_meta": raw_app_meta,
                "user_meta": raw_user_meta,
            },
        )

    # 2. Upsert Profiles safely (check existence first)
    res_p = await db.execute(
        text("SELECT id FROM public.profiles WHERE id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    if res_p.fetchone():
        await db.execute(
            text("""
                UPDATE public.profiles
                SET email = :email,
                    display_name = COALESCE(:name, display_name),
                    updated_at = NOW()
                WHERE id = :uid
            """),
            {"uid": user_id, "email": clean_email, "name": full_name},
        )
    else:
        await db.execute(
            text("""
                INSERT INTO public.profiles (id, email, display_name, created_at, updated_at)
                VALUES (:uid, :email, :name, NOW(), NOW())
            """),
            {"uid": user_id, "email": clean_email, "name": full_name},
        )

    # 3. Upsert School Membership & User Role safely
    if school_id:
        res_mem = await db.execute(
            text("SELECT id FROM public.school_memberships WHERE school_id = :sid AND user_id = :uid LIMIT 1"),
            {"sid": school_id, "uid": user_id},
        )
        if not res_mem.fetchone():
            await db.execute(
                text("""
                    INSERT INTO public.school_memberships (id, school_id, user_id, status, created_at)
                    VALUES (:id, :sid, :uid, 'active', NOW())
                """),
                {"id": uuid.uuid4(), "sid": school_id, "uid": user_id},
            )
        else:
            await db.execute(
                text("UPDATE public.school_memberships SET status = 'active' WHERE school_id = :sid AND user_id = :uid"),
                {"sid": school_id, "uid": user_id},
            )

        res_ur = await db.execute(
            text("SELECT id FROM public.user_roles WHERE school_id = :sid AND user_id = :uid AND role = :role LIMIT 1"),
            {"sid": school_id, "uid": user_id, "role": assigned_role},
        )
        if not res_ur.fetchone():
            await db.execute(
                text("""
                    INSERT INTO public.user_roles (id, school_id, user_id, role, created_by, created_at)
                    VALUES (:id, :sid, :uid, :role, :aid, NOW())
                """),
                {"id": uuid.uuid4(), "sid": school_id, "uid": user_id, "role": assigned_role, "aid": actor_uid},
            )

    # 4. Mark Invitation Consumed
    await db.execute(
        text("""
            UPDATE public.user_invitations
            SET status = 'activated',
                consumed_at = NOW(),
                email_verified_at = NOW()
            WHERE id = :id
        """),
        {"id": invite.id},
    )

    user_id_str = str(user_id)

    # Log audit event within transaction
    await log_audit_event(
        db=db,
        action=AuditAction.LOGIN,
        resource_type="invitation",
        resource_id=str(invite.id),
        user_id=user_id,
        school_id=school_id,
        new_values={"activated": True, "email": clean_email, "role": assigned_role},
        request=request,
    )

    await db.commit()

    # Generate JWT Tokens for immediate seamless login
    access_token = create_access_token(user_id=user_id_str, email=clean_email)
    refresh_token = create_access_token(user_id=user_id_str, email=clean_email)

    # Fetch school slug for client redirection
    slug = "altrix"
    if school_id:
        res_sl = await db.execute(text("SELECT slug FROM public.schools WHERE id = :sid LIMIT 1"), {"sid": school_id})
        row_sl = res_sl.fetchone()
        if row_sl and row_sl.slug:
            slug = row_sl.slug

    return {
        "ok": True,
        "message": "Account successfully activated! Welcome to AltRix.",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user_id": user_id_str,
        "email": clean_email,
        "role": assigned_role,
        "schoolSlug": slug,
    }


@router.get(
    "/list",
    summary="List Tenant Invitations",
    description="Authorized admin retrieves all invitation records for their school.",
)
async def list_invitations(
    school_id: Optional[str] = Query(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_sid: Optional[uuid.UUID] = None
    if school_id:
        try:
            target_sid = uuid.UUID(school_id)
        except ValueError:
            pass
    elif current_user.school_id:
        try:
            target_sid = uuid.UUID(current_user.school_id)
        except ValueError:
            pass

    is_authorized = await _authorize_invite_manager(db, current_user.id, target_sid)
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Forbidden")

    query_str = """
        SELECT i.id, i.email, i.role, i.display_name, i.status, i.created_at, i.expires_at, i.opened_at, i.consumed_at,
               s.name as school_name, c.name as campus_name
        FROM public.user_invitations i
        LEFT JOIN public.schools s ON i.school_id = s.id
        LEFT JOIN public.campuses c ON i.campus_id = c.id
    """
    params = {}
    if target_sid:
        query_str += " WHERE i.school_id = :sid ORDER BY i.created_at DESC LIMIT 100"
        params["sid"] = target_sid
    else:
        query_str += " ORDER BY i.created_at DESC LIMIT 100"

    res = await db.execute(text(query_str), params)
    rows = res.fetchall()

    return [
        {
            "id": str(r.id),
            "email": r.email,
            "role": r.role,
            "displayName": r.display_name,
            "status": r.status,
            "schoolName": r.school_name,
            "campusName": r.campus_name,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
            "expiresAt": r.expires_at.isoformat() if r.expires_at else None,
            "openedAt": r.opened_at.isoformat() if r.opened_at else None,
            "consumedAt": r.consumed_at.isoformat() if r.consumed_at else None,
        }
        for r in rows
    ]


@router.post(
    "/resend",
    summary="Resend Staff Invitation",
    description="Invalidates the previous token, generates a fresh token with +48h expiry, and dispatches a new invitation email.",
)
async def resend_invitation(
    body: InvitationActionRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        inv_id = uuid.UUID(body.invitationId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invitation ID")

    res = await db.execute(
        text("""
            SELECT i.id, i.email, i.role, i.display_name, i.school_id, i.status,
                   s.name as school_name
            FROM public.user_invitations i
            LEFT JOIN public.schools s ON i.school_id = s.id
            WHERE i.id = :id
            LIMIT 1
        """),
        {"id": inv_id},
    )
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")

    is_authorized = await _authorize_invite_manager(db, current_user.id, row.school_id)
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Generate new token
    new_token = secrets.token_urlsafe(48)
    new_expires = datetime.now(timezone.utc) + timedelta(hours=48)

    await db.execute(
        text("""
            UPDATE public.user_invitations
            SET token = :token,
                expires_at = :expires_at,
                status = 'sent',
                created_at = NOW()
            WHERE id = :id
        """),
        {"token": new_token, "expires_at": new_expires, "id": inv_id},
    )
    await db.commit()

    activation_link = f"https://altrixcore.com/activate-account/{new_token}"
    email_result = await CentralEmailService.send_event(
        event_name="staff_invitation",
        recipient=row.email,
        context={
            "name": row.display_name or row.email.split("@")[0],
            "tenant_name": row.school_name or "AltRix Institute",
            "role": row.role.replace("_", " ").title(),
            "activation_link": activation_link,
            "expires_in": "48 hours",
            "support_email": "support@altrixcore.com",
        },
        db=db,
    )

    return {
        "ok": True,
        "message": f"Invitation resent to {row.email}",
        "expiresAt": new_expires.isoformat(),
        "emailDispatched": email_result["ok"],
    }


@router.post(
    "/revoke",
    summary="Revoke Staff Invitation",
    description="Revokes an active invitation so the token can no longer be used.",
)
async def revoke_invitation(
    body: InvitationActionRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        inv_id = uuid.UUID(body.invitationId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invitation ID")

    res = await db.execute(
        text("SELECT school_id, status, email FROM public.user_invitations WHERE id = :id LIMIT 1"),
        {"id": inv_id},
    )
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")

    is_authorized = await _authorize_invite_manager(db, current_user.id, row.school_id)
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Forbidden")

    actor_uid = uuid.UUID(current_user.id) if isinstance(current_user.id, str) else current_user.id

    await db.execute(
        text("""
            UPDATE public.user_invitations
            SET status = 'revoked',
                revoked_at = NOW(),
                revoked_by_user_id = :aid
            WHERE id = :id
        """),
        {"id": inv_id, "aid": actor_uid},
    )
    await db.commit()

    return {"ok": True, "message": f"Invitation for {row.email} revoked successfully."}


@router.put(
    "/update",
    summary="Update Pending Staff Invitation",
    description="Updates role, display name, or campus assignment for an existing pending invitation.",
)
async def update_invitation(
    body: UpdateInvitationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        inv_id = uuid.UUID(body.invitationId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invitation ID")

    res = await db.execute(
        text("SELECT school_id, status, email FROM public.user_invitations WHERE id = :id LIMIT 1"),
        {"id": inv_id},
    )
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row.status not in ("pending", "sent", "opened"):
        raise HTTPException(status_code=400, detail=f"Cannot edit invitation in '{row.status}' status.")

    is_authorized = await _authorize_invite_manager(db, current_user.id, row.school_id)
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Forbidden")

    campus_uid = None
    if body.campusId:
        try:
            campus_uid = uuid.UUID(body.campusId)
        except ValueError:
            pass

    updates = []
    params: Dict[str, Any] = {"id": inv_id}

    if body.displayName is not None:
        updates.append("display_name = :dname")
        params["dname"] = body.displayName.strip()

    if body.role is not None:
        updates.append("role = :role")
        params["role"] = body.role.strip()

    if body.campusId is not None:
        updates.append("campus_id = :cid")
        params["cid"] = campus_uid

    if not updates:
        return {"ok": True, "message": "No updates provided."}

    sql = f"UPDATE public.user_invitations SET {', '.join(updates)} WHERE id = :id"
    await db.execute(text(sql), params)
    await db.commit()

    return {"ok": True, "message": f"Invitation for {row.email} updated successfully."}
