"""
Functions Router — VPS Native Implementation of System Functions.
Completely replaces Supabase Edge Functions with high-performance native FastAPI endpoints.
Handles staff governance, password management, user invites, bulk imports, and OTP/Password resets.
"""

import uuid
import logging
import json
from typing import Any, Dict, List, Optional
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, AuthenticatedUser, CurrentUser

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

    # The target must be someone this caller may manage: a member of this
    # school, below the caller's role, never a platform account, and (for a
    # password or email) not someone who also belongs to another school. This
    # checked only the caller, so any principal or HR manager could reset the
    # password or email of any account on the platform, and grant any role.
    from app.utils.accounts import check_governance_target
    if action in ("set_password", "set_roles", "set_email", "deactivate"):
        await check_governance_target(db, school_id, actor_uid, target_uid, action, body.roles)

    if action == "set_password":
        pwd = (body.password or "").strip()
        if len(pwd) < 8:
            return {"ok": False, "error": "Password must be at least 8 characters.", "traceId": trace_id}

        # Securely hash password in Python using bcrypt
        hashed_pwd = bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")

        # Update password in auth.users
        await db.execute(
            text("""
                UPDATE auth.users
                SET encrypted_password = :hashed_pwd,
                    updated_at = NOW()
                WHERE id = :target_id
            """),
            {"hashed_pwd": hashed_pwd, "target_id": target_uid}
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

    # The role must be one this caller may give (it was taken as sent: an HR
    # manager could invite someone as the school's owner).
    from app.utils.accounts import check_grantable, ensure_account
    await check_grantable(db, school_id, actor_uid, [body.role])

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
            school_id=school_id,
            db=db,
        )

        return {"ok": True, "userId": str(invitation_id), "status": "invited", "invitationId": str(invitation_id)}

    # Direct password creation. An account that already exists keeps its
    # password: this overwrote it, so entering any account's email here took
    # that account over.
    user_id, _created = await ensure_account(db, invite_email, pwd, body.displayName)

    # Upsert Membership
    await db.execute(
        text("""
            INSERT INTO public.school_memberships (school_id, user_id, status, created_at)
            VALUES (:sid, :uid, 'active', NOW())
            ON CONFLICT (school_id, user_id) DO UPDATE SET status = 'active'
        """),
        {"sid": school_id, "uid": user_id}
    )

    # Upsert User Role
    await db.execute(
        text("""
            INSERT INTO public.user_roles (school_id, user_id, role, created_by, created_at)
            VALUES (:sid, :uid, :role, :aid, NOW())
            ON CONFLICT (school_id, user_id, role) DO NOTHING
        """),
        {"sid": school_id, "uid": user_id, "role": body.role, "aid": actor_uid}
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
    from app.utils.accounts import check_grantable, check_governance_target, ensure_account, is_member

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

        # Only roles this caller may give (any role was taken as sent).
        try:
            await check_grantable(db, school_id, actor_uid, roles)
        except HTTPException as exc:
            results.append({"rowNumber": row_num, "email": row_email, "ok": False,
                            "errors": [exc.detail], "normalizedRoles": roles})
            continue

        if body.mode == "commit":
            # An existing account keeps its password (this overwrote it: an
            # import row with anyone's email took their account over), and a
            # member at or above the caller keeps their roles.
            try:
                uid, created = await ensure_account(db, row_email, pwd, dname)
                if not created and await is_member(db, school_id, uid):
                    await check_governance_target(db, school_id, actor_uid, uid, "set_roles", roles)
            except HTTPException as exc:
                results.append({"rowNumber": row_num, "email": row_email, "ok": False,
                                "errors": [exc.detail], "normalizedRoles": roles})
                continue
            if phone:
                await db.execute(
                    text("UPDATE public.profiles SET phone = COALESCE(phone, :phone) WHERE id = :uid"),
                    {"phone": phone, "uid": uid},
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


# ── Platform: schools ─────────────────────────────────────────────────────────
#
# Ported from supabase/functions. The platform's "Create school" form, and its
# "unlock bootstrap" button, called functions this server did not have, so a
# new school could not be created from the platform at all.


def _json(data: Dict[str, Any], status_code: int = 200):
    from fastapi.responses import JSONResponse
    return JSONResponse({"traceId": str(uuid.uuid4()), **data}, status_code=status_code)


async def _require_platform_admin(db: AsyncSession, user_id) -> None:
    from app.utils.accounts import is_platform_admin
    if not await is_platform_admin(db, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the platform administrator can do this.")


class CreateSchoolRequest(BaseModel):
    slug: str
    name: Optional[str] = None
    isActive: Optional[bool] = True
    principalEmail: str
    principalPassword: Optional[str] = None
    principalDisplayName: Optional[str] = None
    ownerUserId: Optional[str] = None
    ownerEmail: Optional[str] = None
    ownerPassword: Optional[str] = None
    ownerDisplayName: Optional[str] = None


async def _add_to_school(db: AsyncSession, school_id, user_id, role: str) -> None:
    await db.execute(
        text("INSERT INTO public.school_memberships (school_id, user_id, status) VALUES (:s, :u, 'active') "
             "ON CONFLICT (school_id, user_id) DO UPDATE SET status = 'active'"),
        {"s": school_id, "u": user_id},
    )
    await db.execute(
        text("INSERT INTO public.user_roles (school_id, user_id, role) VALUES (:s, :u, :r) "
             "ON CONFLICT (school_id, user_id, role) DO NOTHING"),
        {"s": school_id, "u": user_id, "r": role},
    )


@router.post("/eduverse-admin-create-school")
async def admin_create_school(
    body: CreateSchoolRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create (or update) a school with its first principal, and optionally its
    owner. An account that already exists is added to the school with its own
    password left as it is: the original reset it, so creating a school with
    someone's email as principal took their account over.
    """
    import re as _re
    from app.utils.accounts import ensure_account

    await _require_platform_admin(db, current_user.id)
    slug = _re.sub(r"[^a-z0-9-]", "", (body.slug or "").strip().lower())
    if not slug:
        return _json({"ok": False, "error": "Invalid slug"}, 400)
    name = (body.name or slug).strip()
    principal_email = (body.principalEmail or "").strip().lower()
    if "@" not in principal_email:
        return _json({"ok": False, "error": "Invalid principal email"}, 400)

    try:
        row = (await db.execute(
            text("INSERT INTO public.schools (id, slug, name, is_active, created_at, updated_at) "
                 "VALUES (gen_random_uuid(), :slug, :name, :active, NOW(), NOW()) "
                 "ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active, updated_at = NOW() "
                 "RETURNING id, slug, name, is_active"),
            {"slug": slug, "name": name, "active": body.isActive if body.isActive is not None else True},
        )).mappings().first()
        school = dict(row)
        school_id = school["id"]
        await db.execute(
            text("INSERT INTO public.school_branding (school_id) VALUES (:s) ON CONFLICT (school_id) DO NOTHING"),
            {"s": school_id},
        )

        principal_id, principal_created = await ensure_account(
            db, principal_email, body.principalPassword, body.principalDisplayName or "Principal")
        await _add_to_school(db, school_id, principal_id, "principal")

        owner_id = None
        owner_existed = False
        if body.ownerUserId:
            exists = (await db.execute(text("SELECT email FROM auth.users WHERE id = CAST(:u AS uuid)"),
                                       {"u": body.ownerUserId})).first()
            if not exists:
                await db.rollback()
                return _json({"ok": False, "error": f"Selected owner user does not exist (id={body.ownerUserId})."}, 404)
            owner_id = body.ownerUserId
        elif body.ownerEmail:
            owner_email = body.ownerEmail.strip().lower()
            if "@" not in owner_email:
                await db.rollback()
                return _json({"ok": False, "error": "Invalid owner email."}, 400)
            found = (await db.execute(text("SELECT id FROM auth.users WHERE LOWER(TRIM(email)) = :e LIMIT 1"),
                                      {"e": owner_email})).first()
            if not found and not body.ownerPassword:
                await db.rollback()
                return _json({
                    "ok": False, "code": "owner_email_not_found",
                    "error": f"No existing user found for {owner_email}. Provide a password to create a new owner "
                             "account, or pick from the existing owners list.",
                }, 404)
            owner_id, _ = await ensure_account(db, owner_email, body.ownerPassword, body.ownerDisplayName or "School Owner")

        if owner_id:
            owner_existed = (await db.execute(
                text("SELECT 1 FROM public.school_owner_assignments WHERE school_id = :s AND owner_user_id = CAST(:u AS uuid)"),
                {"s": school_id, "u": str(owner_id)},
            )).first() is not None
            await _add_to_school(db, school_id, owner_id, "school_owner")
            if not owner_existed:
                await db.execute(
                    text("INSERT INTO public.school_owner_assignments (school_id, owner_user_id, created_by) "
                         "VALUES (:s, CAST(:u AS uuid), CAST(:a AS uuid)) ON CONFLICT DO NOTHING"),
                    {"s": school_id, "u": str(owner_id), "a": str(current_user.id)},
                )

        await db.execute(
            text("INSERT INTO public.school_bootstrap (school_id, locked, bootstrapped_at) VALUES (:s, true, NOW()) "
                 "ON CONFLICT (school_id) DO UPDATE SET locked = true, bootstrapped_at = COALESCE(school_bootstrap.bootstrapped_at, NOW())"),
            {"s": school_id},
        )
        await db.execute(
            text("INSERT INTO public.audit_logs (school_id, actor_user_id, action, resource_type, entity_type, resource_id, entity_id, metadata) "
                 "VALUES (:s, CAST(:a AS uuid), 'school_created_direct', 'school', 'school', :slug, :slug, CAST(:m AS jsonb))"),
            {"s": school_id, "a": str(current_user.id), "slug": slug,
             "m": json.dumps({"principalEmail": principal_email, "principalAccountCreated": principal_created,
                              "ownerUserId": str(owner_id) if owner_id else None, "ownerAssignmentExisted": owner_existed})},
        )
        await db.commit()
    except HTTPException as exc:
        await db.rollback()
        return _json({"ok": False, "error": exc.detail}, exc.status_code)

    return _json({
        "ok": True,
        "school": {k: (str(v) if k == "id" else v) for k, v in school.items()},
        "principalUserId": str(principal_id),
        # An existing account keeps its own password; the form's password
        # applies only to a newly created one.
        "principalAccountCreated": principal_created,
        "ownerUserId": str(owner_id) if owner_id else None,
        "ownerAssignmentExisted": owner_existed,
    })


class UnlockBootstrapRequest(BaseModel):
    schoolSlug: str


@router.post("/eduverse-admin-unlock-bootstrap")
async def admin_unlock_bootstrap(
    body: UnlockBootstrapRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_platform_admin(db, current_user.id)
    slug = (body.schoolSlug or "").strip().lower()
    school = (await db.execute(text("SELECT id, slug, name FROM public.schools WHERE slug = :s"), {"s": slug})).mappings().first()
    if not school:
        return _json({"ok": False, "error": "School not found"}, 404)
    await db.execute(
        text("INSERT INTO public.school_bootstrap (school_id, locked, bootstrapped_at) VALUES (:s, false, NULL) "
             "ON CONFLICT (school_id) DO UPDATE SET locked = false, bootstrapped_at = NULL"),
        {"s": school["id"]},
    )
    await db.execute(
        text("INSERT INTO public.audit_logs (school_id, actor_user_id, action, resource_type, entity_type, resource_id, entity_id, metadata) "
             "VALUES (:s, CAST(:a AS uuid), 'bootstrap_unlocked', 'school', 'school', :slug, :slug, '{}'::jsonb)"),
        {"s": school["id"], "a": str(current_user.id), "slug": slug},
    )
    await db.commit()
    return _json({"ok": True, "school": {"id": str(school["id"]), "slug": school["slug"], "name": school["name"]}})


#: Functions deliberately not carried over from Supabase, with the reason the
#: caller shows instead of "not implemented".
_NOT_OFFERED = {
    "eduverse-bootstrap": (
        "Schools are set up by the platform administrator (Platform, Schools, Create school). "
        "Setting up a school from its own page with a shared secret made the person a platform "
        "administrator, so it is not offered."
    ),
    "eduverse-recover-master": (
        "The platform account is recovered with a password reset from the sign-in page. Creating a "
        "new platform administrator with a shared secret is not offered."
    ),
    "eduverse-admin-impersonate": (
        "Signing in as another user is not available. Reset their password or check their screens "
        "with them instead."
    ),
}


@router.post("/eduverse-bootstrap")
@router.post("/eduverse-recover-master")
@router.post("/eduverse-admin-impersonate")
async def not_offered(request: Request):
    name = request.url.path.rstrip("/").rsplit("/", 1)[-1]
    return _json({"ok": False, "code": "not_offered", "error": _NOT_OFFERED.get(name, "Not available.")}, 410)


# ── Early warnings ────────────────────────────────────────────────────────────
#
# Ported from supabase/functions/ai-early-warning (rule-based; it never used a
# model). Nothing on this server wrote ai_early_warnings, so every Early
# Warning panel said "All Clear!" for every school. Changes from the original:
# a student with no attendance records is not "100% present" (no dropout
# check without records); behaviour concerns are the note types this school
# records (concern, incident); missing work is counted from assignments due
# for the student's section with no submission (no row says "missing"); all
# students, not the first 50; and only staff of the caller's own school.

class EarlyWarningRequest(BaseModel):
    schoolId: Optional[str] = None


_EWS_SQL = """
WITH roll AS (
    SELECT s.id, trim(concat_ws(' ', s.first_name, s.last_name)) AS name, s.campus_id
    FROM public.students s
    WHERE s.school_id = CAST(:sid AS uuid)
      AND (s.status IS NULL OR s.status NOT IN ('inactive', 'withdrawn', 'graduated', 'deleted'))
),
att AS (
    SELECT a.student_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE a.status IN ('present', 'late')) AS present,
           COUNT(*) FILTER (WHERE a.status = 'absent') AS absent
    FROM public.attendance_entries a
    WHERE a.school_id = CAST(:sid AS uuid) AND a.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY a.student_id
),
marks AS (
    SELECT student_id, COUNT(*) AS n, AVG(pct) AS avg_pct
    FROM (
        SELECT m.student_id, (m.marks / NULLIF(COALESCE(m.max_marks, aa.max_marks), 0)) * 100 AS pct,
               ROW_NUMBER() OVER (PARTITION BY m.student_id ORDER BY m.created_at DESC) AS rn
        FROM public.student_marks m
        LEFT JOIN public.academic_assessments aa ON aa.id = m.assessment_id
        WHERE m.school_id = CAST(:sid AS uuid) AND m.marks IS NOT NULL
    ) x
    WHERE rn <= 10 AND pct IS NOT NULL
    GROUP BY student_id
),
beh AS (
    SELECT b.student_id, COUNT(*) AS concerns
    FROM public.behavior_notes b
    WHERE b.school_id = CAST(:sid AS uuid) AND b.created_at >= NOW() - INTERVAL '30 days'
      AND lower(b.note_type) IN ('concern', 'incident', 'warning')
    GROUP BY b.student_id
),
missing AS (
    SELECT e.student_id, COUNT(*) AS n
    FROM public.student_enrollments e
    JOIN public.assignments asg ON asg.class_section_id = e.class_section_id
    WHERE e.school_id = CAST(:sid AS uuid) AND e.end_date IS NULL
      AND asg.due_date >= NOW() - INTERVAL '30 days' AND asg.due_date < NOW()
      AND NOT EXISTS (SELECT 1 FROM public.assignment_submissions sub
                      WHERE sub.assignment_id = asg.id AND sub.student_id = e.student_id)
    GROUP BY e.student_id
)
SELECT r.id, r.name, r.campus_id,
       att.total AS att_total, att.present AS att_present, att.absent AS att_absent,
       marks.n AS marks_n, marks.avg_pct,
       COALESCE(beh.concerns, 0) AS concerns,
       COALESCE(missing.n, 0) AS missing
FROM roll r
LEFT JOIN att ON att.student_id = r.id
LEFT JOIN marks ON marks.student_id = r.id
LEFT JOIN beh ON beh.student_id = r.id
LEFT JOIN missing ON missing.student_id = r.id
"""


def early_warnings_for(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The warnings one student's figures call for (the original rules)."""
    out: List[Dict[str, Any]] = []
    name = row["name"] or "Student"
    total = int(row.get("att_total") or 0)
    if total:
        rate = int(row["att_present"] or 0) * 100.0 / total
        absent = int(row["att_absent"] or 0)
        # A rate from one or two marked days is not a pattern: one absence out
        # of one day read as "0%, critical dropout risk".
        if (total >= 5 and rate < 70) or absent > 10:
            out.append({
                "warning_type": "dropout_risk",
                "severity": "critical" if rate < 50 else "high" if rate < 60 else "medium",
                "title": f"Dropout Risk: {name}",
                "description": f"Attendance rate is {rate:.0f}% with {absent} absences in the last 30 days.",
                "detected_patterns": [f"Attendance rate: {rate:.0f}%", f"Absences: {absent}"],
                "recommended_actions": ["Schedule parent meeting", "Assign a mentor teacher", "Review home situation"],
            })
    n = int(row.get("marks_n") or 0)
    if n >= 3 and row.get("avg_pct") is not None and float(row["avg_pct"]) < 40:
        avg = float(row["avg_pct"])
        out.append({
            "warning_type": "academic_decline",
            "severity": "critical" if avg < 30 else "high",
            "title": f"Academic Decline: {name}",
            "description": f"Average of the last {n} marks is {avg:.0f}%.",
            "detected_patterns": [f"Current average: {avg:.0f}%", f"Assessments analysed: {n}"],
            "recommended_actions": ["Provide remedial classes", "Assign peer tutor", "Review learning style"],
        })
    concerns = int(row.get("concerns") or 0)
    if concerns >= 3:
        out.append({
            "warning_type": "emotional_stress",
            "severity": "high" if concerns >= 5 else "medium",
            "title": f"Emotional Concern: {name}",
            "description": f"{concerns} concern or incident notes in the last 30 days.",
            "detected_patterns": [f"Concern notes: {concerns}"],
            "recommended_actions": ["Schedule counseling session", "Inform parents", "Monitor closely"],
        })
    missing = int(row.get("missing") or 0)
    if missing >= 3:
        out.append({
            "warning_type": "engagement_drop",
            "severity": "high" if missing >= 5 else "medium",
            "title": f"Engagement Drop: {name}",
            "description": f"{missing} assignments due in the last 30 days were not handed in.",
            "detected_patterns": [f"Missing submissions: {missing}"],
            "recommended_actions": ["Check with class teacher", "Review workload", "Contact parents"],
        })
    return out


async def _staff_school(db: AsyncSession, current_user, requested: Optional[str]):
    """The caller's school, for a member of its staff (never a family account)."""
    from app.utils.accounts import is_platform_admin
    school_id = current_user.school_id
    if requested and str(requested) != str(school_id):
        if not await is_platform_admin(db, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That is not your school.")
        school_id = requested
    if not school_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No school selected.")
    roles = set(current_user.roles or [])
    if not (roles - {"parent", "student"}) and not await is_platform_admin(db, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only staff can do this.")
    return school_id


@router.post("/ai-early-warning")
async def ai_early_warning(
    body: EarlyWarningRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    school_id = await _staff_school(db, current_user, body.schoolId)
    rows = (await db.execute(text(_EWS_SQL), {"sid": str(school_id)})).mappings().all()
    active = {
        (str(r[0]), r[1]) for r in (await db.execute(
            text("SELECT student_id, warning_type FROM public.ai_early_warnings "
                 "WHERE school_id = CAST(:sid AS uuid) AND status = 'active'"),
            {"sid": str(school_id)},
        )).fetchall()
    }
    generated: List[Dict[str, Any]] = []
    created = 0
    for row in rows:
        for w in early_warnings_for(dict(row)):
            w = {**w, "student_id": str(row["id"]), "student_name": row["name"]}
            generated.append(w)
            if (w["student_id"], w["warning_type"]) in active:
                continue  # already raised and not yet dealt with
            await db.execute(
                text("INSERT INTO public.ai_early_warnings (school_id, campus_id, student_id, warning_type, severity, "
                     "title, description, detected_patterns, recommended_actions, status) VALUES "
                     "(CAST(:sid AS uuid), :cid, CAST(:stu AS uuid), :wt, :sev, :title, :descr, :pat, :act, 'active')"),
                {"sid": str(school_id), "cid": row["campus_id"], "stu": w["student_id"], "wt": w["warning_type"],
                 "sev": w["severity"], "title": w["title"], "descr": w["description"],
                 "pat": w["detected_patterns"], "act": w["recommended_actions"]},
            )
            created += 1
    await db.commit()
    return {
        "success": True,
        "students_checked": len(rows),
        "warnings_generated": len(generated),
        "new_warnings": created,
        "warnings": generated[:20],
    }


# ── Teacher and student analysis ──────────────────────────────────────────────
#
# Ported from supabase/functions/ai-teacher-analyzer and ai-student-analyzer,
# which sent a few counts to a paid AI gateway (gone) and stored whatever
# scores it returned: a "feedback sentiment" with no feedback collected, a
# student's "personality type" and "learning style" from their marks. Here
# every figure is measured from the school's records and says how; what the
# records cannot tell is left empty.

_GOVERN_STAFF = {"super_admin", "school_owner", "principal", "vice_principal", "school_admin",
                 "academic_coordinator", "hr_manager"}


def _pct(num, den) -> Optional[float]:
    return round(float(num) * 100.0 / float(den), 1) if den else None


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, v))


class TeacherAnalyzerRequest(BaseModel):
    schoolId: Optional[str] = None
    teacherUserId: str


@router.post("/ai-teacher-analyzer")
async def ai_teacher_analyzer(
    body: TeacherAnalyzerRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    school_id = await _staff_school(db, current_user, body.schoolId)
    if str(body.teacherUserId) != str(current_user.id) and not (set(current_user.roles or []) & _GOVERN_STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can analyse only your own teaching.")
    p = {"sid": str(school_id), "tid": str(body.teacherUserId)}
    att = (await db.execute(text(
        "SELECT COUNT(DISTINCT s.id) AS sessions, COUNT(e.id) AS entries, "
        "COUNT(e.id) FILTER (WHERE e.status IN ('present','late')) AS present "
        "FROM public.attendance_sessions s LEFT JOIN public.attendance_entries e ON e.session_id = s.id "
        "WHERE s.school_id = CAST(:sid AS uuid) AND s.created_by = CAST(:tid AS uuid) "
        "AND s.created_at >= NOW() - INTERVAL '30 days'"), p)).mappings().first()
    res = (await db.execute(text(
        "SELECT COUNT(*) AS n, AVG(m.marks / NULLIF(COALESCE(m.max_marks, a.max_marks), 0) * 100) AS avg_pct "
        "FROM public.student_marks m JOIN public.academic_assessments a ON a.id = m.assessment_id "
        "WHERE m.school_id = CAST(:sid AS uuid) AND a.created_by = CAST(:tid AS uuid) AND m.marks IS NOT NULL"), p)).mappings().first()
    work = (await db.execute(text(
        "SELECT COUNT(*) FROM public.assignments WHERE school_id = CAST(:sid AS uuid) "
        "AND teacher_user_id = CAST(:tid AS uuid) AND created_at >= NOW() - INTERVAL '30 days'"), p)).scalar() or 0
    notes = (await db.execute(text(
        "SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE lower(note_type) = 'positive') AS positive "
        "FROM public.behavior_notes WHERE school_id = CAST(:sid AS uuid) AND teacher_user_id = CAST(:tid AS uuid) "
        "AND created_at >= NOW() - INTERVAL '30 days'"), p)).mappings().first()

    attendance_score = _pct(att["present"], att["entries"])
    results_score = round(float(res["avg_pct"]), 1) if res["n"] and res["avg_pct"] is not None else None
    parts = [s for s in (attendance_score, results_score) if s is not None]
    overall = round(sum(parts) / len(parts), 1) if parts else None
    facts = []
    if attendance_score is not None:
        facts.append(f"Attendance in your classes {attendance_score:.0f}% over the last 30 days ({att['sessions']} registers).")
    if results_score is not None:
        facts.append(f"Average mark on your assessments {results_score:.0f}% ({res['n']} marks).")
    facts.append(f"{work} assignments set and {notes['n']} behaviour notes written in the last 30 days"
                 f" ({notes['positive']} positive).")
    analysis = {
        "method": "overall = mean of attendance and results where each exists; engagement is not measured",
        "sessions_30d": att["sessions"], "attendance_entries": att["entries"], "present": att["present"],
        "marks_counted": res["n"], "assignments_30d": work, "behavior_notes_30d": notes["n"],
        "positive_notes_30d": notes["positive"],
    }
    values = {
        "sid": str(school_id), "tid": str(body.teacherUserId), "att": attendance_score, "res": results_score,
        "overall": overall, "train": (overall is not None and overall < 50),
        "fb": " ".join(facts), "data": json.dumps(analysis),
    }
    updated = await db.execute(text(
        "UPDATE public.ai_teacher_performance SET attendance_score = :att, results_score = :res, engagement_score = NULL, "
        "overall_score = :overall, needs_training = :train, feedback = :fb, analysis_data = CAST(:data AS jsonb), "
        "last_analyzed_at = NOW(), updated_at = NOW() "
        "WHERE school_id = CAST(:sid AS uuid) AND teacher_user_id = CAST(:tid AS uuid)"), values)
    if not updated.rowcount:
        await db.execute(text(
            "INSERT INTO public.ai_teacher_performance (school_id, teacher_user_id, attendance_score, results_score, "
            "overall_score, needs_training, feedback, analysis_data, last_analyzed_at) VALUES (CAST(:sid AS uuid), "
            "CAST(:tid AS uuid), :att, :res, :overall, :train, :fb, CAST(:data AS jsonb), NOW())"), values)
    await db.commit()
    return {"success": True, "performanceData": {
        "overall_score": overall, "attendance_score": attendance_score, "results_score": results_score,
        "feedback": values["fb"], **analysis}}


class StudentAnalyzerRequest(BaseModel):
    schoolId: Optional[str] = None
    studentId: str
    analysisType: Optional[str] = None


def student_risk(att_pct: Optional[float], avg_pct: Optional[float], concerns: int) -> Optional[float]:
    """
    0 to 100, the worst of three stated risks: attendance (90% or better is 0,
    50% or worse is 100), marks (60% or better is 0, 20% or worse is 100) and
    conduct (20 per concern or incident note in 30 days). None with no records.
    """
    parts = []
    if att_pct is not None:
        parts.append(_clamp((90 - att_pct) * 2.5))
    if avg_pct is not None:
        parts.append(_clamp((60 - avg_pct) * 2.5))
    if concerns:
        parts.append(_clamp(concerns * 20.0))
    return round(max(parts), 0) if parts else None


@router.post("/ai-student-analyzer")
async def ai_student_analyzer(
    body: StudentAnalyzerRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    school_id = await _staff_school(db, current_user, body.schoolId)
    p = {"sid": str(school_id), "st": str(body.studentId)}
    student = (await db.execute(text(
        "SELECT id, campus_id FROM public.students WHERE id = CAST(:st AS uuid) AND school_id = CAST(:sid AS uuid)"),
        p)).mappings().first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in this school.")
    att = (await db.execute(text(
        "SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE status IN ('present','late')) AS present "
        "FROM public.attendance_entries WHERE student_id = CAST(:st AS uuid) AND school_id = CAST(:sid AS uuid) "
        "AND created_at >= NOW() - INTERVAL '60 days'"), p)).mappings().first()
    subjects = (await db.execute(text(
        "SELECT COALESCE(sub.name, 'Unassigned subject') AS subject, COUNT(*) AS n, "
        "AVG(m.marks / NULLIF(COALESCE(m.max_marks, a.max_marks), 0) * 100) AS avg_pct "
        "FROM public.student_marks m JOIN public.academic_assessments a ON a.id = m.assessment_id "
        "LEFT JOIN public.subjects sub ON sub.id = a.subject_id "
        "WHERE m.student_id = CAST(:st AS uuid) AND m.school_id = CAST(:sid AS uuid) AND m.marks IS NOT NULL "
        "GROUP BY 1 ORDER BY 3 DESC NULLS LAST"), p)).mappings().all()
    concerns = (await db.execute(text(
        "SELECT COUNT(*) FROM public.behavior_notes WHERE student_id = CAST(:st AS uuid) "
        "AND school_id = CAST(:sid AS uuid) AND lower(note_type) IN ('concern','incident','warning') "
        "AND created_at >= NOW() - INTERVAL '30 days'"), p)).scalar() or 0

    # Fewer than five marked days is not enough to judge attendance by.
    att_pct = _pct(att["present"], att["n"]) if (att["n"] or 0) >= 5 else None
    scored = [s for s in subjects if s["avg_pct"] is not None]
    total_marks = sum(int(s["n"]) for s in scored)
    avg_pct = (round(sum(float(s["avg_pct"]) * int(s["n"]) for s in scored) / total_marks, 1)
               if total_marks else None)
    strengths = [f"{s['subject']} ({float(s['avg_pct']):.0f}%)" for s in scored if float(s["avg_pct"]) >= 75]
    weaknesses = [f"{s['subject']} ({float(s['avg_pct']):.0f}%)" for s in scored if float(s["avg_pct"]) < 50]
    # Two or three marked days say nothing about attendance (as with the early
    # warnings): the rate counts toward risk from five days on.
    risk = student_risk(att_pct if int(att["n"] or 0) >= 5 else None, avg_pct, int(concerns))
    level = None if risk is None else "high" if risk >= 70 else "medium" if risk >= 40 else "low"
    analysis = {
        "method": student_risk.__doc__.strip().replace("\n    ", " "),
        "attendance_pct_60d": att_pct, "attendance_days": att["n"], "average_pct": avg_pct,
        "marks_counted": total_marks, "concern_notes_30d": int(concerns),
        "subjects": [{"subject": s["subject"], "marks": int(s["n"]),
                      "average_pct": round(float(s["avg_pct"]), 1)} for s in scored],
        "not_measured": ["learning style", "personality"],
    }
    values = {
        "sid": str(school_id), "st": str(body.studentId), "cid": student["campus_id"], "risk": risk, "level": level,
        "strengths": strengths, "weaknesses": weaknesses,
        "counsel": int(concerns) >= 3, "support": bool(weaknesses) or (avg_pct is not None and avg_pct < 50),
        "data": json.dumps(analysis),
    }
    updated = await db.execute(text(
        "UPDATE public.ai_student_profiles SET risk_score = :risk, risk_level = :level, strengths = :strengths, "
        "weaknesses = :weaknesses, needs_counseling = :counsel, needs_extra_support = :support, learning_style = NULL, "
        "personality_type = NULL, analysis_data = CAST(:data AS jsonb), last_analyzed_at = NOW(), updated_at = NOW() "
        "WHERE school_id = CAST(:sid AS uuid) AND student_id = CAST(:st AS uuid)"), values)
    if not updated.rowcount:
        await db.execute(text(
            "INSERT INTO public.ai_student_profiles (school_id, campus_id, student_id, risk_score, risk_level, strengths, "
            "weaknesses, needs_counseling, needs_extra_support, analysis_data, last_analyzed_at) VALUES "
            "(CAST(:sid AS uuid), :cid, CAST(:st AS uuid), :risk, :level, :strengths, :weaknesses, :counsel, :support, "
            "CAST(:data AS jsonb), NOW())"), values)
    await db.commit()
    return {"success": True, "profile": {"risk_score": risk, "risk_level": level, "strengths": strengths,
                                         "weaknesses": weaknesses, **analysis}}


@router.post("/{function_name}")
async def generic_function_handler(
    function_name: str,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Catch-all for function names that have no implementation.

    This used to answer ``{"ok": true, "status": "executed"}`` to any caller,
    unauthenticated, for any name — so a typo in a caller, or a function that was
    never ported, reported success while nothing ran. It now authenticates and
    reports the failure honestly so the caller can handle it.
    """
    logger.warning(
        f"Unimplemented function '{function_name}' invoked by user {current_user.id}"
    )
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Function '{function_name}' is not implemented.",
    )
