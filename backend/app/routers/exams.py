"""
Exams and results router: exams, datesheets, results, report cards, rooms, seating plans.
"""
import logging
from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status, Request, HTTPException
from app.cache import cache
from app.utils.cache_decorator import cache_response
from pydantic import BaseModel, Field
from sqlalchemy import select, text, false as sa_false

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.exams import (
    Exam, ExamDatesheet, ExamResult, AssessmentResult,
    ExamRoom, ExamSeatingPlan, ExamSeatAssignment, ExamInvigilator,
)
from app.models.people import Student
from app.schemas import (
    ExamCreate, ExamOut,
    ExamResultCreate, ExamResultOut,
    ExamRoomCreate, ExamRoomOut, ExamSeatingPlanOut, ExamSeatAssignmentOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, ACADEMIC_GOV
from app.utils.pagination import ListPageParams
from app.utils.security import get_allowed_student_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exams", tags=["Exams"])


@router.get("", response_model=List[ExamOut])
@cache_response(ttl=300, key_prefix="exams:list")
async def list_exams(
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
    page: ListPageParams, campus_id: Optional[UUID] = Query(None),
    academic_year: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []

    if current_user.campus_id and not campus_id:
        try:
            campus_id = UUID(current_user.campus_id)
        except (ValueError, TypeError):
            pass

    query = select(Exam).where(Exam.school_id == current_user.school_id)
    if campus_id:
        from app.models.academic import ClassSection
        query = query.where(
            Exam.id.in_(
                select(ExamDatesheet.exam_id)
                .join(ClassSection, ClassSection.id == ExamDatesheet.class_section_id)
                .where(ClassSection.campus_id == campus_id)
            )
        )
    if academic_year:
        query = query.where(Exam.academic_year == academic_year)
    result = await db.execute(page.apply(query.order_by(Exam.start_date.desc())))
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
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["exams"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
    return exam


# ─── EXAMS SEATING ARRANGEMENTS & ROOMS (Static Routes Before Parameterized /{exam_id}) ──────
#
# Rooms and seating plans are written by academic staff only, always inside
# the caller's school. A plan is generated from the students actually enrolled
# in the chosen sections; with two or more sections the seats alternate
# between them like a chessboard so no two neighbours sit the same paper from
# the same class. Families see only their own children's seats.


class SeatingGenerateRequest(BaseModel):
    exam_id: UUID
    class_section_ids: List[UUID] = Field(..., min_length=1)
    room_ids: List[UUID] = Field(..., min_length=1)
    exam_date: Optional[date] = None
    start_time: Optional[str] = Field(None, max_length=20)
    session_label: Optional[str] = Field(None, max_length=120)


class InvigilatorRequest(BaseModel):
    staff_user_id: UUID
    role: str = Field("primary", pattern="^(primary|secondary|helper)$")


def _require_exam_staff(current_user) -> None:
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    if current_user.is_super_admin:
        return
    if not any(r in expand_roles(current_user.roles) for r in ACADEMIC_GOV):
        raise ForbiddenError("Only academic staff manage exam halls and seating")


def seat_label(row: int, col: int) -> str:
    """0-indexed row/column -> "A-1", "B-3", ... "AA-2" past row 26."""
    letters = ""
    n = row + 1
    while n:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return f"{letters}-{col + 1}"


def allocate_seats(sections: List[List[UUID]], rooms: List[tuple]) -> List[tuple]:
    """
    Place students in rooms. `sections` is one roll-ordered list of student ids
    per section; `rooms` is (room_id, rows, cols). Returns (room_id, row, col,
    student_id). Seat (r, c) is offered first to section (r + c) mod k, so with
    two or more sections neighbours come from different sections; when that
    section has run out, the seat goes to whichever section has most left.
    """
    queues = [list(s) for s in sections if s]
    k = len(queues)
    out = []
    for room_id, rows, cols in rooms:
        for r in range(rows):
            for c in range(cols):
                if not any(queues):
                    return out
                preferred = (r + c) % k
                q = queues[preferred] if queues[preferred] else max(queues, key=len)
                out.append((room_id, r, c, q.pop(0)))
    return out


@router.get("/rooms", response_model=List[ExamRoomOut])
async def list_exam_rooms(current_user: CurrentUser, db: DbSession, page: ListPageParams):
    """List physical classrooms/halls registered for exams."""
    if not current_user.school_id:
        return []
    res = await db.execute(
        page.apply(
            select(ExamRoom).where(ExamRoom.school_id == current_user.school_id).order_by(ExamRoom.room_name)
        )
    )
    return list(res.scalars().all())


@router.post("/rooms", response_model=ExamRoomOut, status_code=status.HTTP_201_CREATED)
async def create_exam_room(body: ExamRoomCreate, current_user: CurrentUser, db: DbSession):
    """Register a new exam room with rows/cols capacities."""
    _require_exam_staff(current_user)
    name = (body.room_name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Give the hall a name")
    if not (1 <= body.capacity_rows <= 60 and 1 <= body.capacity_cols <= 60):
        raise HTTPException(status_code=422, detail="Rows and columns must each be between 1 and 60")
    room = ExamRoom(
        school_id=current_user.school_id,
        room_name=name,
        capacity_rows=body.capacity_rows,
        capacity_cols=body.capacity_cols,
        total_capacity=body.capacity_rows * body.capacity_cols,
    )
    db.add(room)
    await db.flush()
    await db.commit()
    await db.refresh(room)
    return room


@router.delete("/rooms/{room_id}", response_model=MessageResponse)
async def delete_exam_room(room_id: UUID, current_user: CurrentUser, db: DbSession):
    _require_exam_staff(current_user)
    room = (
        await db.execute(select(ExamRoom).where(ExamRoom.id == room_id, ExamRoom.school_id == current_user.school_id))
    ).scalar_one_or_none()
    if room is None:
        raise NotFoundError("ExamRoom", str(room_id))
    in_use = (
        await db.execute(select(ExamSeatingPlan.id).where(ExamSeatingPlan.room_id == room_id).limit(1))
    ).first()
    if in_use:
        raise HTTPException(status_code=409, detail="This hall has seating plans; delete those first")
    await db.delete(room)
    await db.commit()
    return MessageResponse(message="Hall removed")


async def _plans_out(db, school_id, plan_filter=None, student_filter: Optional[List[UUID]] = None) -> list:
    """Plans with room, exam, invigilators and seats, in a fixed number of queries."""
    q = select(ExamSeatingPlan).where(ExamSeatingPlan.school_id == school_id)
    if plan_filter is not None:
        q = q.where(plan_filter)
    if student_filter is not None:
        q = q.where(
            ExamSeatingPlan.id.in_(
                select(ExamSeatAssignment.seating_plan_id).where(ExamSeatAssignment.student_id.in_(student_filter))
            )
        )
    plans = list((await db.execute(q.order_by(ExamSeatingPlan.exam_date.desc().nullslast(), ExamSeatingPlan.created_at.desc()))).scalars().all())
    if not plans:
        return []
    plan_ids = [p.id for p in plans]

    rooms = {
        r.id: r
        for r in (await db.execute(select(ExamRoom).where(ExamRoom.id.in_({p.room_id for p in plans})))).scalars().all()
    }
    exams = {
        e.id: e
        for e in (await db.execute(select(Exam).where(Exam.id.in_({p.exam_id for p in plans})))).scalars().all()
    }
    seat_q = select(ExamSeatAssignment).where(ExamSeatAssignment.seating_plan_id.in_(plan_ids))
    if student_filter is not None:
        seat_q = seat_q.where(ExamSeatAssignment.student_id.in_(student_filter))
    seats = list((await db.execute(seat_q)).scalars().all())

    people = {}
    student_ids = list({s.student_id for s in seats})
    if student_ids:
        rows = await db.execute(
            text(
                """
                SELECT s.id, s.first_name, s.last_name, s.roll_number,
                       NULLIF(TRIM(CONCAT_WS(' ', ac.name, cs.name)), '') AS section
                FROM students s
                LEFT JOIN LATERAL (
                    SELECT e.class_section_id FROM student_enrollments e
                    WHERE e.student_id = s.id AND e.end_date IS NULL
                    ORDER BY e.start_date DESC NULLS LAST LIMIT 1
                ) en ON TRUE
                LEFT JOIN class_sections cs ON cs.id = en.class_section_id
                LEFT JOIN academic_classes ac ON ac.id = cs.class_id
                WHERE s.id = ANY(CAST(:ids AS UUID[]))
                """
            ),
            {"ids": [str(i) for i in student_ids]},
        )
        for r in rows.mappings():
            people[r["id"]] = r

    invigilators = list(
        (await db.execute(select(ExamInvigilator).where(ExamInvigilator.seating_plan_id.in_(plan_ids)))).scalars().all()
    )
    staff_names = {}
    if invigilators:
        try:
            directory = await db.execute(
                text("SELECT user_id, display_name, email FROM public.get_school_staff_directory(CAST(:school AS UUID))"),
                {"school": str(school_id)},
            )
            staff_names = {r["user_id"]: (r["display_name"] or r["email"]) for r in directory.mappings()}
        except Exception as exc:  # the names are a courtesy; the plan still lists the ids
            logger.warning("Staff directory unavailable for invigilator names: %s", exc)

    out = []
    for p in plans:
        room = rooms.get(p.room_id)
        exam = exams.get(p.exam_id)
        plan_seats = []
        for s in seats:
            if s.seating_plan_id != p.id:
                continue
            person = people.get(s.student_id)
            name = " ".join(x for x in [person["first_name"], person["last_name"]] if x) if person else ""
            plan_seats.append({
                "student_id": s.student_id,
                "student_name": name or "Student",
                "roll_number": person["roll_number"] if person else None,
                "section": person["section"] if person else None,
                "row": s.row_num,
                "col": s.col_num,
                "seat": seat_label(s.row_num, s.col_num),
            })
        plan_seats.sort(key=lambda x: (x["row"], x["col"]))
        out.append({
            "id": p.id,
            "exam_id": p.exam_id,
            "exam_name": exam.name if exam else None,
            "room_id": p.room_id,
            "room_name": room.room_name if room else None,
            "rows": room.capacity_rows if room else None,
            "cols": room.capacity_cols if room else None,
            "exam_date": p.exam_date.isoformat() if p.exam_date else None,
            "start_time": p.start_time,
            "session_label": p.session_label,
            "invigilators": [
                {"staff_user_id": i.staff_user_id, "role": i.role, "name": staff_names.get(i.staff_user_id)}
                for i in invigilators
                if i.seating_plan_id == p.id
            ],
            "seats": plan_seats,
            "created_at": p.created_at,
        })
    return out


@router.get("/seating-plans")
async def list_seating_plans(
    current_user: CurrentUser,
    db: DbSession,
    exam_id: Optional[UUID] = Query(None),
):
    """Seating plans of the school: academic staff, and teachers who invigilate."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or "teacher" in effective or any(r in effective for r in ACADEMIC_GOV)):
        raise ForbiddenError("Only staff can see seating plans")
    return await _plans_out(db, current_user.school_id, ExamSeatingPlan.exam_id == exam_id if exam_id else None)


@router.get("/seating-plans/my")
async def my_seating(current_user: CurrentUser, db: DbSession, student_id: Optional[UUID] = Query(None)):
    """A family's own children's seats (or a student's own), nobody else's."""
    if not current_user.school_id:
        return []
    allowed = await get_allowed_student_ids(current_user, db)
    if allowed is None:
        if student_id is None:
            raise HTTPException(status_code=422, detail="Choose a student")
        ids = [student_id]
    else:
        ids = [UUID(str(a)) for a in allowed]
        if student_id is not None:
            if student_id not in ids:
                raise ForbiddenError("You can only see your own children's seats")
            ids = [student_id]
    if not ids:
        return []
    return await _plans_out(db, current_user.school_id, student_filter=ids)


@router.post("/seating-plans/generate", status_code=status.HTTP_201_CREATED)
async def generate_seating_arrangement(body: SeatingGenerateRequest, current_user: CurrentUser, db: DbSession):
    """
    Seat the students of the chosen sections across the chosen halls for one
    sitting of an exam, alternating sections seat by seat.
    """
    _require_exam_staff(current_user)
    school_id = current_user.school_id

    exam = (
        await db.execute(select(Exam).where(Exam.id == body.exam_id, Exam.school_id == school_id))
    ).scalar_one_or_none()
    if exam is None:
        raise NotFoundError("Exam", str(body.exam_id))

    section_ids = list(dict.fromkeys(body.class_section_ids))
    rows = await db.execute(
        text(
            """
            SELECT e.class_section_id, s.id, s.roll_number, s.first_name, s.last_name
            FROM student_enrollments e
            JOIN students s ON s.id = e.student_id
            JOIN class_sections cs ON cs.id = e.class_section_id
            WHERE e.class_section_id = ANY(CAST(:sections AS UUID[]))
              AND e.end_date IS NULL
              AND s.school_id = CAST(:school AS UUID)
              AND cs.school_id = CAST(:school AS UUID)
            """
        ),
        {"sections": [str(i) for i in section_ids], "school": str(school_id)},
    )
    by_section = {sid: [] for sid in section_ids}
    seen = set()
    for r in rows.mappings():
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        by_section.setdefault(UUID(str(r["class_section_id"])), []).append(r)
    ordered = [
        [
            r["id"]
            for r in sorted(
                group,
                key=lambda r: (
                    (r["roll_number"] or "").zfill(12),
                    f"{r['first_name'] or ''} {r['last_name'] or ''}",
                ),
            )
        ]
        for group in by_section.values()
    ]
    total_students = sum(len(g) for g in ordered)
    if not total_students:
        raise HTTPException(status_code=400, detail="No students are currently enrolled in the chosen sections")

    room_ids = list(dict.fromkeys(body.room_ids))
    room_rows = {
        r.id: r
        for r in (
            await db.execute(select(ExamRoom).where(ExamRoom.id.in_(room_ids), ExamRoom.school_id == school_id))
        ).scalars().all()
    }
    if len(room_rows) != len(room_ids):
        raise HTTPException(status_code=400, detail="One or more halls were not found")
    rooms = [room_rows[i] for i in room_ids]
    capacity = sum(r.capacity_rows * r.capacity_cols for r in rooms)
    if total_students > capacity:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough seats: {total_students} students, {capacity} seats in the chosen halls",
        )

    placements = allocate_seats(ordered, [(r.id, r.capacity_rows, r.capacity_cols) for r in rooms])
    plans = {}
    for room_id, row, col, student_id in placements:
        if room_id not in plans:
            plan = ExamSeatingPlan(
                school_id=school_id,
                exam_id=exam.id,
                room_id=room_id,
                exam_date=body.exam_date,
                start_time=(body.start_time or "").strip() or None,
                session_label=(body.session_label or "").strip() or None,
                created_by=UUID(str(current_user.id)) if current_user.id else None,
            )
            db.add(plan)
            await db.flush()
            plans[room_id] = plan
        db.add(ExamSeatAssignment(seating_plan_id=plans[room_id].id, student_id=student_id, row_num=row, col_num=col))
    await db.commit()
    return {
        "message": f"Seated {total_students} students in {len(plans)} hall(s)",
        "plans": [p.id for p in plans.values()],
        "students": total_students,
    }


@router.delete("/seating-plans/{plan_id}", response_model=MessageResponse)
async def delete_seating_plan(plan_id: UUID, current_user: CurrentUser, db: DbSession):
    _require_exam_staff(current_user)
    plan = (
        await db.execute(
            select(ExamSeatingPlan).where(ExamSeatingPlan.id == plan_id, ExamSeatingPlan.school_id == current_user.school_id)
        )
    ).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("ExamSeatingPlan", str(plan_id))
    await db.delete(plan)
    await db.commit()
    return MessageResponse(message="Seating plan deleted")


@router.post("/seating-plans/{plan_id}/invigilators", response_model=MessageResponse)
async def assign_invigilator(plan_id: UUID, body: InvigilatorRequest, current_user: CurrentUser, db: DbSession):
    """Assign an invigilator to a hall's seating plan, within the caller's school."""
    _require_exam_staff(current_user)
    plan = (
        await db.execute(
            select(ExamSeatingPlan).where(ExamSeatingPlan.id == plan_id, ExamSeatingPlan.school_id == current_user.school_id)
        )
    ).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("ExamSeatingPlan", str(plan_id))
    exists = (
        await db.execute(
            select(ExamInvigilator.id).where(
                ExamInvigilator.seating_plan_id == plan_id, ExamInvigilator.staff_user_id == body.staff_user_id
            )
        )
    ).first()
    if not exists:
        db.add(ExamInvigilator(seating_plan_id=plan_id, staff_user_id=body.staff_user_id, role=body.role))
        await db.commit()
    return MessageResponse(message="Invigilator assigned")


@router.delete("/seating-plans/{plan_id}/invigilators/{staff_user_id}", response_model=MessageResponse)
async def remove_invigilator(plan_id: UUID, staff_user_id: UUID, current_user: CurrentUser, db: DbSession):
    _require_exam_staff(current_user)
    plan = (
        await db.execute(
            select(ExamSeatingPlan.id).where(ExamSeatingPlan.id == plan_id, ExamSeatingPlan.school_id == current_user.school_id)
        )
    ).first()
    if plan is None:
        raise NotFoundError("ExamSeatingPlan", str(plan_id))
    row = (
        await db.execute(
            select(ExamInvigilator).where(
                ExamInvigilator.seating_plan_id == plan_id, ExamInvigilator.staff_user_id == staff_user_id
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()
    return MessageResponse(message="Invigilator removed")


# ─── PARAMETERIZED EXAM ROUTES ──────────────────────────────────────────────────

@router.get("/report-card/{student_id}")
@cache_response(ttl=600, key_prefix="exams:report-card")
async def get_report_card(
    student_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
    academic_year: Optional[str] = Query(None),
):
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
                e.id AS exam_id,
                e.name AS exam_name,
                e.term,
                e.academic_year,
                er.subject_id,
                sub.name AS subject_name,
                er.marks_obtained,
                er.max_marks,
                er.percentage,
                er.grade,
                er.rank,
                er.remarks
            FROM exam_results er
            JOIN exams e ON er.exam_id = e.id
            LEFT JOIN subjects sub ON er.subject_id = sub.id
            WHERE {conditions}
            ORDER BY e.start_date DESC, sub.name ASC
        """),
        params,
    )
    rows = result.fetchall()

    return {
        "student_id": str(student_id),
        "results": [
            {
                "exam_id": str(row[0]),
                "exam_name": row[1],
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


@router.get("/{exam_id}/datesheet")
async def get_exam_datesheet(exam_id: UUID, current_user: CurrentUser, db: DbSession):
    """List datesheet schedule entries for a specific exam."""
    if not current_user.school_id:
        return []
    res = await db.execute(
        select(ExamDatesheet).where(
            ExamDatesheet.exam_id == exam_id,
            ExamDatesheet.school_id == current_user.school_id
        )
    )
    return list(res.scalars().all())


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
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["exams"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)
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
        from app.utils.ai_semantic_cache import semantic_cache as _sc
        await _sc.invalidate_by_deps(db, current_user.school_id, ["exams"])
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "cache.invalidate_pattern", exc, exc_info=True)

    return exam
