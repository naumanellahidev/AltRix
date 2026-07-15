"""
Report Cards router: templates, generation, publishing, QR verification, grade scales.
"""
import secrets
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Query, status, Request
from sqlalchemy import select, func, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.report_cards import (
    ReportCardTemplate, ReportCard, ReportCardSubjectEntry,
    CoCurricularGrade, GradeScale,
)
from app.models.exams import ExamResult, Exam
from app.models.people import Student
from app.models.academic import ClassSection, Subject
from app.schemas import (
    ReportCardTemplateCreate, ReportCardTemplateOut,
    ReportCardGenerateRequest, ReportCardOut,
    ReportCardSubjectEntryOut, ReportCardUpdateRemarks,
    CoCurricularGradeCreate, CoCurricularGradeOut,
    GradeScaleCreate, GradeScaleOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/report-cards", tags=["Report Cards"])


# ─── TEMPLATES ────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[ReportCardTemplateOut])
async def list_templates(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(ReportCardTemplate)
        .where(ReportCardTemplate.school_id == current_user.school_id, ReportCardTemplate.is_active == True)
        .order_by(ReportCardTemplate.is_default.desc(), ReportCardTemplate.name)
    )
    return result.scalars().all()


@router.post("/templates", response_model=ReportCardTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(body: ReportCardTemplateCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    # If this is default, unset other defaults
    if body.is_default:
        await db.execute(
            text("UPDATE report_card_templates SET is_default = FALSE WHERE school_id = :sid"),
            {"sid": current_user.school_id}
        )

    template = ReportCardTemplate(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **body.model_dump(exclude_none=True),
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.get("/templates/{template_id}", response_model=ReportCardTemplateOut)
async def get_template(template_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(ReportCardTemplate).where(ReportCardTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise NotFoundError("Template", str(template_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, t.school_id)
    return t


@router.patch("/templates/{template_id}", response_model=ReportCardTemplateOut)
async def update_template(template_id: UUID, body: ReportCardTemplateCreate, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(ReportCardTemplate).where(ReportCardTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise NotFoundError("Template", str(template_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, t.school_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(t, field, value)
    await db.flush()
    await db.refresh(t)
    return t


@router.delete("/templates/{template_id}", response_model=MessageResponse)
async def delete_template(template_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(ReportCardTemplate).where(ReportCardTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise NotFoundError("Template", str(template_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, t.school_id)
    t.is_active = False
    await db.flush()
    return MessageResponse(message="Template deactivated")


# ─── GRADE SCALES ─────────────────────────────────────────────────────────────

@router.get("/grade-scales", response_model=List[GradeScaleOut])
async def list_grade_scales(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    result = await db.execute(
        select(GradeScale)
        .where(GradeScale.school_id == current_user.school_id, GradeScale.is_active == True)
        .order_by(GradeScale.sort_order, GradeScale.min_percentage.desc())
    )
    return result.scalars().all()


@router.post("/grade-scales", response_model=List[GradeScaleOut])
async def upsert_grade_scales(
    scales: List[GradeScaleCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    """Bulk upsert grade scales — replaces all existing scales."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    # Deactivate existing
    await db.execute(
        text("UPDATE grade_scales SET is_active = FALSE WHERE school_id = :sid"),
        {"sid": current_user.school_id}
    )

    created = []
    for i, s in enumerate(scales):
        gs = GradeScale(
            school_id=current_user.school_id,
            label=s.label,
            min_percentage=s.min_percentage,
            max_percentage=s.max_percentage,
            gpa_points=s.gpa_points,
            description=s.description,
            color=s.color,
            sort_order=s.sort_order if s.sort_order else i,
        )
        db.add(gs)
        created.append(gs)
    await db.flush()
    for gs in created:
        await db.refresh(gs)
    return created


# ─── REPORT CARD GENERATION ──────────────────────────────────────────────────

@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_report_cards(
    body: ReportCardGenerateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Generate report cards for all students in a class/section based on exam results."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    school_id = current_user.school_id

    # Get students in section
    students_result = await db.execute(
        select(Student).where(
            Student.school_id == school_id,
            Student.section_id == body.class_section_id,
            Student.status == "active",
        )
    )
    students = students_result.scalars().all()
    if not students:
        return {"message": "No students found in this section", "count": 0}

    student_ids = [s.id for s in students]

    # Get template
    template = None
    if body.template_id:
        t_result = await db.execute(select(ReportCardTemplate).where(ReportCardTemplate.id == body.template_id))
        template = t_result.scalar_one_or_none()
    if not template:
        t_result = await db.execute(
            select(ReportCardTemplate).where(
                ReportCardTemplate.school_id == school_id,
                ReportCardTemplate.is_default == True,
            )
        )
        template = t_result.scalar_one_or_none()

    # Get grade scales for computing grades
    gs_result = await db.execute(
        select(GradeScale).where(
            GradeScale.school_id == school_id,
            GradeScale.is_active == True,
        ).order_by(GradeScale.min_percentage.desc())
    )
    grade_scales = gs_result.scalars().all()

    def compute_grade(pct):
        for gs in grade_scales:
            if gs.min_percentage <= pct <= gs.max_percentage:
                return gs.label, gs.gpa_points
        # Fallback
        if pct >= 90: return "A+", 4.0
        if pct >= 80: return "A", 3.7
        if pct >= 70: return "B", 3.0
        if pct >= 60: return "C", 2.3
        if pct >= 50: return "D", 1.7
        return "F", 0.0

    # Get exam results if exam_id specified
    results_by_student = {}
    if body.exam_id:
        er_result = await db.execute(
            select(ExamResult).where(
                ExamResult.exam_id == body.exam_id,
                ExamResult.student_id.in_(student_ids),
            )
        )
        for r in er_result.scalars().all():
            results_by_student.setdefault(r.student_id, []).append(r)

    # Get subjects
    subjects_result = await db.execute(
        select(Subject).where(Subject.school_id == school_id)
    )
    subjects_map = {s.id: s.name for s in subjects_result.scalars().all()}

    # Compute per-subject class statistics (for position calculation)
    subject_marks = {}  # {subject_id: [(student_id, marks, max)]}
    for sid, results in results_by_student.items():
        for r in results:
            if r.subject_id and r.marks_obtained is not None:
                subject_marks.setdefault(r.subject_id, []).append(
                    (sid, r.marks_obtained, r.max_marks or 100)
                )

    # Compute total marks per student for ranking
    student_totals = {}
    for sid, results in results_by_student.items():
        total_obtained = sum(r.marks_obtained or 0 for r in results)
        total_max = sum(r.max_marks or 100 for r in results)
        student_totals[sid] = (total_obtained, total_max)

    # Sort students by total percentage for ranking
    ranked = sorted(
        student_totals.items(),
        key=lambda x: (x[1][0] / x[1][1] * 100) if x[1][1] else 0,
        reverse=True,
    )
    student_positions = {sid: pos + 1 for pos, (sid, _) in enumerate(ranked)}

    # Per-subject ranking
    subject_positions = {}
    for subj_id, marks_list in subject_marks.items():
        sorted_marks = sorted(marks_list, key=lambda x: (x[1] / x[2] * 100) if x[2] else 0, reverse=True)
        for pos, (sid, _, _) in enumerate(sorted_marks):
            subject_positions[(sid, subj_id)] = pos + 1

    # Per-subject stats
    subject_stats = {}
    for subj_id, marks_list in subject_marks.items():
        pcts = [(m / mx * 100) if mx else 0 for _, m, mx in marks_list]
        subject_stats[subj_id] = {
            "average": sum(pcts) / len(pcts) if pcts else 0,
            "highest": max(pcts) if pcts else 0,
        }

    # Get historical report cards for trend data
    trend_query = await db.execute(
        select(ReportCard).where(
            ReportCard.school_id == school_id,
            ReportCard.student_id.in_(student_ids),
            ReportCard.is_published == True,
        ).order_by(ReportCard.created_at)
    )
    history = {}
    for rc in trend_query.scalars().all():
        history.setdefault(rc.student_id, []).append({
            "period": rc.period_label,
            "percentage": rc.percentage,
            "gpa": rc.gpa,
            "grade": rc.overall_grade,
        })

    # Generate report cards
    created_cards = []
    for student in students:
        results = results_by_student.get(student.id, [])
        total_obtained = sum(r.marks_obtained or 0 for r in results)
        total_max = sum(r.max_marks or 100 for r in results)
        pct = round(total_obtained / total_max * 100, 2) if total_max else 0
        grade_label, gpa_val = compute_grade(pct)

        trend = history.get(student.id, [])
        trend.append({"period": body.period_label, "percentage": pct, "gpa": gpa_val, "grade": grade_label})

        rc = ReportCard(
            school_id=school_id,
            student_id=student.id,
            template_id=template.id if template else None,
            exam_id=body.exam_id,
            period_type=body.period_type or "term",
            period_label=body.period_label,
            academic_year=body.academic_year,
            total_marks=total_obtained,
            max_total_marks=total_max,
            percentage=pct,
            gpa=gpa_val,
            overall_grade=grade_label,
            position_in_class=student_positions.get(student.id),
            total_students_in_class=len(students),
            trend_data=trend,
            generated_by=current_user.id,
        )
        db.add(rc)
        await db.flush()

        # Add subject entries
        for r in results:
            subj_pct = round(r.marks_obtained / r.max_marks * 100, 2) if r.max_marks and r.marks_obtained is not None else 0
            subj_grade, subj_gpa = compute_grade(subj_pct)
            stats = subject_stats.get(r.subject_id, {})

            entry = ReportCardSubjectEntry(
                report_card_id=rc.id,
                subject_id=r.subject_id,
                subject_name=subjects_map.get(r.subject_id, "Unknown"),
                marks_obtained=r.marks_obtained,
                max_marks=r.max_marks,
                percentage=subj_pct,
                grade=r.grade or subj_grade,
                gpa_points=subj_gpa,
                position_in_subject=subject_positions.get((student.id, r.subject_id)),
                class_average=round(stats.get("average", 0), 1),
                highest_in_class=round(stats.get("highest", 0), 1),
                teacher_comment=r.remarks,
            )
            db.add(entry)

        created_cards.append(rc)

    await db.flush()
    for rc in created_cards:
        await db.refresh(rc)

    return {"message": f"Generated {len(created_cards)} report cards", "count": len(created_cards)}


# ─── REPORT CARD CRUD ────────────────────────────────────────────────────────

@router.get("/student/{student_id}", response_model=List[ReportCardOut])
async def get_student_report_cards(
    student_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    academic_year: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []

    from app.utils.security import get_allowed_student_ids
    allowed = await get_allowed_student_ids(current_user, db)
    if allowed is not None and student_id not in allowed:
        raise ForbiddenError("Permission denied")

    query = select(ReportCard).where(
        ReportCard.school_id == current_user.school_id,
        ReportCard.student_id == student_id,
    )
    if academic_year:
        query = query.where(ReportCard.academic_year == academic_year)

    result = await db.execute(query.order_by(ReportCard.created_at.desc()))
    return result.scalars().all()


@router.get("/{card_id}")
async def get_report_card_detail(card_id: UUID, current_user: CurrentUser, db: DbSession):
    """Get report card with all subject entries and co-curricular grades."""
    result = await db.execute(select(ReportCard).where(ReportCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise NotFoundError("Report Card", str(card_id))

    from app.utils.security import require_school_match
    require_school_match(current_user, card.school_id)

    # Get subject entries
    entries_result = await db.execute(
        select(ReportCardSubjectEntry)
        .where(ReportCardSubjectEntry.report_card_id == card_id)
        .order_by(ReportCardSubjectEntry.sort_order)
    )
    entries = entries_result.scalars().all()

    # Get co-curricular grades
    cc_result = await db.execute(
        select(CoCurricularGrade)
        .where(CoCurricularGrade.report_card_id == card_id)
        .order_by(CoCurricularGrade.sort_order)
    )
    co_curricular = cc_result.scalars().all()

    # Get student info
    student_result = await db.execute(select(Student).where(Student.id == card.student_id))
    student = student_result.scalar_one_or_none()

    return {
        "report_card": ReportCardOut.model_validate(card).model_dump(),
        "subject_entries": [ReportCardSubjectEntryOut.model_validate(e).model_dump() for e in entries],
        "co_curricular": [CoCurricularGradeOut.model_validate(c).model_dump() for c in co_curricular],
        "student": {
            "id": str(student.id),
            "first_name": student.first_name,
            "last_name": student.last_name,
            "roll_number": student.roll_number,
            "photo_url": student.photo_url,
        } if student else None,
    }


@router.patch("/{card_id}/remarks", response_model=ReportCardOut)
async def update_remarks(card_id: UUID, body: ReportCardUpdateRemarks, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()
    result = await db.execute(select(ReportCard).where(ReportCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise NotFoundError("Report Card", str(card_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, card.school_id)
    if body.teacher_remarks is not None:
        card.teacher_remarks = body.teacher_remarks
    if body.principal_remarks is not None:
        card.principal_remarks = body.principal_remarks
    await db.flush()
    await db.refresh(card)
    return card


@router.post("/{card_id}/publish", response_model=ReportCardOut)
async def publish_report_card(card_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(ReportCard).where(ReportCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise NotFoundError("Report Card", str(card_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, card.school_id)

    card.is_published = True
    card.published_at = datetime.now(timezone.utc)
    card.qr_verification_token = secrets.token_urlsafe(32)

    # Get template for signature
    if card.template_id:
        t_result = await db.execute(select(ReportCardTemplate).where(ReportCardTemplate.id == card.template_id))
        template = t_result.scalar_one_or_none()
        if template and template.show_digital_signature:
            card.signed_by_name = template.principal_signature_name or "Principal"
            card.signed_by_title = template.principal_signature_title or "Principal"
            card.signed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(card)
    return card


@router.post("/publish-bulk", response_model=MessageResponse)
async def bulk_publish(
    card_ids: List[UUID],
    current_user: CurrentUser,
    db: DbSession,
):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()

    count = 0
    for cid in card_ids:
        result = await db.execute(select(ReportCard).where(ReportCard.id == cid))
        card = result.scalar_one_or_none()
        if card and card.school_id == current_user.school_id:
            card.is_published = True
            card.published_at = datetime.now(timezone.utc)
            card.qr_verification_token = secrets.token_urlsafe(32)
            count += 1
    await db.flush()
    return MessageResponse(message=f"Published {count} report cards")


# ─── QR VERIFICATION (PUBLIC) ────────────────────────────────────────────────

@router.get("/verify/{token}")
async def verify_report_card(token: str, db: DbSession):
    """Public endpoint to verify a report card via QR code token."""
    result = await db.execute(
        select(ReportCard).where(ReportCard.qr_verification_token == token)
    )
    card = result.scalar_one_or_none()
    if not card:
        return {"verified": False, "message": "Invalid or expired verification token"}

    student_result = await db.execute(select(Student).where(Student.id == card.student_id))
    student = student_result.scalar_one_or_none()

    return {
        "verified": True,
        "student_name": f"{student.first_name} {student.last_name}" if student else "Unknown",
        "period": card.period_label,
        "academic_year": card.academic_year,
        "percentage": card.percentage,
        "grade": card.overall_grade,
        "position": card.position_in_class,
        "total_students": card.total_students_in_class,
        "published_at": card.published_at.isoformat() if card.published_at else None,
        "signed_by": card.signed_by_name,
    }


# ─── CO-CURRICULAR GRADES ────────────────────────────────────────────────────

@router.post("/{card_id}/co-curricular", response_model=List[CoCurricularGradeOut])
async def add_co_curricular(
    card_id: UUID,
    grades: List[CoCurricularGradeCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()

    result = await db.execute(select(ReportCard).where(ReportCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise NotFoundError("Report Card", str(card_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, card.school_id)

    created = []
    for i, g in enumerate(grades):
        cc = CoCurricularGrade(
            report_card_id=card_id,
            activity_name=g.activity_name,
            category=g.category,
            grade=g.grade,
            score=g.score,
            max_score=g.max_score,
            remarks=g.remarks,
            sort_order=i,
        )
        db.add(cc)
        created.append(cc)

    await db.flush()
    for cc in created:
        await db.refresh(cc)
    return created
