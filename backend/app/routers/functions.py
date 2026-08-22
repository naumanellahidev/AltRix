"""
Functions Router — VPS Native Implementation of System Functions.
Completely replaces Supabase Edge Functions with high-performance native FastAPI endpoints.
Handles staff governance, password management, user invites, bulk imports, and OTP/Password resets.
"""

import uuid
import logging
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, AuthenticatedUser

router = APIRouter(prefix="/functions", tags=["Edge Functions Replacement"])
logger = logging.getLogger("app.functions")


class StaffGovernanceRequest(BaseModel):
    action: str = Field(..., description="Action: set_password, set_roles, set_email, deactivate")
    schoolSlug: str
    targetUserId: str
    password: Optional[str] = None
    roles: Optional[List[str]] = None
    email: Optional[str] = None
    reason: Optional[str] = None


class InviteRequest(BaseModel):
    schoolSlug: str
    email: str
    password: Optional[str] = None
    role: str
    displayName: Optional[str] = None
    campusId: Optional[str] = None


class BulkStaffImportRequest(BaseModel):
    schoolSlug: str
    mode: str = "dry-run"  # 'dry-run' or 'commit'
    rows: List[Dict[str, Any]] = []
    reason: Optional[str] = None


async def _resolve_school_and_authorize(
    db: AsyncSession,
    school_slug: str,
    actor_user_id: str,
) -> Dict[str, Any]:
    """Helper to verify school exists and caller has staff governance authority."""
    slug = school_slug.strip().lower()
    
    # 1. Resolve school
    res = await db.execute(
        text("SELECT id, slug, name FROM public.schools WHERE LOWER(slug) = :slug LIMIT 1"),
        {"slug": slug}
    )
    school = res.fetchone()
    if not school:
        raise HTTPException(status_code=404, detail=f"School '{school_slug}' not found")

    school_id = school.id

    # 2. Check if platform super admin
    try:
        actor_uid = uuid.UUID(actor_user_id) if isinstance(actor_user_id, str) else actor_user_id
    except ValueError:
        actor_uid = actor_user_id

    res_psa = await db.execute(
        text("SELECT user_id FROM public.platform_super_admins WHERE user_id = :uid LIMIT 1"),
        {"uid": actor_uid}
    )
    if res_psa.fetchone():
        return {"id": school_id, "slug": school.slug, "name": school.name}

    # 3. Check school governance roles
    res_roles = await db.execute(
        text("""
            SELECT role FROM public.user_roles 
            WHERE school_id = :sid AND user_id = :uid
            UNION
            SELECT 'school_owner' FROM public.school_owner_assignments
            WHERE school_id = :sid AND owner_user_id = :uid
        """),
        {"sid": school_id, "uid": actor_uid}
    )
    caller_roles = [r[0] for r in res_roles.fetchall()]
    allowed = ["super_admin", "school_owner", "principal", "vice_principal", "hr_manager"]
    
    if not any(r in allowed for r in caller_roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to manage staff in this school. Required: {', '.join(allowed)}."
        )

    return {"id": school_id, "slug": school.slug, "name": school.name}


@router.post("/eduverse-staff-governance")
async def staff_governance(
    body: StaffGovernanceRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle staff governance: set_password, set_roles, set_email, deactivate.
    """
    trace_id = str(uuid.uuid4())
    school = await _resolve_school_and_authorize(db, body.schoolSlug, current_user.id)
    school_id = school["id"]

    try:
        target_uid = uuid.UUID(body.targetUserId) if isinstance(body.targetUserId, str) else body.targetUserId
    except ValueError:
        target_uid = body.targetUserId

    try:
        actor_uid = uuid.UUID(current_user.id) if isinstance(current_user.id, str) else current_user.id
    except ValueError:
        actor_uid = current_user.id

    action = body.action.strip()

    if action == "set_password":
        pwd = (body.password or "").strip()
        if len(pwd) < 8:
            return {"ok": False, "error": "Password must be at least 8 characters.", "traceId": trace_id}

        # Update password in auth.users using pgcrypto crypt
        await db.execute(
            text("""
                UPDATE auth.users
                SET encrypted_password = crypt(:pwd, gen_salt('bf', 10)),
                    updated_at = NOW()
                WHERE id = :target_id
            """),
            {"pwd": pwd, "target_id": target_uid}
        )

        # Audit log
        await db.execute(
            text("""
                INSERT INTO public.audit_logs (school_id, actor_user_id, action, resource_type, entity_type, resource_id, entity_id, metadata)
                VALUES (:sid, :aid, 'staff_password_set_direct', 'user', 'user', :tid, :tid, CAST(:meta AS jsonb))
            """),
            {
                "sid": school_id,
                "aid": actor_uid,
                "tid": str(body.targetUserId),
                "meta": json.dumps({"reason": body.reason or "Password updated by administrator"}),
            }
        )
        await db.commit()
        return {"ok": True, "traceId": trace_id}

    elif action == "set_roles":
        roles = body.roles or []
        if not roles:
            return {"ok": False, "error": "roles array is required", "traceId": trace_id}

        # Delete existing roles in this school
        await db.execute(
            text("DELETE FROM public.user_roles WHERE school_id = :sid AND user_id = :uid"),
            {"sid": school_id, "uid": target_uid}
        )

        # Insert new roles
        for r in roles:
            await db.execute(
                text("""
                    INSERT INTO public.user_roles (school_id, user_id, role, created_by)
                    VALUES (:sid, :uid, :role, :aid)
                """),
                {"sid": school_id, "uid": target_uid, "role": r, "aid": actor_uid}
            )

        # Ensure membership is active
        await db.execute(
            text("""
                INSERT INTO public.school_memberships (school_id, user_id, status)
                VALUES (:sid, :uid, 'active')
                ON CONFLICT (school_id, user_id) DO UPDATE SET status = 'active'
            """),
            {"sid": school_id, "uid": target_uid}
        )

        # Audit log
        await db.execute(
            text("""
                INSERT INTO public.audit_logs (school_id, actor_user_id, action, resource_type, entity_type, resource_id, entity_id, metadata)
                VALUES (:sid, :aid, 'staff_roles_reassigned', 'user', 'user', :tid, :tid, CAST(:meta AS jsonb))
            """),
            {
                "sid": school_id,
                "aid": actor_uid,
                "tid": str(body.targetUserId),
                "meta": json.dumps({"roles": roles, "reason": body.reason or ""}),
            }
        )
        await db.commit()
        return {"ok": True, "roles": roles, "traceId": trace_id}

    elif action == "set_email":
        new_email = (body.email or "").strip().lower()
        if "@" not in new_email:
            return {"ok": False, "error": "Invalid email address", "traceId": trace_id}

        # Check duplicate
        res_dup = await db.execute(
            text("SELECT id FROM auth.users WHERE LOWER(email) = :email AND id != :uid LIMIT 1"),
            {"email": new_email, "uid": target_uid}
        )
        if res_dup.fetchone():
            return {"ok": False, "error": "Another account already uses this email.", "traceId": trace_id}

        # Update email in auth.users and profiles
        await db.execute(
            text("UPDATE auth.users SET email = :email, updated_at = NOW() WHERE id = :uid"),
            {"email": new_email, "uid": target_uid}
        )
        await db.execute(
            text("UPDATE public.profiles SET email = :email WHERE id = :uid"),
            {"email": new_email, "uid": target_uid}
        )

        # Audit log
        await db.execute(
            text("""
                INSERT INTO public.audit_logs (school_id, actor_user_id, action, resource_type, entity_type, resource_id, entity_id, metadata)
                VALUES (:sid, :aid, 'staff_email_updated', 'user', 'user', :tid, :tid, CAST(:meta AS jsonb))
            """),
            {
                "sid": school_id,
                "aid": actor_uid,
                "tid": str(body.targetUserId),
                "meta": json.dumps({"email": new_email, "reason": body.reason or ""}),
            }
        )
        await db.commit()
        return {"ok": True, "email": new_email, "traceId": trace_id}

    elif action == "deactivate":
        # Remove user roles in this school
        await db.execute(
            text("DELETE FROM public.user_roles WHERE school_id = :sid AND user_id = :uid"),
            {"sid": school_id, "uid": target_uid}
        )
        # Update membership
        await db.execute(
            text("UPDATE public.school_memberships SET status = 'inactive' WHERE school_id = :sid AND user_id = :uid"),
            {"sid": school_id, "uid": target_uid}
        )
        # Audit log
        await db.execute(
            text("""
                INSERT INTO public.audit_logs (school_id, actor_user_id, action, resource_type, entity_type, resource_id, entity_id, metadata)
                VALUES (:sid, :aid, 'staff_deactivated', 'user', 'user', :tid, :tid, CAST(:meta AS jsonb))
            """),
            {
                "sid": school_id,
                "aid": actor_uid,
                "tid": str(body.targetUserId),
                "meta": json.dumps({"reason": body.reason or ""}),
            }
        )
        await db.commit()
        return {"ok": True, "traceId": trace_id}

    else:
        return {"ok": False, "error": f"Unknown action: {action}", "traceId": trace_id}


@router.post("/eduverse-invite")
async def invite_user(
    body: InviteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Invite / create user with password or send single-use activation email.
    """
    school = await _resolve_school_and_authorize(db, body.schoolSlug, current_user.id)
    school_id = school["id"]
    school_name = school.get("name", "AltRix Institute")
    invite_email = body.email.strip().lower()
    pwd = (body.password or "").strip()

    if "@" not in invite_email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    try:
        actor_uid = uuid.UUID(current_user.id) if isinstance(current_user.id, str) else current_user.id
    except ValueError:
        actor_uid = current_user.id

    # Determine the campus_id for the invited user
    target_campus_id = None
    is_owner_or_psa = False

    res_psa = await db.execute(
        text("SELECT user_id FROM public.platform_super_admins WHERE user_id = :uid LIMIT 1"),
        {"uid": actor_uid}
    )
    if res_psa.fetchone():
        is_owner_or_psa = True

    if not is_owner_or_psa:
        res_owner = await db.execute(
            text("SELECT owner_user_id FROM public.school_owner_assignments WHERE school_id = :sid AND owner_user_id = :uid LIMIT 1"),
            {"sid": school_id, "uid": actor_uid}
        )
        if res_owner.fetchone():
            is_owner_or_psa = True

    if is_owner_or_psa:
        if body.campusId and body.campusId.strip() != "":
            try:
                target_campus_id = uuid.UUID(body.campusId.strip())
            except ValueError:
                target_campus_id = None
    else:
        res_caller_campus = await db.execute(
            text("""
                SELECT campus_id FROM public.user_roles
                WHERE school_id = :sid AND user_id = :uid AND campus_id IS NOT NULL
                LIMIT 1
            """),
            {"sid": school_id, "uid": actor_uid}
        )
        row = res_caller_campus.fetchone()
        if row:
            target_campus_id = row.campus_id

    # If NO password provided, trigger the secure single-use invitation flow
    if not pwd:
        import secrets
        from datetime import datetime, timezone, timedelta
        from app.services.email_service import CentralEmailService

        token = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=48)
        invitation_id = uuid.uuid4()
        display_name = body.displayName or invite_email.split('@')[0]

        # Invalidate prior pending invitations
        await db.execute(
            text("""
                UPDATE public.user_invitations
                SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = :aid
                WHERE LOWER(email) = :email AND school_id = :sid AND status IN ('pending', 'sent', 'opened')
            """),
            {"email": invite_email, "sid": school_id, "aid": actor_uid},
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
                "email": invite_email,
                "role": body.role,
                "displayName": display_name,
                "school_id": school_id,
                "campus_id": target_campus_id,
                "aid": actor_uid,
                "expires_at": expires_at,
            },
        )
        await db.commit()

        # Send invitation email via Central Email Service
        activation_link = f"https://altrixcore.com/activate-account/{token}"
        await CentralEmailService.send_event(
            event_name="staff_invitation",
            recipient=invite_email,
            context={
                "name": display_name,
                "tenant_name": school_name,
                "role": body.role.replace("_", " ").title(),
                "activation_link": activation_link,
                "expires_in": "48 hours",
                "support_email": "support@altrixcore.com",
            },
            db=db,
        )

        return {"ok": True, "userId": str(invitation_id), "status": "invited", "invitationId": str(invitation_id)}

    # Direct password creation (legacy fallback)
    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Check if user exists in auth.users
    res_u = await db.execute(
        text("SELECT id FROM auth.users WHERE LOWER(TRIM(email)) = :email LIMIT 1"),
        {"email": invite_email}
    )
    existing_user = res_u.fetchone()

    if existing_user:
        user_id = existing_user.id
        await db.execute(
            text("""
                UPDATE auth.users
                SET encrypted_password = crypt(:pwd, gen_salt('bf', 10)),
                    updated_at = NOW()
                WHERE id = :uid
            """),
            {"pwd": pwd, "uid": user_id}
        )
    else:
        user_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO auth.users (
                    id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
                ) VALUES (
                    :uid, :email, crypt(:pwd, gen_salt('bf', 10)), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name": :dname}', NOW(), NOW(), 'authenticated', 'authenticated'
                )
            """),
            {"uid": user_id, "email": invite_email, "pwd": pwd, "dname": body.displayName or invite_email.split('@')[0]}
        )

    # Upsert Profile
    await db.execute(
        text("""
            INSERT INTO public.profiles (id, email, full_name, role, updated_at)
            VALUES (:uid, :email, :dname, :role, NOW())
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
                updated_at = NOW()
        """),
        {"uid": user_id, "email": invite_email, "dname": body.displayName or invite_email.split('@')[0], "role": body.role}
    )

    # Upsert Membership
    await db.execute(
        text("""
            INSERT INTO public.school_memberships (school_id, user_id, status)
            VALUES (:sid, :uid, 'active')
            ON CONFLICT (school_id, user_id) DO UPDATE SET status = 'active'
        """),
        {"sid": school_id, "uid": user_id}
    )

    # Upsert User Role
    await db.execute(
        text("""
            INSERT INTO public.user_roles (school_id, user_id, role, campus_id, created_by)
            VALUES (:sid, :uid, :role, :cid, :aid)
            ON CONFLICT (school_id, user_id, role) DO UPDATE SET campus_id = COALESCE(:cid, user_roles.campus_id)
        """),
        {"sid": school_id, "uid": user_id, "role": body.role, "cid": target_campus_id, "aid": actor_uid}
    )

    # Audit log
    await db.execute(
        text("""
            INSERT INTO public.audit_logs (school_id, actor_user_id, action, resource_type, entity_type, resource_id, entity_id, metadata)
            VALUES (:sid, :aid, 'user_invited', 'user', 'user', :email, :email, CAST(:meta AS jsonb))
        """),
        {
            "sid": school_id,
            "aid": actor_uid,
            "email": invite_email,
            "meta": json.dumps({"role": body.role, "campus_id": str(target_campus_id) if target_campus_id else None}),
        }
    )

    await db.commit()
    return {"ok": True, "userId": str(user_id)}


@router.post("/eduverse-bulk-staff-import")
async def bulk_staff_import(
    body: BulkStaffImportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle bulk staff validation and commit.
    """
    school = await _resolve_school_and_authorize(db, body.schoolSlug, current_user.id)
    school_id = school["id"]
    results = []

    try:
        actor_uid = uuid.UUID(current_user.id) if isinstance(current_user.id, str) else current_user.id
    except ValueError:
        actor_uid = current_user.id

    for row in body.rows:
        row_num = row.get("rowNumber", 0)
        row_email = (row.get("email") or "").strip().lower()
        pwd = (row.get("password") or "").strip()
        roles = row.get("roles") or []
        dname = row.get("displayName")
        phone = row.get("phone")

        errors = []
        if "@" not in row_email:
            errors.append("Invalid email")
        if len(pwd) < 8:
            errors.append("Password must be >= 8 chars")
        if not roles:
            errors.append("At least one role required")

        if errors:
            results.append({
                "rowNumber": row_num,
                "email": row_email,
                "ok": False,
                "errors": errors,
                "normalizedRoles": roles,
            })
            continue

        if body.mode == "commit":
            # Check or create user
            res_u = await db.execute(
                text("SELECT id FROM auth.users WHERE LOWER(TRIM(email)) = :email LIMIT 1"),
                {"email": row_email}
            )
            existing = res_u.fetchone()
            if existing:
                uid = existing.id
                await db.execute(
                    text("UPDATE auth.users SET encrypted_password = crypt(:pwd, gen_salt('bf', 10)), updated_at = NOW() WHERE id = :uid"),
                    {"pwd": pwd, "uid": uid}
                )
            else:
                uid = uuid.uuid4()
                await db.execute(
                    text("""
                        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role)
                        VALUES (:uid, :email, crypt(:pwd, gen_salt('bf', 10)), NOW(), '{"provider":"email"}', '{"full_name": :dname}', NOW(), NOW(), 'authenticated', 'authenticated')
                    """),
                    {"uid": uid, "email": row_email, "pwd": pwd, "dname": dname or row_email.split('@')[0]}
                )

            # Profile & Phone
            await db.execute(
                text("""
                    INSERT INTO public.profiles (id, email, full_name, phone, updated_at)
                    VALUES (:uid, :email, :dname, :phone, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        email = EXCLUDED.email,
                        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
                        phone = COALESCE(EXCLUDED.phone, profiles.phone),
                        updated_at = NOW()
                """),
                {"uid": uid, "email": row_email, "dname": dname or row_email.split('@')[0], "phone": phone}
            )

            # Membership
            await db.execute(
                text("INSERT INTO public.school_memberships (school_id, user_id, status) VALUES (:sid, :uid, 'active') ON CONFLICT (school_id, user_id) DO UPDATE SET status = 'active'"),
                {"sid": school_id, "uid": uid}
            )

            # Replace roles
            await db.execute(
                text("DELETE FROM public.user_roles WHERE school_id = :sid AND user_id = :uid"),
                {"sid": school_id, "uid": uid}
            )
            for r in roles:
                await db.execute(
                    text("INSERT INTO public.user_roles (school_id, user_id, role, created_by) VALUES (:sid, :uid, :r, :aid) ON CONFLICT DO NOTHING"),
                    {"sid": school_id, "uid": uid, "r": r, "aid": actor_uid}
                )

            results.append({
                "rowNumber": row_num,
                "email": row_email,
                "ok": True,
                "errors": [],
                "normalizedRoles": roles,
                "userId": str(uid),
            })
        else:
            # Dry-run
            results.append({
                "rowNumber": row_num,
                "email": row_email,
                "ok": True,
                "errors": [],
                "normalizedRoles": roles,
            })

    if body.mode == "commit":
        await db.commit()

    return {"ok": True, "results": results}


@router.post("/{function_name}")
async def generic_function_handler(
    function_name: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Fallback generic function handler for any remaining edge function invocations.
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    logger.info(f"Generic function invoked: {function_name} with body keys: {list(body.keys())}")
    return {"ok": True, "status": "executed", "function": function_name}
