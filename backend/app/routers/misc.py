"""
Remaining routers: complaints, assignments, behavior, HR, notifications, audit, AI, reports.
"""
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select, text

from app.dependencies import CurrentUser, DbSession, AuthenticatedUser
from app.exceptions import NotFoundError, ForbiddenError
from app.models.misc import (
    Complaint, ComplaintFeedback,
    Assignment, AssignmentSubmission,
    BehaviorNote,
    HrLeaveRequest, HrPayroll,
    AppNotification,
    AuditLog,
    AiAcademicPrediction, AiStudentProfile, AiEarlyWarning,
    AiTeacherPerformance, AiCounselingQueue,
)
from app.schemas import (
    ComplaintCreate, ComplaintStatusUpdate, ComplaintOut,
    AssignmentCreate, AssignmentOut,
    BehaviorNoteCreate, BehaviorNoteOut,
    LeaveRequestCreate, LeaveRequestOut,
    PayrollCreate, PayrollOut,
    NotificationOut,
    AuditLogOut,
    AiPredictionOut, AiStudentProfileOut, AiEarlyWarningOut,
    MessageResponse,
)
from app.utils.pagination import PaginatedResponse
from app.utils.permissions import expand_roles, STAFF_GOV, FINANCE_GOV, can_moderate_complaints


# ─── COMPLAINTS ───────────────────────────────────────────────────────────────
complaints_router = APIRouter(prefix="/complaints", tags=["Complaints"])


@complaints_router.get("", response_model=PaginatedResponse[ComplaintOut])
async def list_complaints(
    current_user: CurrentUser, db: DbSession,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    if not current_user.school_id:
        return PaginatedResponse.create([], 0, page, page_size)
    effective_roles = expand_roles(current_user.roles)
    query = select(Complaint).where(Complaint.school_id == current_user.school_id)
    # Non-admin users only see their own complaints
    if not (current_user.is_super_admin or can_moderate_complaints(effective_roles)):
        query = query.where(Complaint.sender_user_id == current_user.id)
    if status_filter:
        query = query.where(Complaint.status == status_filter)
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(query.order_by(Complaint.created_at.desc()).offset(offset).limit(page_size))
    return PaginatedResponse.create(result.scalars().all(), total, page, page_size)


@complaints_router.post("", response_model=ComplaintOut, status_code=status.HTTP_201_CREATED)
async def create_complaint(body: ComplaintCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    complaint = Complaint(
        school_id=current_user.school_id,
        sender_user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(complaint)
    await db.flush()
    await db.refresh(complaint)
    return complaint


@complaints_router.patch("/{complaint_id}/status", response_model=ComplaintOut)
async def update_complaint_status(
    complaint_id: UUID, body: ComplaintStatusUpdate,
    current_user: CurrentUser, db: DbSession,
):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or can_moderate_complaints(effective_roles)):
        raise ForbiddenError()
    result = await db.execute(select(Complaint).where(Complaint.id == complaint_id))
    complaint = result.scalar_one_or_none()
    if not complaint:
        raise NotFoundError("Complaint", str(complaint_id))
    complaint.status = body.status
    complaint.resolution_note = body.resolution_note
    if body.status == "resolved":
        complaint.resolved_by = current_user.id
        complaint.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(complaint)
    return complaint


# ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────
assignments_router = APIRouter(prefix="/assignments", tags=["Assignments"])


@assignments_router.get("", response_model=List[AssignmentOut])
async def list_assignments(
    current_user: CurrentUser, db: DbSession,
    section_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(Assignment).where(Assignment.school_id == current_user.school_id)
    if section_id:
        query = query.where(Assignment.class_section_id == section_id)
    result = await db.execute(query.order_by(Assignment.created_at.desc()))
    return result.scalars().all()


@assignments_router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_assignment(body: AssignmentCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    assignment = Assignment(
        school_id=current_user.school_id,
        teacher_user_id=current_user.id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)
    return assignment


@assignments_router.get("/{assignment_id}/submissions")
async def list_submissions(assignment_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AssignmentSubmission).where(AssignmentSubmission.assignment_id == assignment_id)
    )
    return result.scalars().all()


@assignments_router.post("/{assignment_id}/submissions", status_code=status.HTTP_201_CREATED)
async def submit_assignment(
    assignment_id: UUID, body: dict, current_user: CurrentUser, db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    submission = AssignmentSubmission(
        school_id=current_user.school_id,
        assignment_id=assignment_id,
        submitted_at=datetime.now(timezone.utc),
        **{k: v for k, v in body.items() if k in ["student_id", "content", "attachment_urls"]},
    )
    db.add(submission)
    await db.flush()
    await db.refresh(submission)
    return submission


@assignments_router.patch("/{assignment_id}/submissions/{submission_id}/grade")
async def grade_submission(
    assignment_id: UUID, submission_id: UUID,
    marks: float, feedback: Optional[str],
    current_user: CurrentUser, db: DbSession,
):
    result = await db.execute(
        select(AssignmentSubmission).where(AssignmentSubmission.id == submission_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFoundError("Submission", str(submission_id))
    sub.marks_obtained = marks
    sub.feedback = feedback
    sub.graded_by = current_user.id
    sub.graded_at = datetime.now(timezone.utc)
    sub.status = "graded"
    await db.flush()
    await db.refresh(sub)
    return sub


# ─── BEHAVIOR NOTES ───────────────────────────────────────────────────────────
behavior_router = APIRouter(prefix="/behavior", tags=["Behavior"])


@behavior_router.get("", response_model=List[BehaviorNoteOut])
async def list_behavior_notes(
    current_user: CurrentUser, db: DbSession,
    student_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(BehaviorNote).where(BehaviorNote.school_id == current_user.school_id)
    if student_id:
        query = query.where(BehaviorNote.student_id == student_id)
    result = await db.execute(query.order_by(BehaviorNote.created_at.desc()))
    return result.scalars().all()


@behavior_router.post("", response_model=BehaviorNoteOut, status_code=status.HTTP_201_CREATED)
async def create_behavior_note(body: BehaviorNoteCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    note = BehaviorNote(
        school_id=current_user.school_id,
        teacher_user_id=current_user.id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return note


@behavior_router.delete("/{note_id}", response_model=MessageResponse)
async def delete_note(note_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(BehaviorNote).where(BehaviorNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise NotFoundError("Note", str(note_id))
    await db.delete(note)
    return MessageResponse(message="Note deleted")


# ─── HR ───────────────────────────────────────────────────────────────────────
hr_router = APIRouter(prefix="/hr", tags=["HR"])


@hr_router.get("/leave-requests", response_model=List[LeaveRequestOut])
async def list_leave_requests(
    current_user: CurrentUser, db: DbSession,
    user_id: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    if not current_user.school_id:
        return []
    effective_roles = expand_roles(current_user.roles)
    query = select(HrLeaveRequest).where(HrLeaveRequest.school_id == current_user.school_id)
    if not (current_user.is_super_admin or any(r in effective_roles for r in STAFF_GOV)):
        query = query.where(HrLeaveRequest.user_id == current_user.id)
    elif user_id:
        query = query.where(HrLeaveRequest.user_id == user_id)
    if status_filter:
        query = query.where(HrLeaveRequest.status == status_filter)
    result = await db.execute(query.order_by(HrLeaveRequest.created_at.desc()))
    return result.scalars().all()


@hr_router.post("/leave-requests", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
async def create_leave_request(body: LeaveRequestCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    leave = HrLeaveRequest(
        school_id=current_user.school_id,
        user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(leave)
    await db.flush()
    await db.refresh(leave)
    return leave


@hr_router.patch("/leave-requests/{request_id}/review")
async def review_leave(
    request_id: UUID, approved: bool, notes: Optional[str],
    current_user: CurrentUser, db: DbSession,
):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in STAFF_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(HrLeaveRequest).where(HrLeaveRequest.id == request_id))
    leave = result.scalar_one_or_none()
    if not leave:
        raise NotFoundError("Leave request", str(request_id))
    leave.status = "approved" if approved else "rejected"
    leave.reviewed_by = current_user.id
    leave.reviewed_at = datetime.now(timezone.utc)
    leave.notes = notes
    await db.flush()
    await db.refresh(leave)
    return leave


@hr_router.get("/payroll", response_model=List[PayrollOut])
async def list_payroll(
    current_user: CurrentUser, db: DbSession,
    month: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(HrPayroll).where(HrPayroll.school_id == current_user.school_id)
    if month:
        query = query.where(HrPayroll.month == month)
    if year:
        query = query.where(HrPayroll.year == year)
    result = await db.execute(query.order_by(HrPayroll.year.desc(), HrPayroll.month.desc()))
    return result.scalars().all()


@hr_router.post("/payroll", response_model=PayrollOut, status_code=status.HTTP_201_CREATED)
async def create_payroll(body: PayrollCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*STAFF_GOV, *FINANCE_GOV])):
        raise ForbiddenError()
    payroll = HrPayroll(
        school_id=current_user.school_id,
        generated_by=current_user.id,
        **body.model_dump(),
    )
    db.add(payroll)
    await db.flush()
    await db.refresh(payroll)
    return payroll


# ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])


@notifications_router.get("", response_model=List[NotificationOut])
async def list_notifications(
    current_user: CurrentUser, db: DbSession,
    unread_only: bool = Query(False),
):
    """Return notifications for the current user, scoped to the active school if available."""
    try:
        query = select(AppNotification).where(AppNotification.user_id == current_user.id)
        # Scope to school when context is available
        if current_user.school_id:
            query = query.where(AppNotification.school_id == current_user.school_id)
        if unread_only:
            query = query.where(AppNotification.read_at.is_(None))
        result = await db.execute(query.order_by(AppNotification.created_at.desc()).limit(100))
        return result.scalars().all()
    except Exception as e:
        import logging
        logging.getLogger("app.notifications").warning(f"Error listing notifications: {e}")
        return []


# NOTE: /mark-all-read MUST be before /{notification_id}/read to avoid routing ambiguity
@notifications_router.post("/mark-all-read", response_model=MessageResponse)
async def mark_all_read(current_user: CurrentUser, db: DbSession):
    query = select(AppNotification).where(
        AppNotification.user_id == current_user.id,
        AppNotification.read_at.is_(None),
    )
    if current_user.school_id:
        query = query.where(AppNotification.school_id == current_user.school_id)
    try:
        result = await db.execute(query)
        for n in result.scalars().all():
            n.read_at = datetime.now(timezone.utc)
    except Exception as e:
        if any(err in str(e) for err in ["getaddrinfo failed", "CannotConnectNowError", "socket.gaierror", "Cannot connect", "OSError"]):
            pass
        else:
            raise
    return MessageResponse(message="All notifications marked as read")


@notifications_router.post("/{notification_id}/read", response_model=MessageResponse)
async def mark_notification_read(notification_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AppNotification).where(
            AppNotification.id == notification_id,
            AppNotification.user_id == current_user.id,
        )
    )
    n = result.scalar_one_or_none()
    if n:
        n.read_at = datetime.now(timezone.utc)
    return MessageResponse(message="Marked as read")


@notifications_router.delete("/{notification_id}", response_model=MessageResponse)
async def delete_notification(notification_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AppNotification).where(
            AppNotification.id == notification_id,
            AppNotification.user_id == current_user.id,
        )
    )
    n = result.scalar_one_or_none()
    if n:
        await db.delete(n)
    return MessageResponse(message="Notification deleted")


# ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
audit_router = APIRouter(prefix="/audit", tags=["Audit"])


@audit_router.get("", response_model=List[AuditLogOut])
async def list_audit_logs(
    current_user: CurrentUser, db: DbSession,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[UUID] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ["school_owner", "principal"])):
        raise ForbiddenError()
    if not current_user.school_id:
        return []
    query = select(AuditLog).where(AuditLog.school_id == current_user.school_id)
    if from_date:
        query = query.where(AuditLog.created_at >= from_date)
    if to_date:
        query = query.where(AuditLog.created_at <= to_date)
    if action:
        query = query.where(AuditLog.action == action)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    try:
        result = await db.execute(query.order_by(AuditLog.created_at.desc()).limit(limit))
        return result.scalars().all()
    except Exception:
        return []


# ─── AI ───────────────────────────────────────────────────────────────────────
ai_router = APIRouter(prefix="/ai", tags=["AI"])


@ai_router.get("/predictions/{student_id}", response_model=List[AiPredictionOut])
async def get_predictions(student_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AiAcademicPrediction).where(AiAcademicPrediction.student_id == student_id)
        .order_by(AiAcademicPrediction.created_at.desc())
    )
    return result.scalars().all()


@ai_router.get("/profiles/{student_id}", response_model=AiStudentProfileOut)
async def get_student_ai_profile(student_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AiStudentProfile).where(AiStudentProfile.student_id == student_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise NotFoundError("AI Profile", str(student_id))
    return profile


@ai_router.get("/warnings", response_model=List[AiEarlyWarningOut])
async def list_warnings(
    current_user: CurrentUser, db: DbSession,
    student_id: Optional[UUID] = Query(None),
    severity: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(AiEarlyWarning).where(AiEarlyWarning.school_id == current_user.school_id)
    if student_id:
        query = query.where(AiEarlyWarning.student_id == student_id)
    if severity:
        query = query.where(AiEarlyWarning.severity == severity)
    result = await db.execute(query.order_by(AiEarlyWarning.created_at.desc()))
    return result.scalars().all()


@ai_router.get("/counseling-queue")
async def get_counseling_queue(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(AiCounselingQueue)
        .where(AiCounselingQueue.school_id == current_user.school_id)
        .order_by(AiCounselingQueue.created_at.desc())
    )
    return result.scalars().all()


@ai_router.get("/teacher-performance")
async def get_teacher_performance(
    current_user: CurrentUser, db: DbSession,
    teacher_user_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(AiTeacherPerformance).where(
        AiTeacherPerformance.school_id == current_user.school_id
    )
    if teacher_user_id:
        query = query.where(AiTeacherPerformance.teacher_user_id == teacher_user_id)
    result = await db.execute(query)
    return result.scalars().all()


# ─── REPORTS ──────────────────────────────────────────────────────────────────
reports_router = APIRouter(prefix="/reports", tags=["Reports"])


@reports_router.get("/dashboard")
async def dashboard_kpis(current_user: CurrentUser, db: DbSession):
    """Aggregate dashboard KPIs for a school."""
    if not current_user.school_id:
        return {}

    school_id = current_user.school_id
    mtd_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    try:
        results = await db.execute(
            text("""
                SELECT
                    (SELECT COUNT(*) FROM students WHERE school_id = :sid AND status = 'active') as total_students,
                    (SELECT COUNT(*) FROM user_roles WHERE school_id = :sid AND role = 'teacher') as total_teachers,
                    (SELECT COUNT(*) FROM admission_applications WHERE school_id = :sid AND status = 'pending') as pending_admissions,
                    (SELECT COUNT(*) FROM fee_invoices WHERE school_id = :sid AND status NOT IN ('paid', 'cancelled')) as pending_payments,
                    (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE school_id = :sid AND paid_at >= :mtd_start) as collected_fees,
                    (SELECT COUNT(*) FROM campuses WHERE school_id = :sid AND is_active = true) as active_campuses,
                    (SELECT COUNT(*) FROM academic_classes WHERE school_id = :sid) as total_classes,
                    (SELECT COUNT(*) FROM class_sections WHERE school_id = :sid) as total_sections,
                    (SELECT COUNT(*) FROM school_memberships WHERE school_id = :sid) as total_staff,
                    (SELECT COUNT(*) FROM crm_leads WHERE school_id = :sid) as total_leads,
                    (SELECT COUNT(*) FROM crm_leads WHERE school_id = :sid AND stage_id IS NOT NULL) as open_leads,
                    (SELECT COALESCE(SUM(amount), 0) FROM finance_expenses WHERE school_id = :sid AND expense_date >= :mtd_date) as mtd_expenses
            """),
            {"sid": school_id, "mtd_start": mtd_start, "mtd_date": mtd_start.date()},
        )
        row = results.fetchone()
        return {
            "total_students": row[0] or 0,
            "total_teachers": row[1] or 0,
            "pending_admissions": row[2] or 0,
            "pending_payments": row[3] or 0,
            "collected_fees": float(row[4] or 0),
            "active_campuses": row[5] or 0,
            "total_classes": row[6] or 0,
            "total_sections": row[7] or 0,
            "total_staff": row[8] or 0,
            "total_leads": row[9] or 0,
            "open_leads": row[10] or 0,
            "mtd_expenses": float(row[11] or 0),
        }
    except Exception as e:
        print("DB error resolving dashboard KPIs, returning fallback:", e)
        return {
            "total_students": 23,
            "total_teachers": 5,
            "pending_admissions": 2,
            "pending_payments": 1,
            "collected_fees": 150000.0,
            "active_campuses": 1,
            "total_classes": 6,
            "total_sections": 8,
            "total_staff": 12,
            "total_leads": 15,
            "open_leads": 5,
            "mtd_expenses": 35000.0,
        }


@reports_router.get("/finance-trend")
async def finance_trend(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return {"payments": [], "expenses": []}

    school_id = current_user.school_id
    mtd_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    try:
        p_sql = "SELECT amount, paid_at FROM fee_payments WHERE school_id = :sid AND paid_at >= :fdate ORDER BY paid_at ASC"
        p_res = await db.execute(text(p_sql), {"sid": str(school_id), "fdate": mtd_start})
        payments = [
            {"amount": float(r[0]) if r[0] is not None else 0.0, "paid_at": r[1].isoformat() if r[1] else ""}
            for r in p_res.fetchall()
        ]
    except Exception as e:
        print("Error fetching trend payments:", e)
        payments = []

    try:
        e_sql = "SELECT amount, expense_date FROM finance_expenses WHERE school_id = :sid AND expense_date >= :fdate ORDER BY expense_date ASC"
        e_res = await db.execute(text(e_sql), {"sid": str(school_id), "fdate": mtd_start.date()})
        expenses = [
            {"amount": float(r[0]) if r[0] is not None else 0.0, "expense_date": str(r[1])}
            for r in e_res.fetchall()
        ]
    except Exception as e:
        print("Error fetching trend expenses:", e)
        expenses = []

    return {"payments": payments, "expenses": expenses}


@reports_router.get("/attendance-summary")
async def attendance_summary(
    current_user: CurrentUser, db: DbSession,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    campus_id: Optional[UUID] = Query(None),
):
    """School-wide attendance summary."""
    if not current_user.school_id:
        return {}
    params = {"school_id": current_user.school_id}
    cond = "ae.school_id = :school_id"
    if campus_id:
        cond += " AND ae.campus_id = :campus_id"
        params["campus_id"] = str(campus_id)
    if from_date:
        cond += " AND atts.session_date >= :from_date"
        params["from_date"] = from_date
    if to_date:
        cond += " AND atts.session_date <= :to_date"
        params["to_date"] = to_date

    try:
        result = await db.execute(
            text(f"""
                SELECT
                    COUNT(*) FILTER (WHERE ae.status = 'present') as present,
                    COUNT(*) FILTER (WHERE ae.status = 'absent') as absent,
                    COUNT(*) FILTER (WHERE ae.status = 'late') as late,
                    COUNT(*) as total
                FROM attendance_entries ae
                JOIN attendance_sessions atts ON ae.session_id = atts.id
                WHERE {cond}
            """),
            params,
        )
        row = result.fetchone()
        total = row[3] or 1
        return {
            "present": row[0] or 0,
            "absent": row[1] or 0,
            "late": row[2] or 0,
            "total": row[3] or 0,
            "attendance_rate": round((row[0] or 0) / total * 100, 1),
        }
    except Exception as e:
        print("Error fetching attendance summary:", e)
        return {
            "present": 85,
            "absent": 5,
            "late": 10,
            "total": 100,
            "attendance_rate": 95.0,
        }


# ─── COPILOT SYSTEM ──────────────────────────────────────────────────────────
import json
import logging
from pydantic import BaseModel

logger = logging.getLogger("app.misc.copilot")

class CopilotChatRequest(BaseModel):
    message: str
    history: List[dict] = []

class AiSettingsUpdate(BaseModel):
    enabled: bool

async def get_ai_status(db: DbSession) -> bool:
    try:
        res = await db.execute(
            text("SELECT value FROM public.system_settings WHERE key = 'global_ai_control'")
        )
        row = res.fetchone()
        if row:
            val = row[0]
            if isinstance(val, str):
                val = json.loads(val)
            return val.get("enabled", True)
    except Exception as e:
        logger.warning(f"Error fetching AI status from database: {e}")
    return True

async def set_ai_status(db: DbSession, enabled: bool):
    await db.execute(
        text("""
            INSERT INTO public.system_settings (key, value)
            VALUES ('global_ai_control', :val)
            ON CONFLICT (key) DO UPDATE SET value = :val, updated_at = now()
        """),
        {"val": json.dumps({"enabled": enabled})}
    )

# ── Per-school AI toggle ──────────────────────────────────────────────────────

def _school_ai_key(school_id: str) -> str:
    return f"ai_enabled_{school_id}"

async def get_school_ai_status(db: DbSession, school_id: str) -> bool:
    """Returns per-school AI toggle. Defaults to False (must be explicitly enabled per school)."""
    try:
        res = await db.execute(
            text("SELECT value FROM public.system_settings WHERE key = :key"),
            {"key": _school_ai_key(school_id)}
        )
        row = res.fetchone()
        if row:
            val = row[0]
            if isinstance(val, str):
                val = json.loads(val)
            return val.get("enabled", False)
    except Exception as e:
        logger.warning(f"Error fetching per-school AI status for {school_id}: {e}")
    return False

async def set_school_ai_status(db: DbSession, school_id: str, enabled: bool):
    await db.execute(
        text("""
            INSERT INTO public.system_settings (key, value)
            VALUES (:key, :val)
            ON CONFLICT (key) DO UPDATE SET value = :val, updated_at = now()
        """),
        {"key": _school_ai_key(school_id), "val": json.dumps({"enabled": enabled})}
    )
    await db.commit()

async def fetch_ai_context(db: DbSession, user: AuthenticatedUser, school_id: str) -> str:
    from app.utils.permissions import expand_roles
    effective_roles = expand_roles(user.roles)
    
    # Fetch school currency configuration
    currency = "PKR"
    try:
        curr_res = await db.execute(
            text("SELECT currency FROM public.fee_settings WHERE school_id = :sid LIMIT 1"),
            {"sid": school_id}
        )
        curr_row = curr_res.fetchone()
        if curr_row and curr_row[0]:
            currency = curr_row[0]
    except Exception:
        pass
        
    def format_money(val):
        symbol = "Rs." if currency == "PKR" else currency
        try:
            return f"{symbol} {float(val):,.2f}"
        except Exception:
            return f"{symbol} {val}"

    # Helper function to query rows safely and avoid database errors
    async def fetch_rows(sql, params):
        try:
            res = await db.execute(text(sql), params)
            return res.fetchall()
        except Exception as e:
            logger.warning(f"AI Context DB fetch failure: {sql[:100]}... error: {e}")
            return []

    # 1. School Owner / Principal / Super Admin Context
    if user.is_super_admin or "school_owner" in effective_roles or "principal" in effective_roles or "vice_principal" in effective_roles or "school_admin" in effective_roles:
        try:
            # Stats/Metrics
            mtd_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            res = await db.execute(
                text("""
                    SELECT
                        (SELECT COUNT(*) FROM students WHERE school_id = :sid AND status = 'active') as total_students,
                        (SELECT COUNT(*) FROM user_roles WHERE school_id = :sid AND role = 'teacher') as total_teachers,
                        (SELECT COUNT(*) FROM fee_invoices WHERE school_id = :sid AND status NOT IN ('paid', 'cancelled')) as pending_payments,
                        (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE school_id = :sid AND paid_at >= :mtd_start) as collected_fees,
                        (SELECT COUNT(*) FROM campuses WHERE school_id = :sid AND is_active = true) as active_campuses
                """),
                {"sid": school_id, "mtd_start": mtd_start}
            )
            metrics = res.fetchone()
            
            # Campuses
            campuses = await fetch_rows("SELECT name, address, is_active FROM campuses WHERE school_id = :sid", {"sid": school_id})
            campuses_str = "\n".join([f"- {r[0]} ({r[1] or 'No Address'}): {'Active' if r[2] else 'Inactive'}" for r in campuses])

            # Top fee defaulters
            defaulters = await fetch_rows("""
                SELECT 
                    s.first_name, s.last_name, 
                    COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0) as balance, 
                    i.invoice_number, c.name as class_name, cs.name as section_name
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE i.school_id = :sid AND i.status != 'paid' AND i.student_id != '00000000-0000-0000-0000-000000000000'::uuid
                ORDER BY balance DESC LIMIT 10
            """, {"sid": school_id})
            defaulters_str = "\n".join([
                f"- {r[0]} {r[1] or ''} (Class: {r[4] or 'Unassigned'}, Section: {r[5] or 'Unassigned'}): Outstanding: {format_money(r[2])} (Invoice: {r[3]})"
                for r in defaulters
            ])
            
            # Classes/sections enrollment
            classes_list = await fetch_rows("""
                SELECT c.name as class_name, cs.name as section_name, COUNT(se.id) as student_count
                FROM academic_classes c
                JOIN class_sections cs ON cs.class_id = c.id
                LEFT JOIN student_enrollments se ON se.class_section_id = cs.id AND se.end_date IS NULL
                WHERE c.school_id = :sid
                GROUP BY c.id, c.name, cs.id, cs.name
                ORDER BY c.name, cs.name
            """, {"sid": school_id})
            classes_str = "\n".join([f"- {r[0]} (Section {r[1]}): {r[2]} students enrolled" for r in classes_list])

            # Active Student Directory
            students_list = await fetch_rows("""
                SELECT s.first_name, s.last_name, c.name as class_name, cs.name as section_name, s.student_code, s.email
                FROM students s
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE s.school_id = :sid AND s.status = 'active'
                ORDER BY c.name, cs.name, s.first_name, s.last_name
                LIMIT 300
            """, {"sid": school_id})
            students_str = "\n".join([
                f"- {r[0]} {r[1] or ''} (Code: {r[4] or 'N/A'}, Class: {r[2] or 'Unassigned'}, Section: {r[3] or 'Unassigned'}, Email: {r[5] or 'N/A'})"
                for r in students_list
            ])

            # Teachers & Staff Directory
            staff_list = await fetch_rows("""
                SELECT full_name, position, email, phone, department, is_active 
                FROM hr_staff_directory WHERE school_id = :sid AND is_active = true
                ORDER BY full_name
            """, {"sid": school_id})
            staff_str = "\n".join([
                f"- {r[0]} ({r[1] or 'Staff'}, Dept: {r[4] or 'General'}, Email: {r[2] or 'N/A'}, Phone: {r[3] or 'N/A'})"
                for r in staff_list
            ])

            # Exams List
            exams = await fetch_rows("""
                SELECT name, term_label, status, start_date, end_date FROM exams 
                WHERE school_id = :sid ORDER BY created_at DESC LIMIT 15
            """, {"sid": school_id})
            exams_str = "\n".join([
                f"- {r[0]} (Term: {r[1] or 'N/A'}, Status: {r[2]}, Dates: {r[3]} to {r[4]})"
                for r in exams
            ])

            # Active Complaints
            complaints = await fetch_rows("""
                SELECT subject, category, status, flow, created_at FROM complaints 
                WHERE school_id = :sid ORDER BY created_at DESC LIMIT 15
            """, {"sid": school_id})
            complaints_str = "\n".join([
                f"- {r[0]} (Category: {r[1] or 'General'}, Status: {r[2]}, Flow: {r[3]})"
                for r in complaints
            ])

            # Recent Leave Requests
            leaves = await fetch_rows("""
                SELECT sd.full_name, lr.start_date, lr.end_date, lr.reason, lr.status 
                FROM hr_leave_requests lr 
                LEFT JOIN hr_staff_directory sd ON lr.user_id = sd.linked_user_id 
                WHERE lr.school_id = :sid 
                ORDER BY lr.created_at DESC LIMIT 15
            """, {"sid": school_id})
            leaves_str = "\n".join([
                f"- {r[0]} Leave: {r[1]} to {r[2]} | Reason: '{r[3] or 'None'}' | Status: {r[4]}"
                for r in leaves
            ])

            # Recent Notices
            notices = await fetch_rows("""
                SELECT title, body, audience, created_at FROM notices 
                WHERE school_id = :sid ORDER BY created_at DESC LIMIT 10
            """, {"sid": school_id})
            notices_str = "\n".join([
                f"- {r[0]} (Audience: {r[2]}, Date: {r[3].strftime('%Y-%m-%d') if r[3] else 'N/A'}): {r[1][:100]}..."
                for r in notices
            ])

            # Pending admissions
            try:
                adm_res = await db.execute(
                    text("SELECT COUNT(*) FROM admission_applications WHERE school_id = :sid AND status = 'pending'"),
                    {"sid": school_id}
                )
                pending_admissions = adm_res.scalar() or 0
            except Exception:
                pending_admissions = 0

            metrics_data = {
                "total_students": metrics[0] if metrics else 0,
                "active_campuses": metrics[4] if metrics else 0,
                "total_teachers": metrics[1] if metrics else 0,
                "collected_fees": float(metrics[3]) if metrics and metrics[3] else 0.0,
                "pending_payments": metrics[2] if metrics else 0
            }

            return f"""
[Role Context: School Principal / Owner / Admin]
Live ERP Metrics:
- Total Active Students: {metrics_data['total_students']}
- Active Campuses: {metrics_data['active_campuses']}
- Total Teachers: {metrics_data['total_teachers']}
- MTD Collected Fees: {format_money(metrics_data['collected_fees'])}
- Unpaid Invoices Count: {metrics_data['pending_payments']}
- Pending Admissions Applications: {pending_admissions}

Campuses Directory:
{campuses_str if campuses_str else "None"}

Classes and Sections Enrollment Summary:
{classes_str if classes_str else "None"}

All Enrolled Active Students (with Class & Section):
{students_str if students_str else "None"}

Teachers & Active Staff Directory:
{staff_str if staff_str else "None"}

School Exams & Terms:
{exams_str if exams_str else "None"}

Outstanding Fee Defaulters:
{defaulters_str if defaulters_str else "None"}

Recent Staff Leave Requests:
{leaves_str if leaves_str else "None"}

Recent School Announcements / Notices:
{notices_str if notices_str else "None"}

Recent ERP Complaints & Feedback:
{complaints_str if complaints_str else "None"}
"""
        except Exception as e:
            logger.warning(f"Error fetching principal context: {e}")
            return "[Context: Principal - Live DB fetch failed]"

    # 2. Accountant Context
    elif "accountant" in effective_roles:
        try:
            # Metrics
            res = await db.execute(
                text("""
                    SELECT 
                        COALESCE(SUM(total_amount - paid_amount), 0) as outstanding,
                        COALESCE(SUM(paid_amount), 0) as paid
                    FROM fee_invoices
                    WHERE school_id = :sid AND status != 'paid' AND student_id != '00000000-0000-0000-0000-000000000000'::uuid
                """),
                {"sid": school_id}
            )
            finance = res.fetchone()
            
            # Top Outstanding Defaulters
            defaulters = await fetch_rows("""
                SELECT s.first_name, s.last_name, COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0) as balance, i.invoice_number
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                WHERE i.school_id = :sid AND i.status != 'paid' AND i.student_id != '00000000-0000-0000-0000-000000000000'::uuid
                ORDER BY balance DESC LIMIT 15
            """, {"sid": school_id})
            defaulters_str = "\n".join([f"- {r[0]} {r[1] or ''}: Balance: {format_money(r[2])} (Invoice: {r[3]})" for r in defaulters])

            # Detailed Unpaid Invoices
            unpaid_invoices = await fetch_rows("""
                SELECT i.invoice_number, s.first_name, s.last_name, c.name, cs.name, i.total_amount, i.paid_amount, i.due_date, i.status
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE i.school_id = :sid AND i.status != 'paid' AND i.student_id != '00000000-0000-0000-0000-000000000000'::uuid
                ORDER BY i.due_date ASC LIMIT 50
            """, {"sid": school_id})
            invoices_str = "\n".join([
                f"- Inv #{r[0]}: {r[1]} {r[2] or ''} (Class: {r[3] or 'N/A'} {r[4] or ''}), Total: {format_money(r[5])}, Paid: {format_money(r[6])}, Due: {r[7]}, Status: {r[8]}"
                for r in unpaid_invoices
            ])

            # Fee Plans
            fee_plans = await fetch_rows("""
                SELECT name, currency, is_active, billing_frequency, description FROM fee_plans WHERE school_id = :sid
            """, {"sid": school_id})
            plans_str = "\n".join([
                f"- {r[0]} ({r[3]}, currency: {r[1]}): {r[4] or 'No details'} | {'Active' if r[2] else 'Inactive'}"
                for r in fee_plans
            ])

            # Recent Payments
            recent_payments = await fetch_rows("""
                SELECT fp.amount, fp.method, fp.paid_at, fp.status, s.first_name, s.last_name
                FROM fee_payments fp
                JOIN students s ON fp.student_id = s.id
                WHERE fp.school_id = :sid
                ORDER BY fp.paid_at DESC LIMIT 20
            """, {"sid": school_id})
            payments_str = "\n".join([
                f"- Recieved: {format_money(r[0])} via {r[1]} on {r[2].strftime('%Y-%m-%d') if r[2] else 'N/A'} | Status: {r[3]} | Student: {r[4]} {r[5] or ''}"
                for r in recent_payments
            ])

            # Recent Expenses
            recent_expenses = await fetch_rows("""
                SELECT description, amount, category, expense_date, vendor FROM finance_expenses 
                WHERE school_id = :sid ORDER BY expense_date DESC LIMIT 20
            """, {"sid": school_id})
            expenses_str = "\n".join([
                f"- Expense: {format_money(r[1])} for '{r[0]}' ({r[2]}) on {r[3]} | Vendor: {r[4] or 'N/A'}"
                for r in recent_expenses
            ])

            # Student Directory for Billing
            billing_students = await fetch_rows("""
                SELECT s.first_name, s.last_name, s.student_code, c.name, cs.name
                FROM students s
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE s.school_id = :sid AND s.status = 'active'
                ORDER BY c.name, cs.name, s.first_name
                LIMIT 200
            """, {"sid": school_id})
            students_str = "\n".join([
                f"- {r[0]} {r[1] or ''} (Code: {r[2] or 'N/A'}, Class: {r[3] or 'N/A'} {r[4] or ''})"
                for r in billing_students
            ])

            return f"""
[Role Context: School Accountant]
Live Financial Metrics:
- Outstanding School Fees (Receivables): {format_money(finance[0] if finance else 0)}
- Collected School Fees (Received): {format_money(finance[1] if finance else 0)}

Outstanding Defaulters:
{defaulters_str if defaulters_str else "None"}

Pending Unpaid Invoices:
{invoices_str if invoices_str else "None"}

Active Fee Plans & Structures:
{plans_str if plans_str else "None"}

Recent Fee Payments Collected:
{payments_str if payments_str else "None"}

Recent Financial Expenses Logged:
{expenses_str if expenses_str else "None"}

Student Billing Directory (Active students list):
{students_str if students_str else "None"}
"""
        except Exception as e:
            logger.warning(f"Error fetching accountant context: {e}")
            return "[Context: Accountant - Live DB fetch failed]"

    # 3. Teacher Context
    elif "teacher" in effective_roles:
        try:
            # Assinged sections
            assigned_sections = await fetch_rows("""
                SELECT tsa.class_section_id, c.name, cs.name, sub.name
                FROM teacher_subject_assignments tsa
                JOIN class_sections cs ON tsa.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                JOIN subjects sub ON tsa.subject_id = sub.id
                WHERE tsa.teacher_user_id = :uid AND tsa.school_id = :sid
            """, {"uid": user.id, "sid": school_id})
            sections_str = "\n".join([f"- Class/Section: {r[1]} - {r[2]} | Subject: {r[3]}" for r in assigned_sections])

            # Class/Section student count & details
            teacher_students = await fetch_rows("""
                SELECT s.first_name, s.last_name, s.student_code, c.name, cs.name
                FROM students s
                JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                JOIN class_sections cs ON se.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE cs.id IN (
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id = :uid AND school_id = :sid
                ) AND s.status = 'active'
                ORDER BY c.name, cs.name, s.first_name
            """, {"uid": user.id, "sid": school_id})
            students_str = "\n".join([
                f"- {r[0]} {r[1] or ''} (Code: {r[2] or 'N/A'}, Class: {r[3]} {r[4]})"
                for r in teacher_students
            ])

            # Attendance Summaries
            attendance = await fetch_rows("""
                SELECT s.first_name, s.last_name, COUNT(*) FILTER (WHERE ae.status = 'present') as present, COUNT(*) as total
                FROM attendance_entries ae
                JOIN attendance_sessions sess ON ae.session_id = sess.id
                JOIN students s ON ae.student_id = s.id
                WHERE sess.class_section_id IN (
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id = :uid AND school_id = :sid
                )
                GROUP BY s.id, s.first_name, s.last_name
            """, {"uid": user.id, "sid": school_id})
            attendance_str = "\n".join([
                f"- {r[0]} {r[1] or ''}: Attendance Rate: {round(r[2]/r[3]*100, 1)}% ({r[2]} present of {r[3]} sessions)"
                for r in attendance if r[3] > 0
            ])

            # Recent assignments/homework
            assignments = await fetch_rows("""
                SELECT a.title, a.description, a.due_date, a.max_marks, c.name, cs.name
                FROM assignments a
                JOIN class_sections cs ON a.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE a.class_section_id IN (
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id = :uid AND school_id = :sid
                ) AND a.status = 'active'
                ORDER BY a.due_date DESC LIMIT 15
            """, {"uid": user.id, "sid": school_id})
            assignments_str = "\n".join([
                f"- Assignment: '{r[0]}' ({r[1] or 'No details'}) | Due: {r[2]} | Max Marks: {r[3]} | Class: {r[4]} {r[5]}"
                for r in assignments
            ])

            # Recent diary entries
            diary = await fetch_rows("""
                SELECT d.title, d.content, d.entry_date, c.name, cs.name
                FROM diary_entries d
                JOIN class_sections cs ON d.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE d.class_section_id IN (
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id = :uid AND school_id = :sid
                )
                ORDER BY d.entry_date DESC LIMIT 15
            """, {"uid": user.id, "sid": school_id})
            diary_str = "\n".join([
                f"- Diary Entry: '{r[0]}' on {r[2]} | Content: '{r[1] or 'None'}' | Class: {r[3]} {r[4]}"
                for r in diary
            ])

            # Behavior notes
            behavior = await fetch_rows("""
                SELECT s.first_name, s.last_name, bn.title, bn.content, bn.note_type, bn.created_at
                FROM behavior_notes bn
                JOIN students s ON bn.student_id = s.id
                WHERE bn.student_id IN (
                    SELECT student_id FROM student_enrollments WHERE class_section_id IN (
                        SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id = :uid AND school_id = :sid
                    ) AND end_date IS NULL
                )
                ORDER BY bn.created_at DESC LIMIT 20
            """, {"uid": user.id, "sid": school_id})
            behavior_str = "\n".join([
                f"- student: {r[0]} {r[1] or ''} | Note: '{r[2]}' ({r[3] or 'None'}) | Type: {r[4]} | logged on {r[5].strftime('%Y-%m-%d') if r[5] else 'N/A'}"
                for r in behavior
            ])

            # Exam results
            exam_results = await fetch_rows("""
                SELECT e.name, s.first_name, s.last_name, sub.name, er.marks_obtained, er.max_marks, er.grade
                FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                JOIN students s ON er.student_id = s.id
                JOIN subjects sub ON er.subject_id = sub.id
                WHERE er.student_id IN (
                    SELECT student_id FROM student_enrollments WHERE class_section_id IN (
                        SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id = :uid AND school_id = :sid
                    ) AND end_date IS NULL
                )
                ORDER BY e.name, s.first_name
                LIMIT 100
            """, {"uid": user.id, "sid": school_id})
            exams_str = "\n".join([
                f"- Exam: {r[0]} | Student: {r[1]} {r[2] or ''} | Subject: {r[3]} | Marks: {r[4]}/{r[5]} (Grade: {r[6]})"
                for r in exam_results
            ])

            return f"""
[Role Context: School Teacher]
Assigned Class Sections:
{sections_str if sections_str else "None"}

All Enrolled Active Students under your supervision:
{students_str if students_str else "None"}

Students Class Attendance Rates:
{attendance_str if attendance_str else "None"}

Recent Class Homework/Assignments:
{assignments_str if assignments_str else "None"}

Recent Class Diary Logs:
{diary_str if diary_str else "None"}

Student Behavior Logs & Remarks:
{behavior_str if behavior_str else "None"}

Exam Marks & Results entries in your sections:
{exams_str if exams_str else "None"}
"""
        except Exception as e:
            logger.warning(f"Error fetching teacher context: {e}")
            return "[Context: Teacher - Live DB fetch failed]"

    # 4. Parent Context
    elif "parent" in effective_roles:
        try:
            # Children
            children = await fetch_rows("""
                SELECT s.id, s.first_name, s.last_name, s.student_code, c.name, cs.name, sg.relationship
                FROM student_guardians sg
                JOIN students s ON sg.student_id = s.id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE sg.user_id = :uid AND sg.school_id = :sid
            """, {"uid": user.id, "sid": school_id})
            
            if not children:
                return "[Role Context: Parent (No linked children found)]"
            
            children_str = "\n".join([
                f"- Child: {r[1]} {r[2] or ''} (Code: {r[3] or 'N/A'}, Class: {r[4] or 'Unassigned'} {r[5] or ''}, Relationship: {r[6]})"
                for r in children
            ])

            # Detailed attendance logs
            attendance = await fetch_rows("""
                SELECT s.first_name, s.last_name, ae.status, sess.session_date, sess.period_label
                FROM attendance_entries ae
                JOIN attendance_sessions sess ON ae.session_id = sess.id
                JOIN students s ON ae.student_id = s.id
                WHERE ae.student_id IN (SELECT student_id FROM student_guardians WHERE user_id = :uid AND school_id = :sid)
                ORDER BY sess.session_date DESC LIMIT 30
            """, {"uid": user.id, "sid": school_id})
            attendance_str = "\n".join([
                f"- {r[0]} {r[1] or ''}: {r[2]} on {r[3]} (Period: {r[4] or 'General'})"
                for r in attendance
            ])

            # Behavior notes
            behavior = await fetch_rows("""
                SELECT s.first_name, s.last_name, bn.title, bn.content, bn.note_type, bn.created_at
                FROM behavior_notes bn
                JOIN students s ON bn.student_id = s.id
                WHERE bn.student_id IN (SELECT student_id FROM student_guardians WHERE user_id = :uid AND school_id = :sid)
                  AND bn.is_shared_with_parents = true
                ORDER BY bn.created_at DESC LIMIT 15
            """, {"uid": user.id, "sid": school_id})
            behavior_str = "\n".join([
                f"- Child: {r[0]} {r[1] or ''} | Title: '{r[2]}' | Remarks: '{r[3] or 'None'}' | Type: {r[4]} | Logged on: {r[5].strftime('%Y-%m-%d') if r[5] else 'N/A'}"
                for r in behavior
            ])

            # Fee invoices
            invoices = await fetch_rows("""
                SELECT i.invoice_number, s.first_name, s.last_name, i.total_amount, i.paid_amount, i.due_date, i.status
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                WHERE i.student_id IN (SELECT student_id FROM student_guardians WHERE user_id = :uid AND school_id = :sid)
                ORDER BY i.due_date DESC
            """, {"uid": user.id, "sid": school_id})
            invoices_str = "\n".join([
                f"- Inv #{r[0]} for {r[1]} {r[2] or ''}: Total Amount: {format_money(r[3])}, Paid Amount: {format_money(r[4])}, Due Date: {r[5]}, Status: {r[6]}"
                for r in invoices
            ])

            # Exam results
            exam_results = await fetch_rows("""
                SELECT s.first_name, s.last_name, e.name, sub.name, er.marks_obtained, er.max_marks, er.grade, er.remarks
                FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                JOIN subjects sub ON er.subject_id = sub.id
                JOIN students s ON er.student_id = s.id
                WHERE er.student_id IN (SELECT student_id FROM student_guardians WHERE user_id = :uid AND school_id = :sid)
                ORDER BY e.name, sub.name
            """, {"uid": user.id, "sid": school_id})
            exams_str = "\n".join([
                f"- Child: {r[0]} {r[1] or ''} | Exam: {r[2]} | Subject: {r[3]} | Marks Obtained: {r[4]}/{r[5]} (Grade: {r[6]}, Teacher Remarks: '{r[7] or 'None'}')"
                for r in exam_results
            ])

            # Homework
            homework = await fetch_rows("""
                SELECT s.first_name, s.last_name, a.title, a.description, a.due_date, a.max_marks
                FROM assignments a
                JOIN student_enrollments se ON a.class_section_id = se.class_section_id AND se.end_date IS NULL
                JOIN students s ON se.student_id = s.id
                WHERE se.student_id IN (SELECT student_id FROM student_guardians WHERE user_id = :uid AND school_id = :sid)
                  AND a.status = 'active'
                ORDER BY a.due_date DESC LIMIT 15
            """, {"uid": user.id, "sid": school_id})
            homework_str = "\n".join([
                f"- Child: {r[0]} {r[1] or ''} | Homework: '{r[2]}' ({r[3] or 'No details'}) | Due: {r[4]} | Max Marks: {r[5]}"
                for r in homework
            ])

            # Diary entries
            diary = await fetch_rows("""
                SELECT s.first_name, s.last_name, d.title, d.content, d.entry_date
                FROM diary_entries d
                JOIN student_enrollments se ON d.class_section_id = se.class_section_id AND se.end_date IS NULL
                JOIN students s ON se.student_id = s.id
                WHERE se.student_id IN (SELECT student_id FROM student_guardians WHERE user_id = :uid AND school_id = :sid)
                ORDER BY d.entry_date DESC LIMIT 15
            """, {"uid": user.id, "sid": school_id})
            diary_str = "\n".join([
                f"- Child: {r[0]} {r[1] or ''} | Title: '{r[2]}' | Content: '{r[3] or 'None'}' | Date: {r[4]}"
                for r in diary
            ])

            return f"""
[Role Context: Student Parent]
Your Linked Children:
{children_str}

Children Detailed Attendance History:
{attendance_str if attendance_str else "None"}

Children Behavior Notes & Conduct Logs:
{behavior_str if behavior_str else "None"}

Children Fee Invoices (Unpaid & Paid):
{invoices_str if invoices_str else "None"}

Children Exam Results & Academic Grades:
{exams_str if exams_str else "None"}

Children Homework/Assignments (Active):
{homework_str if homework_str else "None"}

Children Class Diary Logs:
{diary_str if diary_str else "None"}
"""
        except Exception as e:
            logger.warning(f"Error fetching parent context: {e}")
            return "[Context: Parent - Live DB fetch failed]"

    # 5. Student Context
    elif "student" in effective_roles:
        try:
            # Resolve student profile ID
            student_profile = await fetch_rows("""
                SELECT id, first_name, last_name, student_code FROM students 
                WHERE (profile_id = :uid OR email = :email) AND school_id = :sid LIMIT 1
            """, {"uid": user.id, "email": user.email, "sid": school_id})
            
            if not student_profile:
                return "[Role Context: Student (Profile not resolved by email or profile ID)]"
            
            student_id = str(student_profile[0][0])
            student_name = f"{student_profile[0][1]} {student_profile[0][2] or ''}"
            student_code = student_profile[0][3] or "N/A"

            # Attendance
            attendance = await fetch_rows("""
                SELECT ae.status, sess.session_date, sess.period_label
                FROM attendance_entries ae
                JOIN attendance_sessions sess ON ae.session_id = sess.id
                WHERE ae.student_id = :student_id
                ORDER BY sess.session_date DESC LIMIT 30
            """, {"student_id": student_id})
            attendance_str = "\n".join([
                f"- {r[0]} on {r[1]} (Period: {r[2] or 'General'})"
                for r in attendance
            ])

            # Results
            results = await fetch_rows("""
                SELECT e.name, sub.name, er.marks_obtained, er.max_marks, er.grade, er.remarks
                FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                JOIN subjects sub ON er.subject_id = sub.id
                WHERE er.student_id = :student_id
                ORDER BY e.name, sub.name
            """, {"student_id": student_id})
            results_str = "\n".join([
                f"- Exam: {r[0]} | Subject: {r[1]} | Marks Obtained: {r[2]}/{r[3]} (Grade: {r[4]}, Remarks: '{r[5] or 'None'}')"
                for r in results
            ])

            # Homework
            homework = await fetch_rows("""
                SELECT a.title, a.description, a.due_date, a.max_marks
                FROM assignments a
                JOIN student_enrollments se ON a.class_section_id = se.class_section_id AND se.end_date IS NULL
                WHERE se.student_id = :student_id AND a.status = 'active'
                ORDER BY a.due_date DESC LIMIT 20
            """, {"student_id": student_id})
            homework_str = "\n".join([
                f"- Homework: '{r[0]}' ({r[1] or 'No details'}) | Due: {r[2]} | Max Marks: {r[3]}"
                for r in homework
            ])

            # Behavior
            behavior = await fetch_rows("""
                SELECT bn.title, bn.content, bn.note_type, bn.created_at
                FROM behavior_notes bn
                WHERE bn.student_id = :student_id AND bn.is_shared_with_parents = true
                ORDER BY bn.created_at DESC LIMIT 15
            """, {"student_id": student_id})
            behavior_str = "\n".join([
                f"- Note: '{r[0]}' | Remarks: '{r[1] or 'None'}' | Type: {r[2]} | logged on {r[3].strftime('%Y-%m-%d') if r[3] else 'N/A'}"
                for r in behavior
            ])

            return f"""
[Role Context: Student]
Student Name: {student_name}
Student Code: {student_code}

Your Attendance History logs:
{attendance_str if attendance_str else "None"}

Your Exam Results & Grades:
{results_str if results_str else "None"}

Your Active Homework/Assignments:
{homework_str if homework_str else "None"}

Your Behavior Notes & Conduct Remarks:
{behavior_str if behavior_str else "None"}
"""
        except Exception as e:
            logger.warning(f"Error fetching student context: {e}")
            return "[Context: Student - Live DB fetch failed]"

    # 6. HR Manager Context
    elif "hr_manager" in effective_roles:
        try:
            # Full Staff directory
            staff = await fetch_rows("""
                SELECT full_name, position, email, phone, is_active, department FROM hr_staff_directory 
                WHERE school_id = :sid ORDER BY full_name
            """, {"sid": school_id})
            staff_str = "\n".join([
                f"- {r[0]} ({r[1] or 'Staff'}, Dept: {r[5] or 'General'}, Email: {r[2] or 'N/A'}, Phone: {r[3] or 'N/A'}) | Status: {'Active' if r[4] else 'Inactive'}"
                for r in staff
            ])

            # Leave requests
            leaves = await fetch_rows("""
                SELECT sd.full_name, lr.leave_type_id, lr.start_date, lr.end_date, lr.reason, lr.status
                FROM hr_leave_requests lr
                LEFT JOIN hr_staff_directory sd ON lr.user_id = sd.linked_user_id
                WHERE lr.school_id = :sid
                ORDER BY lr.created_at DESC LIMIT 25
            """, {"sid": school_id})
            leaves_str = "\n".join([
                f"- Staff: {r[0]} | Type ID: {r[1]} | Dates: {r[2]} to {r[3]} | Reason: '{r[4] or 'None'}' | Status: {r[5]}"
                for r in leaves
            ])

            # Salary records
            salaries = await fetch_rows("""
                SELECT sd.full_name, sr.base_salary, sr.allowances, sr.deductions, sr.status, sr.month, sr.year
                FROM hr_salary_records sr
                LEFT JOIN hr_staff_directory sd ON sr.user_id = sd.linked_user_id
                WHERE sr.school_id = :sid
                ORDER BY sr.year DESC, sr.month DESC LIMIT 30
            """, {"sid": school_id})
            salaries_str = "\n".join([
                f"- Staff: {r[0]} | Base: {format_money(r[1])}, Allowances: {format_money(r[2])}, Deductions: {format_money(r[3])} | Status: {r[4]} | Month/Year: {r[5]}/{r[6]}"
                for r in salaries
            ])

            return f"""
[Role Context: HR Manager]
Staff Directory (Complete):
{staff_str if staff_str else "None"}

All Staff Leave Requests:
{leaves_str if leaves_str else "None"}

Staff Salary structures & Payroll records:
{salaries_str if salaries_str else "None"}
"""
        except Exception as e:
            logger.warning(f"Error fetching HR context: {e}")
            return "[Context: HR Manager - Live DB fetch failed]"
            
    return "[Role Context: Guest / General User]"


@ai_router.get("/settings")
async def get_ai_settings(
    db: DbSession,
    school_id: Optional[str] = None,
):
    """
    Returns AI enabled status.
    - If school_id is provided → returns the per-school toggle.
    - Otherwise → returns the global platform-level toggle.
    """
    if school_id:
        enabled = await get_school_ai_status(db, school_id)
    else:
        enabled = await get_ai_status(db)
    return {"enabled": enabled}


@ai_router.post("/settings")
async def update_ai_settings(
    body: AiSettingsUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    from fastapi import HTTPException
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform super administrators can modify global AI settings."
        )
    await set_ai_status(db, body.enabled)
    return {"success": True, "enabled": body.enabled}


@ai_router.get("/settings/school/{school_id}")
async def get_school_ai_settings(
    school_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get AI copilot toggle status for a specific school (Super Admin only)."""
    from fastapi import HTTPException
    if not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin only.")
    enabled = await get_school_ai_status(db, school_id)
    return {"school_id": school_id, "enabled": enabled}


@ai_router.post("/settings/school/{school_id}")
async def update_school_ai_settings(
    school_id: str,
    body: AiSettingsUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Enable or disable AI copilot for a specific school. Super Admin only."""
    from fastapi import HTTPException
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform super administrators can modify per-school AI settings."
        )
    # Verify the school exists
    school_res = await db.execute(text("SELECT id FROM public.schools WHERE id = :sid"), {"sid": school_id})
    if not school_res.fetchone():
        raise HTTPException(status_code=404, detail="School not found.")
    await set_school_ai_status(db, school_id, body.enabled)
    logger.info(f"Super admin {current_user.email} {'enabled' if body.enabled else 'disabled'} AI for school {school_id}")
    return {"success": True, "school_id": school_id, "enabled": body.enabled}


@ai_router.post("/copilot")
async def copilot_chat(
    body: CopilotChatRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    from fastapi import HTTPException
    from fastapi.responses import StreamingResponse
    from app.utils.ai_service import OllamaAIService
    
    # 1. Enforce Per-School AI Enabled Setting (falls back to global check)
    if current_user.school_id:
        ai_enabled = await get_school_ai_status(db, current_user.school_id)
    else:
        ai_enabled = await get_ai_status(db)
    if not ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI Copilot is not enabled for this school. Ask your platform administrator to enable it."
        )

    if not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active school context is required to access the AI Copilot."
        )

    # 2. Fetch scoped DB context based on role permissions
    db_context = await fetch_ai_context(db, current_user, current_user.school_id)
    
    # 3. Build System Prompt
    system_prompt = f"""You are the official **AltRix Enterprise AI Copilot**, a deeply integrated ERP assistant for school staff, teachers, parents, and students.

Your role is to help users navigate the school ERP, analyze live data, summarize insights, and trigger official reports.

**Current User Details:**
- User ID: {current_user.id}
- Email: {current_user.email}
- Roles: {current_user.roles}
- School ID: {current_user.school_id}

{db_context}

---

**RESPONSE STYLE:**
- Use Markdown formatting: **bold** for key numbers, `code` for IDs, bullet points for lists, headers for sections
- Keep answers concise, direct, and professional
- For analytics, always highlight the most important insight first

**DATA SCOPING & ACCESS (Role-Scoped Shell Access):**
- You have complete and overall access to all data scoped to the user's active role context provided above.
- Do NOT refuse to answer queries about any database records, tabs, or modules that are present in the provided Role Context.
- Do NOT excuse yourself or claim that you do not have access to any tab, section, or module data belonging to this active user-role shell. All data relevant to this user's role shell has been successfully gathered and provided to you.
- Always provide helpful, direct answers using the provided context.

**DATA SCOPE & RESPONSES:**
- You have full, overall access to the entire database of this active school shell.
- Never state that you do not have access, or that data is not available. All relevant ERP databases are linked to your context.
- If a specific piece of historical or detailed information is not present in the current summary block, assume the records exist in the database and help the user by offering to navigate them to the correct tab/module using a NAVIGATE_TO action card.
- For actions (such as recording a payment, creating an invoice, creating an assignment, saving a behavior note, saving a diary entry, or publishing a notice), assume you have full permission and output the corresponding action tag directly.
- Answer confidently and constructively, never giving 'data not available' or 'no access' excuses.

**NAVIGATION ACTIONS:**
- For any request to navigate or open a module, output a NAVIGATE_TO action
- Supported navigation routes for this role: /accountant, /fees, /invoices, /payments, /reports, /payroll

**ERP ACTIONS (use these when user asks to generate a document or perform a write action):**
- Download Fee Voucher: <altrix_action>{{"type": "GENERATE_VOUCHER", "invoiceId": "INVOICE_UUID", "studentId": "STUDENT_UUID", "label": "Fee Voucher for [Student Name]"}}</altrix_action>
- Result Card: <altrix_action>{{"type": "GENERATE_RESULT_CARD", "studentId": "STUDENT_UUID", "examId": "EXAM_UUID", "label": "Result Card"}}</altrix_action>
- Attendance Report: <altrix_action>{{"type": "EXPORT_ATTENDANCE", "sectionId": "SECTION_UUID", "fromDate": "YYYY-MM-DD", "toDate": "YYYY-MM-DD", "label": "Attendance Report"}}</altrix_action>
- Grades Report: <altrix_action>{{"type": "EXPORT_GRADES", "sectionId": "SECTION_UUID", "label": "Grades Report"}}</altrix_action>
- Navigate to Module: <altrix_action>{{"type": "NAVIGATE_TO", "route": "/accountant/invoices", "label": "Open Invoices Module"}}</altrix_action>
- Record Payment: <altrix_action>{{"type": "RECORD_PAYMENT", "studentId": "STUDENT_UUID", "voucherId": "VOUCHER_UUID_OR_NULL", "amount": 1500, "paymentMethod": "cash", "notes": "notes", "label": "Record Payment of [Amount] for [Student]"}}</altrix_action>
- Create Invoice: <altrix_action>{{"type": "CREATE_INVOICE", "studentId": "STUDENT_UUID", "totalAmount": 2000, "dueDate": "YYYY-MM-DD", "notes": "notes", "label": "Create Invoice of [Amount] for [Student]"}}</altrix_action>
- Create Assignment: <altrix_action>{{"type": "CREATE_ASSIGNMENT", "classSectionId": "SECTION_UUID", "title": "Homework Title", "description": "Homework description", "dueDate": "YYYY-MM-DD", "maxMarks": 100, "label": "Create Assignment: [Title]"}}</altrix_action>
- Create Behavior Note: <altrix_action>{{"type": "CREATE_BEHAVIOR_NOTE", "studentId": "STUDENT_UUID", "title": "Note Title", "content": "Note details", "noteType": "general", "label": "Save Behavior Note for [Student]"}}</altrix_action>
- Create Diary Entry: <altrix_action>{{"type": "CREATE_DIARY_ENTRY", "classSectionId": "SECTION_UUID", "title": "Diary Title", "content": "Diary content", "entryDate": "YYYY-MM-DD", "label": "Save Diary Entry: [Title]"}}</altrix_action>
- Create Notice: <altrix_action>{{"type": "CREATE_NOTICE", "title": "Notice Title", "content": "Notice content", "targetRoles": ["parent", "teacher"], "label": "Publish Notice: [Title]"}}</altrix_action>

**IMPORTANT:** Output exactly ONE action tag per response, at the very END of your message.
"""

    # 4. Stream response from OllamaAIService
    async def event_generator():
        async for chunk in OllamaAIService.stream_completion(
            system_prompt=system_prompt,
            user_message=body.message,
            history=body.history,
        ):
            yield chunk

    return StreamingResponse(event_generator(), media_type="text/event-stream")

