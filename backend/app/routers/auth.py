"""
Auth router: login, logout, me, refresh, password reset, permissions, roles.
Production-hardened with:
- Rate limiting on login and password reset
- Audit logging for login/logout
- Redis caching for permissions and roles
- Token refresh via request body (secure)
"""
import logging
from datetime import datetime, timezone
from typing import List
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import text

from app.cache import (
    cache,
    cache_key_permissions,
    cache_key_roles,
    TTL_PERMISSIONS,
    TTL_USER_ROLES,
)
from app.config import settings
from app.dependencies import CurrentUser, DbSession
from app.schemas import (
    LoginRequest, LoginResponse, UserInfo, MessageResponse,
    SchoolPermissionsOut, UserRoleBriefOut, UserProfileOut
)
from app.utils.audit import log_audit_event, AuditAction
from app.utils.permissions import expand_roles
from app.utils.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("app.auth")


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="User login",
    description="Authenticate with email/password via Supabase. Returns JWT access and refresh tokens.",
)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, db: DbSession):
    """
    Login using email/password via Supabase Auth API.
    Rate limited: 5 attempts per minute per IP.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/token?grant_type=password",
            json={"email": body.email, "password": body.password},
            headers={
                "apikey": settings.supabase_anon_key,
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )

    if resp.status_code != 200:
        error_data = resp.json()
        # Log failed login attempt
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
            detail=error_data.get("error_description", "Invalid credentials"),
        )

    data = resp.json()
    access_token = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")
    user_data = data.get("user", {})
    user_id = user_data.get("id", "")
    email = user_data.get("email", "")

    # Log successful login
    await log_audit_event(
        db=db,
        action=AuditAction.LOGIN,
        resource_type="auth",
        resource_id=user_id,
        new_values={"success": True, "email": email},
        user_id=user_id,
        request=request,
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user_id,
        email=email,
        roles=[],
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="User logout",
    description="Invalidates the current Supabase session and logs the event.",
)
async def logout(request: Request, current_user: CurrentUser, db: DbSession):
    """Logout: invalidate Supabase session + audit log."""
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()

    if token:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.supabase_url}/auth/v1/logout",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                },
                timeout=5.0,
            )

        # Invalidate cached permissions/roles for this user
        await cache.delete(cache_key_permissions(str(current_user.id), str(current_user.school_id or "")))
        await cache.delete(cache_key_roles(str(current_user.id)))

    await log_audit_event(
        db=db,
        action=AuditAction.LOGOUT,
        resource_type="auth",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        school_id=current_user.school_id,
        request=request,
    )

    return MessageResponse(message="Logged out successfully")


@router.post(
    "/refresh",
    response_model=LoginResponse,
    summary="Refresh access token",
    description="Exchange a refresh token for a new access token.",
)
async def refresh_token(body: dict, request: Request):
    """
    Refresh the access token using a refresh token.
    Accepts JSON body: {"refresh_token": "..."}
    """
    token = body.get("refresh_token", "")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="refresh_token is required in request body",
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/token?grant_type=refresh_token",
            json={"refresh_token": token},
            headers={
                "apikey": settings.supabase_anon_key,
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    data = resp.json()
    user_data = data.get("user", {})
    return LoginResponse(
        access_token=data.get("access_token", ""),
        refresh_token=data.get("refresh_token", ""),
        user_id=user_data.get("id", ""),
        email=user_data.get("email", ""),
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


@router.post(
    "/password-reset-request",
    response_model=MessageResponse,
    summary="Request password reset",
    description="Sends a password reset email. Rate limited to 3 requests per 5 minutes per IP.",
)
@limiter.limit("3/5minutes")
async def request_password_reset(request: Request, email: str, db: DbSession):
    """Send a password reset email via Supabase Auth. Rate limited."""
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{settings.supabase_url}/auth/v1/recover",
            json={"email": email},
            headers={
                "apikey": settings.supabase_anon_key,
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )

    await log_audit_event(
        db=db,
        action=AuditAction.PASSWORD_RESET,
        resource_type="auth",
        resource_id=email,
        new_values={"email": email},
        request=request,
    )

    # Always return same message to prevent email enumeration
    return MessageResponse(message="If an account exists, a reset email will be sent")


@router.get(
    "/roles",
    summary="User roles across all schools",
    description="Returns all school memberships and roles for the current user.",
)
async def get_user_roles(current_user: CurrentUser, db: DbSession):
    """Return all roles for the current user across all schools. Cached."""
    cache_key = cache_key_roles(str(current_user.id))
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
    school_id_str = str(current_user.school_id or "")
    cache_key = cache_key_permissions(str(current_user.id), school_id_str)

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
    """Retrieve roles for a specific user and school."""
    try:
        result = await db.execute(
            text("SELECT role FROM user_roles WHERE school_id = :sid AND user_id = :uid"),
            {"sid": str(school_id), "uid": str(user_id)},
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

        return UserProfileOut(
            id=profile.id,
            email=profile.email,
            full_name=profile.full_name,
            display_name=profile.full_name,
            avatar_url=profile.avatar_url,
            phone=profile.phone,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"DB exception querying profile {user_id}: {e}")
        return UserProfileOut(
            id=user_id,
            email=current_user.email or "",
            full_name=None,
            display_name=None,
            avatar_url=None,
            phone=None,
        )
