"""
Exams and results router: exams, datesheets, results, report cards.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import select, text

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
async def list_exams(
    current_user: CurrentUser,
    db: DbSession,
    campus_id: Optional[UUID] = Query(None),
    academic_year: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(Exam).where(Exam.school_id == current_user.school_id)
    if campus_id:
        query = query.where(Exam.campus_id == campus_id)
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
    return exam


@router.get("/report-card/{student_id}")
async def get_report_card(
    student_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    academic_year: Optional[str] = Query(None),
):
    """Generate a comprehensive report card for a student."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

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
    return exam


@router.patch("/{exam_id}", response_model=ExamOut)
async def update_exam(exam_id: UUID, body: ExamCreate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(exam, field, value)
    await db.flush()
    await db.refresh(exam)
    return exam


@router.post("/{exam_id}/publish", response_model=ExamOut)
async def publish_exam(exam_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    exam.is_published = True
    await db.flush()
    await db.refresh(exam)
    return exam


@router.delete("/{exam_id}", response_model=MessageResponse)
async def delete_exam(exam_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam", str(exam_id))
    await db.delete(exam)
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
    query = select(ExamResult).where(ExamResult.exam_id == exam_id)
    if student_id:
        query = query.where(ExamResult.student_id == student_id)
    if section_id:
        query = query.where(ExamResult.class_section_id == section_id)
    result = await db.execute(query.order_by(ExamResult.student_id))
    return result.scalars().all()


@router.post("/{exam_id}/results", response_model=ExamResultOut, status_code=status.HTTP_201_CREATED)
async def create_result(exam_id: UUID, body: ExamResultCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    # Calculate percentage
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
