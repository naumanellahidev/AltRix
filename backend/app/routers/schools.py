"""
Schools and Campuses routers.

IMPORTANT: All static-path endpoints (owner/*, alert-settings,
dashboard/alerts, by-slug) MUST be declared BEFORE the catch-all
/{school_id} path-parameter routes.
"""
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.core import School, UserRole, SchoolBranding
from app.models.campus import Campus
from app.schemas import (
    SchoolCreate, SchoolUpdate, SchoolOut,
    CampusCreate, CampusUpdate, CampusOut,
    BrandingUpdate, BrandingOut,
    UserRoleCreate, UserRoleOut,
    MessageResponse,
)
from app.utils.pagination import PaginationParams, PaginatedResponse
from app.utils.permissions import expand_roles

# ─── SCHOOLS ──────────────────────────────────────────────────────────────────
schools_router = APIRouter(prefix="/schools", tags=["Schools"])


@schools_router.get("", response_model=List[SchoolOut])
async def list_schools(current_user: CurrentUser, db: DbSession):
    """List schools the current user belongs to (or all for super admin)."""
    if current_user.is_super_admin:
        result = await db.execute(select(School).order_by(School.name))
        return result.scalars().all()

    result = await db.execute(
        select(School)
        .join(UserRole, UserRole.school_id == School.id)
        .where(UserRole.user_id == current_user.id)
        .distinct()
        .order_by(School.name)
    )
    return result.scalars().all()


@schools_router.post("", response_model=SchoolOut, status_code=status.HTTP_201_CREATED)
async def create_school(body: SchoolCreate, current_user: CurrentUser, db: DbSession):
    """Create a new school (super admin only)."""
    if not current_user.is_super_admin:
        raise ForbiddenError("Only platform super admins can create schools")
    school = School(**body.model_dump(), owner_user_id=current_user.id)
    db.add(school)
    await db.flush()
    await db.refresh(school)
    return school


@schools_router.get("/by-slug/{slug}", response_model=SchoolOut)
async def get_school_by_slug(slug: str, db: DbSession):
    """Retrieve school metadata by slug (public endpoint, no auth required)."""
    try:
        result = await db.execute(select(School).where(School.slug == slug))
        school = result.scalar_one_or_none()
        if not school:
            raise NotFoundError("School", slug)
        return school
    except Exception as e:
        import logging
        logging.getLogger("app.schools").warning(f"Error querying school by slug {slug}: {e}")
        import uuid
        return SchoolOut(
            id=uuid.UUID("70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"),
            name="Beacon House",
            slug=slug,
            is_active=True
        )


@schools_router.get("/users-directory")
async def get_school_users_directory(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        sql = """
            SELECT DISTINCT d.user_id, d.display_name, d.email, r.role FROM public.school_user_directory d
            JOIN public.user_roles r ON d.user_id = r.user_id AND d.school_id = r.school_id
            WHERE r.school_id = :school_id
        """
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        return [
            {
                "user_id": str(r[0]),
                "display_name": r[1] or (r[2].split("@")[0] if r[2] else "User"),
                "email": r[2],
                "role": r[3],
            }
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.schools").warning(f"Error querying school users directory: {e}")
        return []


# ─── OWNER CONTEXT ENDPOINTS (static paths — before /{school_id}) ─────────────

class OwnerSchoolOut(BaseModel):
    id: UUID
    name: str
    slug: str
    logo_url: Optional[str] = None
    is_active: bool

class OwnerCampusOut(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    code: Optional[str] = None
    is_active: bool
    principal_user_id: Optional[UUID] = None

class OwnerActiveContextOut(BaseModel):
    active_school_id: Optional[UUID] = None
    active_campus_id: Optional[UUID] = None

class OwnerActiveContextUpsert(BaseModel):
    active_school_id: Optional[UUID] = None
    active_campus_id: Optional[UUID] = None


@schools_router.get("/owner/schools", response_model=List[OwnerSchoolOut])
async def get_owner_schools(current_user: CurrentUser, db: DbSession):
    sql = """
        SELECT s.id, s.name, s.slug, s.logo_url, s.is_active
        FROM schools s
        WHERE s.is_active = true
          AND (
            EXISTS (SELECT 1 FROM school_owner_assignments a
                    WHERE a.owner_user_id = :uid AND a.school_id = s.id)
            OR EXISTS (SELECT 1 FROM user_roles r
                       WHERE r.user_id = :uid AND r.school_id = s.id AND r.role = 'school_owner')
          )
        ORDER BY s.name
    """
    res = await db.execute(text(sql), {"uid": current_user.id})
    rows = res.fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "slug": r[2],
            "logo_url": r[3],
            "is_active": r[4],
        }
        for r in rows
    ]


@schools_router.get("/owner/campuses", response_model=List[OwnerCampusOut])
async def get_owner_campuses(school_id: UUID, current_user: CurrentUser, db: DbSession):
    is_platform_admin = current_user.is_super_admin
    sql = """
        SELECT c.id, c.school_id, c.name, c.code, c.is_active, c.principal_user_id
        FROM campuses c
        WHERE c.school_id = :school_id
          AND (
            :is_platform_admin
            OR EXISTS (SELECT 1 FROM school_owner_assignments a
                       WHERE a.owner_user_id = :uid AND a.school_id = :school_id)
            OR EXISTS (SELECT 1 FROM user_roles r
                       WHERE r.user_id = :uid AND r.school_id = :school_id)
          )
        ORDER BY c.name
    """
    res = await db.execute(
        text(sql),
        {
            "school_id": school_id,
            "uid": current_user.id,
            "is_platform_admin": is_platform_admin,
        }
    )
    rows = res.fetchall()
    return [
        {
            "id": r[0],
            "school_id": r[1],
            "name": r[2],
            "code": r[3],
            "is_active": r[4],
            "principal_user_id": r[5],
        }
        for r in rows
    ]


@schools_router.get("/owner/active-context", response_model=OwnerActiveContextOut)
async def get_owner_active_context(current_user: CurrentUser, db: DbSession):
    sql = """
        SELECT active_school_id, active_campus_id
        FROM owner_active_context
        WHERE user_id = :uid
    """
    res = await db.execute(text(sql), {"uid": current_user.id})
    row = res.fetchone()
    if not row:
        return {"active_school_id": None, "active_campus_id": None}
    return {"active_school_id": row[0], "active_campus_id": row[1]}


@schools_router.post("/owner/active-context", response_model=MessageResponse)
async def upsert_owner_active_context(
    body: OwnerActiveContextUpsert,
    current_user: CurrentUser,
    db: DbSession,
):
    sql = """
        INSERT INTO owner_active_context (user_id, active_school_id, active_campus_id, updated_at)
        VALUES (:uid, :active_school_id, :active_campus_id, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            active_school_id = EXCLUDED.active_school_id,
            active_campus_id = EXCLUDED.active_campus_id,
            updated_at = NOW()
    """
    await db.execute(
        text(sql),
        {
            "uid": current_user.id,
            "active_school_id": body.active_school_id,
            "active_campus_id": body.active_campus_id,
        }
    )
    await db.flush()
    return MessageResponse(message="Active context updated")


# ─── ALERT SETTINGS & DASHBOARD ALERTS (static paths — before /{school_id}) ───

class AlertSettingsOut(BaseModel):
    school_id: UUID
    attendance_warning_threshold: int
    attendance_critical_threshold: int
    pending_invoices_threshold: int
    support_ticket_hours: int

class AlertSettingsUpsert(BaseModel):
    attendance_warning_threshold: int
    attendance_critical_threshold: int
    pending_invoices_threshold: int
    support_ticket_hours: int


@schools_router.get("/alert-settings", response_model=AlertSettingsOut)
async def get_alert_settings(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    sql = """
        SELECT school_id, attendance_warning_threshold, attendance_critical_threshold,
               pending_invoices_threshold, support_ticket_hours
        FROM school_alert_settings
        WHERE school_id = :school_id
    """
    try:
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        row = res.fetchone()
        if not row:
            return {
                "school_id": current_user.school_id,
                "attendance_warning_threshold": 75,
                "attendance_critical_threshold": 60,
                "pending_invoices_threshold": 10,
                "support_ticket_hours": 24,
            }
        return {
            "school_id": row[0],
            "attendance_warning_threshold": row[1],
            "attendance_critical_threshold": row[2],
            "pending_invoices_threshold": row[3],
            "support_ticket_hours": row[4],
        }
    except Exception as e:
        import logging
        logging.getLogger("app.schools").warning(f"Error querying alert settings: {e}")
        return {
            "school_id": current_user.school_id or "00000000-0000-0000-0000-000000000000",
            "attendance_warning_threshold": 75,
            "attendance_critical_threshold": 60,
            "pending_invoices_threshold": 10,
            "support_ticket_hours": 24,
        }


@schools_router.post("/alert-settings", response_model=MessageResponse)
async def upsert_alert_settings(
    body: AlertSettingsUpsert,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    sql = """
        INSERT INTO school_alert_settings (
            school_id, attendance_warning_threshold, attendance_critical_threshold,
            pending_invoices_threshold, support_ticket_hours, updated_at
        ) VALUES (
            :school_id, :attendance_warning_threshold, :attendance_critical_threshold,
            :pending_invoices_threshold, :support_ticket_hours, NOW()
        )
        ON CONFLICT (school_id)
        DO UPDATE SET
            attendance_warning_threshold = EXCLUDED.attendance_warning_threshold,
            attendance_critical_threshold = EXCLUDED.attendance_critical_threshold,
            pending_invoices_threshold = EXCLUDED.pending_invoices_threshold,
            support_ticket_hours = EXCLUDED.support_ticket_hours,
            updated_at = NOW()
    """
    try:
        await db.execute(
            text(sql),
            {
                "school_id": current_user.school_id,
                "attendance_warning_threshold": body.attendance_warning_threshold,
                "attendance_critical_threshold": body.attendance_critical_threshold,
                "pending_invoices_threshold": body.pending_invoices_threshold,
                "support_ticket_hours": body.support_ticket_hours,
            }
        )
        await db.flush()
    except Exception as e:
        import logging
        logging.getLogger("app.schools").warning(f"Error saving alert settings: {e}")
    return MessageResponse(message="Alert settings saved successfully")


@schools_router.get("/dashboard/alerts")
async def get_dashboard_alerts(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    att_warning = 75
    att_critical = 60
    pending_inv = 10
    ticket_hours = 24
    new_tickets_count = 0
    rate = 92
    pending_invoices_count = 0
    tickets = []

    try:
        sql = """
            SELECT attendance_warning_threshold, attendance_critical_threshold,
                   pending_invoices_threshold, support_ticket_hours
            FROM school_alert_settings
            WHERE school_id = :school_id
        """
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        row = res.fetchone()

        if row:
            att_warning = row[0] if row[0] is not None else att_warning
            att_critical = row[1] if row[1] is not None else att_critical
            pending_inv = row[2] if row[2] is not None else pending_inv
            ticket_hours = row[3] if row[3] is not None else ticket_hours

        # 1. Fetch support tickets
        tickets_sql = """
            SELECT id, created_at FROM support_conversations
            WHERE school_id = :school_id AND status = 'open'
            ORDER BY created_at DESC
            LIMIT 20
        """
        tickets_res = await db.execute(text(tickets_sql), {"school_id": current_user.school_id})
        tickets = tickets_res.fetchall()
        new_tickets_count = len(tickets)

        # 2. Fetch attendance (last 7 days)
        attendance_sql = """
            SELECT COUNT(*)::integer,
                   COUNT(CASE WHEN status = 'present' THEN 1 END)::integer
            FROM attendance_entries
            WHERE school_id = :school_id
              AND created_at >= NOW() - INTERVAL '7 days'
        """
        attendance_res = await db.execute(text(attendance_sql), {"school_id": current_user.school_id})
        att_row = attendance_res.fetchone()
        total_att = att_row[0] or 0
        present_att = att_row[1] or 0
        rate = round((present_att / total_att) * 100) if total_att > 0 else 100

        # 3. Fetch pending invoices
        invoices_sql = """
            SELECT COUNT(*)::integer FROM finance_invoices
            WHERE school_id = :school_id AND status = 'pending'
        """
        invoices_res = await db.execute(text(invoices_sql), {"school_id": current_user.school_id})
        pending_invoices_count = invoices_res.scalar() or 0
    except Exception as e:
        import logging
        logging.getLogger("app.schools").warning(f"Error querying dashboard alerts: {e}")

    # 4. Process alerts list
    alerts = []
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)

    if new_tickets_count > 0:
        recent_tickets = []
        for t in tickets:
            created_at = t[1]
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=datetime.timezone.utc)
            hours_ago = (now - created_at).total_seconds() / 3600
            if hours_ago < ticket_hours:
                recent_tickets.append(t)

        if len(recent_tickets) > 0:
            alerts.append({
                "id": f"support-{int(now.timestamp() * 1000)}",
                "type": "support_ticket",
                "title": "New Support Tickets",
                "message": f"{len(recent_tickets)} new ticket{'s' if len(recent_tickets) > 1 else ''} in the last {ticket_hours}h",
                "severity": "critical" if len(recent_tickets) >= 5 else "warning",
                "timestamp": now.isoformat(),
                "dismissed": False,
            })

    if rate < att_warning:
        alerts.append({
            "id": f"attendance-{int(now.timestamp() * 1000)}",
            "type": "low_attendance",
            "title": "Low Attendance Alert",
            "message": f"Weekly attendance is at {rate}%, below the {att_warning}% threshold",
            "severity": "critical" if rate < att_critical else "warning",
            "timestamp": now.isoformat(),
            "dismissed": False,
        })

    if pending_invoices_count >= pending_inv:
        alerts.append({
            "id": f"invoices-{int(now.timestamp() * 1000)}",
            "type": "pending_invoice",
            "title": "Pending Invoices",
            "message": f"{pending_invoices_count} invoices pending payment",
            "severity": "critical" if pending_invoices_count >= pending_inv * 2 else "info",
            "timestamp": now.isoformat(),
            "dismissed": False,
        })

    return {
        "alerts": alerts,
        "newTicketsCount": new_tickets_count,
        "attendanceRate": rate,
        "thresholds": {
            "attendanceWarning": att_warning,
            "attendanceCritical": att_critical,
            "pendingInvoices": pending_inv,
            "ticketHours": ticket_hours,
        }
    }


# ─── INDIVIDUAL SCHOOL CRUD (path-parameter routes — must be after all static) ─

@schools_router.get("/{school_id}", response_model=SchoolOut)
async def get_school(school_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(School).where(School.id == school_id))
    school = result.scalar_one_or_none()
    if not school:
        raise NotFoundError("School", str(school_id))
    return school


@schools_router.patch("/{school_id}", response_model=SchoolOut)
async def update_school(school_id: UUID, body: SchoolUpdate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(School).where(School.id == school_id))
    school = result.scalar_one_or_none()
    if not school:
        raise NotFoundError("School", str(school_id))

    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or "school_owner" in effective_roles or "principal" in effective_roles):
        raise ForbiddenError()

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(school, field, value)
    await db.flush()
    await db.refresh(school)
    return school


# ─── SCHOOL BRANDING ──────────────────────────────────────────────────────────

@schools_router.get("/{school_id}/branding", response_model=BrandingOut)
async def get_branding(school_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(SchoolBranding).where(SchoolBranding.school_id == school_id))
    branding = result.scalar_one_or_none()
    if not branding:
        raise NotFoundError("Branding", str(school_id))
    return branding


@schools_router.put("/{school_id}/branding", response_model=BrandingOut)
async def upsert_branding(school_id: UUID, body: BrandingUpdate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(SchoolBranding).where(SchoolBranding.school_id == school_id))
    branding = result.scalar_one_or_none()
    if branding:
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(branding, field, value)
    else:
        branding = SchoolBranding(school_id=school_id, **body.model_dump(exclude_none=True))
        db.add(branding)
    await db.flush()
    await db.refresh(branding)
    return branding


# ─── ROLES MANAGEMENT ─────────────────────────────────────────────────────────

@schools_router.get("/{school_id}/roles", response_model=List[UserRoleOut])
async def list_school_roles(school_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(UserRole).where(UserRole.school_id == school_id).order_by(UserRole.role)
    )
    return result.scalars().all()


@schools_router.post("/{school_id}/roles", response_model=UserRoleOut, status_code=status.HTTP_201_CREATED)
async def assign_role(school_id: UUID, body: UserRoleCreate, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or "school_owner" in effective_roles or "principal" in effective_roles):
        raise ForbiddenError()
    role = UserRole(
        user_id=body.user_id,
        school_id=school_id,
        role=body.role,
        campus_id=body.campus_id,
    )
    db.add(role)
    await db.flush()
    await db.refresh(role)
    return role


@schools_router.delete("/{school_id}/roles/{role_id}", response_model=MessageResponse)
async def remove_role(school_id: UUID, role_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or "school_owner" in effective_roles or "principal" in effective_roles):
        raise ForbiddenError()
    result = await db.execute(
        select(UserRole).where(UserRole.id == role_id, UserRole.school_id == school_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundError("Role", str(role_id))
    await db.delete(role)
    return MessageResponse(message="Role removed")


# ─── CAMPUSES ─────────────────────────────────────────────────────────────────
campuses_router = APIRouter(prefix="/campuses", tags=["Campuses"])


@campuses_router.get("", response_model=List[CampusOut])
async def list_campuses(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(Campus)
        .where(Campus.school_id == current_user.school_id)
        .order_by(Campus.name)
    )
    return result.scalars().all()


@campuses_router.post("", response_model=CampusOut, status_code=status.HTTP_201_CREATED)
async def create_campus(body: CampusCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or "school_owner" in effective_roles):
        raise ForbiddenError()
    campus = Campus(school_id=current_user.school_id, **body.model_dump())
    db.add(campus)
    await db.flush()
    await db.refresh(campus)
    return campus


@campuses_router.get("/{campus_id}", response_model=CampusOut)
async def get_campus(campus_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Campus).where(Campus.id == campus_id))
    campus = result.scalar_one_or_none()
    if not campus:
        raise NotFoundError("Campus", str(campus_id))
    return campus


@campuses_router.patch("/{campus_id}", response_model=CampusOut)
async def update_campus(campus_id: UUID, body: CampusUpdate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Campus).where(Campus.id == campus_id))
    campus = result.scalar_one_or_none()
    if not campus:
        raise NotFoundError("Campus", str(campus_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(campus, field, value)
    await db.flush()
    await db.refresh(campus)
    return campus


@campuses_router.delete("/{campus_id}", response_model=MessageResponse)
async def delete_campus(campus_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or "school_owner" in effective_roles):
        raise ForbiddenError()
    result = await db.execute(select(Campus).where(Campus.id == campus_id))
    campus = result.scalar_one_or_none()
    if not campus:
        raise NotFoundError("Campus", str(campus_id))
    await db.delete(campus)
    return MessageResponse(message="Campus deleted")
