"""
Exams and results router: exams, datesheets, results, report cards.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status, Request
from app.cache import cache
from app.utils.cache_decorator import cache_response
from sqlalchemy import select, text, false as sa_false

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.exams import Exam, ExamDatesheet, ExamResult, AssessmentResult
from app.schemas import (
    ExamCreate, ExamOut,
    ExamResultCreate, ExamResultOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/exams", tags=["Exams"])


@router.get("", response_model=List[ExamOut])
@cache_response(ttl=300, key_prefix="exams:list")
async def list_exams(
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
    campus_id: Optional[UUID] = Query(None),
    academic_year: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(Exam).where(Exam.school_id == current_user.school_id)
    if campus_id:
        # campus_id is not a mapped column on Exam; filter yields no results
        query = query.where(sa_false())
    if academic_year:
        query = query.where(Exam.academic_year == academic_year)
    result = await db.execute(query.order_by(Exam.start_date.desc()))
    return result.scalars().all()


@router.post("", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
async def create_exam(body: ExamCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    exam = Exam(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(exam)
    await db.flush()
    await db.refresh(exam)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*exams:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["exams"])
    except Exception:
        pass
    return exam


@router.get("/report-card/{student_id}")
@cache_response(ttl=600, key_prefix="exams:report-card")
async def get_report_card(
    student_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
    academic_year: Optional[str] = Query(None),
):
    """Generate a comprehensive report card for a student."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    from app.utils.security import get_allowed_student_ids
    allowed_student_ids = await get_allowed_student_ids(current_user, db)
    if allowed_student_ids is not None and student_id not in allowed_student_ids:
        raise ForbiddenError("Permission denied: cannot access this student's report card")

    params = {"school_id": current_user.school_id, "student_id": str(student_id)}
    conditions = "er.school_id = :school_id AND er.student_id = :student_id"
    if academic_year:
        conditions += " AND e.academic_year = :academic_year"
        params["academic_year"] = academic_year

    result = await db.execute(
        text(f"""
            SELECT
                e.id as exam_id,
                e.title as exam_title,
                e.term,
                e.academic_year,
                er.subject_id,
                s.name as subject_name,
                er.marks_obtained,
                er.max_marks,
                er.percentage,
                er.grade,
                er.rank,
                er.remarks
            FROM exam_results er
            JOIN exams e ON er.exam_id = e.id
            LEFT JOIN subjects s ON er.subject_id = s.id
            WHERE {conditions}
            ORDER BY e.academic_year, e.term, s.name
        """),
        params,
    )
    rows = result.fetchall()
    return {
        "student_id": str(student_id),
        "results": [
            {
                "exam_id": str(row[0]),
                "exam_title": row[1],
                "term": row[2],
                "academic_year": row[3],
                "subject_id": str(row[4]) if row[4] else None,
                "subject_name": row[5],
                "marks_obtained": row[6],
                "max_marks": row[7],
                "percentage": row[8],
                "grade": row[9],
                "rank": row[10],
                "remarks": row[11],
            }
            for row in rows
        ],
    }


@router.get("/{exam_id}", response_model=ExamOut)
async def get_exam(exam_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, exam.school_id)
    return exam


@router.patch("/{exam_id}", response_model=ExamOut)
async def update_exam(exam_id: UUID, body: ExamCreate, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, exam.school_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(exam, field, value)
    await db.flush()
    await db.refresh(exam)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*exams:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["exams"])
    except Exception:
        pass
    return exam


@router.post("/{exam_id}/publish", response_model=ExamOut)
async def publish_exam(exam_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, exam.school_id)
    exam.is_published = True
    await db.flush()
    await db.refresh(exam)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*exams:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["exams"])
    except Exception:
        pass

    # Fire Event Bus triggers for published results
    try:
        from app.models.exams import ExamResult
        from app.models.people import Guardian
        from app.services.event_bus import EnterpriseEventBus
        from app.schemas import EventEnvelope

        res_query = select(ExamResult).where(ExamResult.exam_id == exam_id)
        res_list = (await db.execute(res_query)).scalars().all()

        for r in res_list:
            g_query = select(Guardian).where(
                Guardian.student_id == r.student_id
            ).order_by(Guardian.is_primary.desc())
            guardian = (await db.execute(g_query)).scalars().first()
            
            guardian_user_id = guardian.user_id if guardian else None

            await EnterpriseEventBus.publish(EventEnvelope(
                event_name="ResultPublished",
                category="academic",
                school_id=current_user.school_id,
                user_id=current_user.id,
                entity_type="exam_result",
                entity_id=r.id,
                payload={
                    "exam_name": exam.name,
                    "student_id": str(r.student_id),
                    "guardian_user_id": str(guardian_user_id) if guardian_user_id else None,
                    "marks_obtained": float(r.marks_obtained) if r.marks_obtained is not None else None,
                    "max_marks": float(r.max_marks) if r.max_marks is not None else None,
                },
                source="exams_router",
            ), db)
    except Exception as eb_err:
        import logging
        logging.getLogger("app.event_bus").warning(f"Failed to publish ResultPublished events: {eb_err}")

    return exam


@router.delete("/{exam_id}", response_model=MessageResponse)
async def delete_exam(exam_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in ACADEMIC_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, exam.school_id)
    await db.delete(exam)
    try:
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*exams:*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*reports:dashboard*")
        await cache.invalidate_pattern(f"*school_{current_user.school_id}_*pdf:*")
        # Semantic AI cache invalidation
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["exams"])
    except Exception:
        pass
    return MessageResponse(message="Exam deleted")


# ─── RESULTS ──────────────────────────────────────────────────────────────────

@router.get("/{exam_id}/results", response_model=List[ExamResultOut])
async def list_results(
    exam_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    student_id: Optional[UUID] = Query(None),
    section_id: Optional[UUID] = Query(None),
):
    # Verify exam belongs to school
    exam_res = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = exam_res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    from app.utils.security import require_school_match, get_allowed_student_ids
    require_school_match(current_user, exam.school_id)

    # Scoping for parents/students
    allowed_student_ids = await get_allowed_student_ids(current_user, db)
    
    query = select(ExamResult).where(ExamResult.exam_id == exam_id)
    if allowed_student_ids is not None:
        if student_id:
            if student_id not in allowed_student_ids:
                raise ForbiddenError("Permission denied: cannot access this student's results")
            query = query.where(ExamResult.student_id == student_id)
        else:
            if not allowed_student_ids:
                return []
            query = query.where(ExamResult.student_id.in_(allowed_student_ids))
    elif student_id:
        query = query.where(ExamResult.student_id == student_id)

    if section_id:
        query = query.where(sa_false())
        
    result = await db.execute(query.order_by(ExamResult.student_id))
    return result.scalars().all()


@router.post("/{exam_id}/results", response_model=ExamResultOut, status_code=status.HTTP_201_CREATED)
async def create_result(exam_id: UUID, body: ExamResultCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()
    # Verify exam belongs to school
    exam_res = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = exam_res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, exam.school_id)

    percentage = None
    if body.marks_obtained is not None and body.max_marks:
        percentage = round(body.marks_obtained / body.max_marks * 100, 2)

    res = ExamResult(
        school_id=current_user.school_id,
        exam_id=exam_id,
        percentage=percentage,
        graded_by=current_user.id,
        **body.model_dump(),
    )
    db.add(res)
    await db.flush()
    await db.refresh(res)
    return res


@router.put("/{exam_id}/results/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_results(
    exam_id: UUID,
    results: List[ExamResultCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    """Upload results for multiple students at once."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in [*ACADEMIC_GOV, "teacher"])):
        raise ForbiddenError()
    # Verify exam belongs to school
    exam_res = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = exam_res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    from app.utils.security import require_school_match
    require_school_match(current_user, exam.school_id)

    created = []
    for body in results:
        percentage = None
        if body.marks_obtained is not None and body.max_marks:
            percentage = round(body.marks_obtained / body.max_marks * 100, 2)
        res = ExamResult(
            school_id=current_user.school_id,
            exam_id=exam_id,
            percentage=percentage,
            graded_by=current_user.id,
            **body.model_dump(),
        )
        db.add(res)
        created.append(res)
    await db.flush()
    for r in created:
        await db.refresh(r)
    return created
