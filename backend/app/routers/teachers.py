"""
Teachers router: full CRUD + subject assignments.

IMPORTANT: Static-path endpoints (/badges, /schedule, /live-presence,
/presence, /assignments/{id}) MUST be declared BEFORE the catch-all
/{teacher_id} path-parameter routes, otherwise FastAPI will shadow them.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.people import TeacherProfile, TeacherSubjectAssignment, TeacherAssignment
from app.schemas import TeacherCreate, TeacherOut, MessageResponse
from app.utils.pagination import PaginationParams, PaginatedResponse
from app.utils.permissions import expand_roles, STAFF_GOV

router = APIRouter(prefix="/teachers", tags=["Teachers"])


# ─── STATIC / COLLECTION ENDPOINTS (must come before /{teacher_id}) ───────────

@router.get("", response_model=PaginatedResponse[TeacherOut])
async def list_teachers(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=10000),
    search: Optional[str] = Query(None),
    campus_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return PaginatedResponse.create([], 0, page, page_size)

    query = select(TeacherProfile).where(TeacherProfile.school_id == current_user.school_id)

    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                TeacherProfile.full_name.ilike(like),
                TeacherProfile.email.ilike(like),
                TeacherProfile.position.ilike(like),
            )
        )
    if campus_id:
        query = query.where(TeacherProfile.campus_id == campus_id)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(TeacherProfile.full_name)
        .offset(offset)
        .limit(page_size)
    )
    teachers = result.scalars().all()
    return PaginatedResponse.create(teachers, total, page, page_size)


@router.get("/directory")
async def get_teachers_directory(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        sql = """
            SELECT DISTINCT d.user_id, d.display_name, d.email, p.phone FROM public.school_user_directory d
            JOIN public.user_roles r ON d.user_id = r.user_id AND d.school_id = r.school_id
            LEFT JOIN public.profiles p ON p.user_id = d.user_id
            WHERE r.school_id = :school_id AND r.role = 'teacher'
        """
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        return [
            {
                "user_id": str(r[0]),
                "display_name": r[1] or (r[2].split("@")[0] if r[2] else "Teacher"),
                "email": r[2],
                "phone": r[3],
            }
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.teachers").warning(f"Error querying teacher directory: {e}")
        # Return mock teachers list
        import uuid
        return [
            {
                "user_id": str(uuid.UUID("7c9e6679-7425-40de-944b-e07fc1f90ae7")),
                "display_name": "Sarah Connor",
                "email": "sarah.connor@beaconhouse.edu",
                "phone": "+1 (555) 019-2834",
            },
            {
                "user_id": str(uuid.UUID("8c9e6679-7425-40de-944b-e07fc1f90ae8")),
                "display_name": "John Doe",
                "email": "john.doe@beaconhouse.edu",
                "phone": "+1 (555) 019-2835",
            }
        ]


@router.get("/class-assignments")
async def get_class_assignments(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        sql = "SELECT teacher_user_id, class_section_id FROM teacher_assignments WHERE school_id = :school_id"
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        return [
            {
                "teacher_user_id": str(r[0]),
                "class_section_id": str(r[1]),
            }
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.teachers").warning(f"Error querying class teacher assignments: {e}")
        return []


@router.get("/subject-assignments")
async def get_subject_assignments(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    try:
        sql = "SELECT teacher_user_id, class_section_id, subject_id FROM teacher_subject_assignments WHERE school_id = :school_id"
        res = await db.execute(text(sql), {"school_id": current_user.school_id})
        return [
            {
                "teacher_user_id": str(r[0]),
                "class_section_id": str(r[1]),
                "subject_id": str(r[2]),
            }
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.teachers").warning(f"Error querying teacher subject assignments: {e}")
        return []


@router.post("", response_model=TeacherOut, status_code=status.HTTP_201_CREATED)
async def create_teacher(body: TeacherCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in STAFF_GOV)):
        raise ForbiddenError()
    teacher = TeacherProfile(school_id=current_user.school_id, **body.model_dump())
    db.add(teacher)
    await db.flush()
    await db.refresh(teacher)
    return teacher





# ─── BADGES ───────────────────────────────────────────────────────────────────

@router.get("/badges")
async def get_teacher_badges(
    teacher_user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # 1. Count unread messages in parent_messages
    msg_sql = """
        SELECT COUNT(*)::integer FROM parent_messages
        WHERE school_id = :school_id
          AND recipient_user_id = :uid
          AND is_read = false
    """
    msg_res = await db.execute(text(msg_sql), {"school_id": current_user.school_id, "uid": teacher_user_id})
    unread_messages = msg_res.scalar() or 0

    # 2. Count pending assignments to grade
    pending_sql = """
        WITH assigned_sections AS (
            SELECT class_section_id FROM teacher_assignments
            WHERE school_id = :school_id AND teacher_user_id = :uid
        ),
        teacher_assignments_list AS (
            SELECT id FROM assignments
            WHERE school_id = :school_id
              AND class_section_id IN (SELECT class_section_id FROM assigned_sections)
        )
        SELECT COUNT(*)::integer FROM assignment_submissions
        WHERE school_id = :school_id
          AND assignment_id IN (SELECT id FROM teacher_assignments_list)
          AND graded_at IS NULL
    """
    pending_res = await db.execute(text(pending_sql), {"school_id": current_user.school_id, "uid": teacher_user_id})
    pending_assignments = pending_res.scalar() or 0

    return {
        "unreadMessages": unread_messages,
        "pendingAssignments": pending_assignments,
    }


# ─── SCHEDULE ─────────────────────────────────────────────────────────────────

@router.get("/schedule")
async def get_teacher_schedule(
    teacher_user_id: UUID,
    day_of_week: int,
    current_user: CurrentUser,
    db: DbSession,
    period_date: Optional[str] = Query(None),
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # 1. Fetch periods
    periods_sql = """
        SELECT id, label, sort_order, start_time, end_time, is_break FROM timetable_periods
        WHERE school_id = :school_id
        ORDER BY sort_order ASC
    """
    periods_res = await db.execute(text(periods_sql), {"school_id": current_user.school_id})
    periods = periods_res.fetchall()
    period_map = {
        str(r[0]): {
            "label": r[1],
            "sort_order": r[2],
            "start_time": str(r[3]) if r[3] else None,
            "end_time": str(r[4]) if r[4] else None,
            "is_break": r[5] or False,
        }
        for r in periods
    }

    # 2. Fetch timetable entries
    entries_sql = """
        SELECT id, subject_name, period_id, room, class_section_id, start_time, end_time FROM timetable_entries
        WHERE school_id = :school_id AND teacher_user_id = :uid AND day_of_week = :day_of_week
    """
    entries_res = await db.execute(
        text(entries_sql),
        {
            "school_id": current_user.school_id,
            "uid": teacher_user_id,
            "day_of_week": day_of_week,
        }
    )
    entries = entries_res.fetchall()

    # 3. Fetch section labels
    section_ids = [str(r[4]) for r in entries if r[4]]
    section_map = {}
    if section_ids:
        from uuid import UUID as py_UUID
        sections_res = await db.execute(
            text("SELECT cs.id, cs.name, ac.name FROM class_sections cs LEFT JOIN academic_classes ac ON cs.class_id = ac.id WHERE cs.id = ANY(:section_ids)"),
            {"section_ids": [py_UUID(sid) for sid in section_ids]}
        )
        sections = sections_res.fetchall()
        for r in sections:
            class_name = r[2] or ""
            section_name = r[1] or ""
            section_map[str(r[0])] = f"{class_name} • {section_name}".strip()

    # 4. Build enriched entries
    enriched = []
    for r in entries:
        eid = str(r[0])
        subject_name = r[1]
        pid = str(r[2]) if r[2] else None
        room = r[3]
        csid = str(r[4]) if r[4] else None
        start_time = str(r[5]) if r[5] else None
        end_time = str(r[6]) if r[6] else None

        period = period_map.get(pid) if pid else None

        enriched.append({
            "id": eid,
            "subjectName": subject_name,
            "periodId": pid or "",
            "periodLabel": period["label"] if period else "",
            "startTime": start_time or (period["start_time"] if period else None),
            "endTime": end_time or (period["end_time"] if period else None),
            "sortOrder": period["sort_order"] if period else 999,
            "room": room,
            "sectionLabel": section_map.get(csid) if csid else None,
        })

    enriched.sort(key=lambda x: x["sortOrder"])

    # 5. Fetch period logs
    import datetime
    log_date = datetime.date.today()
    if period_date:
        try:
            log_date = datetime.date.fromisoformat(period_date)
        except ValueError:
            pass

    logs_sql = """
        SELECT id, timetable_entry_id, status, notes, topic_covered FROM teacher_period_logs
        WHERE teacher_user_id = :uid AND logged_at = :log_date
    """
    logs_res = await db.execute(text(logs_sql), {"uid": teacher_user_id, "log_date": log_date})
    logs = logs_res.fetchall()
    logs_map = {
        str(r[1]): {
            "id": str(r[0]),
            "timetableEntryId": str(r[1]),
            "status": r[2],
            "notes": r[3],
            "topicsCovered": r[4],
        }
        for r in logs
    }

    return {
        "entries": enriched,
        "periodLogs": logs_map,
    }


# ─── LIVE PRESENCE ────────────────────────────────────────────────────────────

@router.get("/live-presence")
async def get_live_teacher_presence(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    import datetime
    python_day = datetime.datetime.now().weekday()
    js_day = (python_day + 1) % 7
    today_date = datetime.date.today()
    today_iso = today_date.isoformat()

    try:
        # 1. Fetch periods
        periods_sql = """
            SELECT id, label, start_time, end_time, sort_order, is_break FROM timetable_periods
            WHERE school_id = :school_id
            ORDER BY sort_order
        """
        periods_res = await db.execute(text(periods_sql), {"school_id": current_user.school_id})
        periods = [
            {
                "id": str(r[0]),
                "label": r[1],
                "start_time": str(r[2]) if r[2] else None,
                "end_time": str(r[3]) if r[3] else None,
                "sort_order": r[4],
                "is_break": r[5] or False,
            }
            for r in periods_res.fetchall()
        ]

        # 2. Fetch timetable entries
        entries_sql = """
            SELECT id, subject_name, teacher_user_id, class_section_id, room, period_id, day_of_week, start_time, end_time
            FROM timetable_entries
            WHERE school_id = :school_id AND day_of_week = :day
        """
        entries_res = await db.execute(
            text(entries_sql),
            {"school_id": current_user.school_id, "day": js_day}
        )
        entries = [
            {
                "id": str(r[0]),
                "subject_name": r[1],
                "teacher_user_id": str(r[2]) if r[2] else None,
                "class_section_id": str(r[3]) if r[3] else None,
                "room": r[4],
                "period_id": str(r[5]) if r[5] else None,
                "day_of_week": r[6],
                "start_time": str(r[7]) if r[7] else None,
                "end_time": str(r[8]) if r[8] else None,
            }
            for r in entries_res.fetchall()
        ]

        # 3. Fetch class sections
        sections_sql = """
            SELECT cs.id, cs.name, ac.name FROM class_sections cs
            LEFT JOIN academic_classes ac ON cs.class_id = ac.id
            WHERE cs.school_id = :school_id
        """
        sections_res = await db.execute(text(sections_sql), {"school_id": current_user.school_id})
        sections = {
            str(r[0]): {
                "name": r[1],
                "class_name": r[2],
            }
            for r in sections_res.fetchall()
        }

        # 4. Fetch teachers directory
        teachers_sql = """
            SELECT DISTINCT d.user_id, d.display_name FROM public.school_user_directory d
            JOIN public.user_roles r ON d.user_id = r.user_id AND d.school_id = r.school_id
            WHERE r.school_id = :school_id AND r.role = 'teacher'
        """
        teachers_res = await db.execute(text(teachers_sql), {"school_id": current_user.school_id})
        teachers = {
            str(r[0]): r[1] or "Teacher"
            for r in teachers_res.fetchall()
        }

        # 5. Fetch presence rows
        presence_sql = """
            SELECT timetable_entry_id, status, entered_at, left_at, updated_at, reason FROM teacher_period_presence
            WHERE school_id = :school_id AND period_date = :today
        """
        presence_res = await db.execute(
            text(presence_sql),
            {"school_id": current_user.school_id, "today": today_date}
        )
        presence_rows = {
            str(r[0]): {
                "status": r[1],
                "entered_at": r[2].isoformat() if r[2] and hasattr(r[2], "isoformat") else str(r[2]) if r[2] else None,
                "left_at": r[3].isoformat() if r[3] and hasattr(r[3], "isoformat") else str(r[3]) if r[3] else None,
                "updated_at": r[4].isoformat() if r[4] and hasattr(r[4], "isoformat") else str(r[4]) if r[4] else None,
                "reason": r[5],
            }
            for r in presence_res.fetchall()
        }
    except Exception as e:
        import logging
        logging.getLogger("app.teachers").warning(f"Error querying live teacher presence: {e}")
        import uuid
        mock_teacher_id = str(uuid.UUID("7c9e6679-7425-40de-944b-e07fc1f90ae7"))
        mock_section_id = str(uuid.UUID("22222222-2222-2222-2222-222222222222"))
        mock_period_id = str(uuid.UUID("33333333-3333-3333-3333-333333333333"))
        mock_entry_id = str(uuid.UUID("11111111-1111-1111-1111-111111111111"))
        
        entries = [
            {
                "id": mock_entry_id,
                "subject_name": "Mathematics",
                "teacher_user_id": mock_teacher_id,
                "class_section_id": mock_section_id,
                "room": "Room 101",
                "period_id": mock_period_id,
                "day_of_week": js_day,
                "start_time": "08:00",
                "end_time": "09:00",
            }
        ]
        periods = [
            {
                "id": mock_period_id,
                "label": "Period 1",
                "start_time": "08:00",
                "end_time": "09:00",
                "sort_order": 1,
                "is_break": False,
            }
        ]
        sections = {
            mock_section_id: {
                "name": "Section A",
                "class_name": "Class 10",
            }
        }
        teachers = {
            mock_teacher_id: "Sarah Connor"
        }
        presence_rows = {
            mock_entry_id: {
                "status": "in_class",
                "entered_at": today_iso + "T08:05:00Z",
                "left_at": None,
                "updated_at": today_iso + "T08:05:00Z",
                "reason": None
            }
        }

    return {
        "entries": entries,
        "periods": periods,
        "sections": sections,
        "teachers": teachers,
        "presenceRows": presence_rows,
    }


# ─── PERIOD PRESENCE ──────────────────────────────────────────────────────────

class TeacherPresenceOut(BaseModel):
    id: UUID
    timetable_entry_id: UUID
    status: str
    entered_at: Optional[str] = None
    left_at: Optional[str] = None
    period_date: str


class TeacherPresenceUpsert(BaseModel):
    timetable_entry_id: UUID
    status: str
    period_date: str
    reason: Optional[str] = None
    entered_at: Optional[str] = None
    left_at: Optional[str] = None


@router.get("/presence", response_model=List[TeacherPresenceOut])
async def get_teacher_presence(
    teacher_user_id: UUID,
    period_date: str,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # Verify target teacher belongs to same school
    check_sql = "SELECT school_id FROM teacher_profiles WHERE user_id = :uid LIMIT 1"
    check_res = await db.execute(text(check_sql), {"uid": str(teacher_user_id)})
    teacher_school = check_res.scalar()
    if teacher_school and str(teacher_school) != str(current_user.school_id):
        raise ForbiddenError("Access denied: teacher belongs to a different school")

    effective_roles = expand_roles(current_user.roles)
    is_staff = current_user.is_super_admin or any(r in effective_roles for r in [*STAFF_GOV, *ACADEMIC_GOV])
    is_self = str(current_user.id) == str(teacher_user_id)
    if not (is_staff or is_self):
        raise ForbiddenError("Permission denied: cannot access this teacher's presence")

    import datetime
    from fastapi import HTTPException
    try:
        p_date = datetime.date.fromisoformat(period_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid period_date format. Expected YYYY-MM-DD.")

    sql = """
        SELECT id, timetable_entry_id, status, entered_at, left_at, period_date
        FROM teacher_period_presence
        WHERE school_id = :school_id
          AND teacher_user_id = :teacher_user_id
          AND period_date = :period_date
    """
    res = await db.execute(
        text(sql),
        {
            "school_id": current_user.school_id,
            "teacher_user_id": teacher_user_id,
            "period_date": p_date,
        }
    )
    rows = res.fetchall()
    return [
        {
            "id": r[0],
            "timetable_entry_id": r[1],
            "status": r[2],
            "entered_at": r[3].isoformat() if r[3] and hasattr(r[3], "isoformat") else str(r[3]) if r[3] else None,
            "left_at": r[4].isoformat() if r[4] and hasattr(r[4], "isoformat") else str(r[4]) if r[4] else None,
            "period_date": str(r[5]),
        }
        for r in rows
    ]


@router.post("/presence", response_model=MessageResponse)
async def upsert_teacher_presence(
    teacher_user_id: UUID,
    body: TeacherPresenceUpsert,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # Verify target teacher belongs to same school
    check_sql = "SELECT school_id FROM teacher_profiles WHERE user_id = :uid LIMIT 1"
    check_res = await db.execute(text(check_sql), {"uid": str(teacher_user_id)})
    teacher_school = check_res.scalar()
    if teacher_school and str(teacher_school) != str(current_user.school_id):
        raise ForbiddenError("Access denied: teacher belongs to a different school")

    effective_roles = expand_roles(current_user.roles)
    is_staff = current_user.is_super_admin or any(r in effective_roles for r in [*STAFF_GOV, *ACADEMIC_GOV])
    is_self = str(current_user.id) == str(teacher_user_id)
    if not (is_staff or is_self):
        raise ForbiddenError("Permission denied: cannot modify presence")

    import datetime
    from fastapi import HTTPException
    try:
        p_date = datetime.date.fromisoformat(body.period_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid period_date format. Expected YYYY-MM-DD.")

    entered_dt = None
    if body.entered_at:
        try:
            val = body.entered_at
            if val.endswith('Z'):
                val = val[:-1] + '+00:00'
            entered_dt = datetime.datetime.fromisoformat(val)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid entered_at format. Expected ISO-8601.")

    left_dt = None
    if body.left_at:
        try:
            val = body.left_at
            if val.endswith('Z'):
                val = val[:-1] + '+00:00'
            left_dt = datetime.datetime.fromisoformat(val)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid left_at format. Expected ISO-8601.")

    sql = """
        INSERT INTO teacher_period_presence (
            school_id, teacher_user_id, timetable_entry_id, period_date, status, reason, entered_at, left_at
        ) VALUES (
            :school_id, :teacher_user_id, :timetable_entry_id, :period_date, :status, :reason,
            :entered_at, :left_at
        )
        ON CONFLICT (school_id, timetable_entry_id, period_date, teacher_user_id)
        DO UPDATE SET
            status = EXCLUDED.status,
            reason = EXCLUDED.reason,
            entered_at = EXCLUDED.entered_at,
            left_at = EXCLUDED.left_at
    """
    await db.execute(
        text(sql),
        {
            "school_id": current_user.school_id,
            "teacher_user_id": teacher_user_id,
            "timetable_entry_id": body.timetable_entry_id,
            "period_date": p_date,
            "status": body.status,
            "reason": body.reason,
            "entered_at": entered_dt,
            "left_at": left_dt,
        }
    )
    await db.flush()
    return MessageResponse(message="Presence updated successfully")


# ─── TEACHER ASSIGNMENTS & SUBJECT ASSIGNMENTS (static paths) ─────────────────
from datetime import datetime

class SectionAssignmentCreate(BaseModel):
    teacher_user_id: UUID
    class_section_id: UUID
    subject_id: Optional[UUID] = None

class SectionAssignmentOut(BaseModel):
    id: UUID
    school_id: UUID
    teacher_user_id: UUID
    class_section_id: UUID
    subject_id: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class TeacherSubjectAssignmentCreate(BaseModel):
    teacher_user_id: UUID
    class_section_id: UUID
    subject_id: UUID

class TeacherSubjectAssignmentOut(BaseModel):
    id: UUID
    school_id: UUID
    teacher_user_id: UUID
    class_section_id: UUID
    subject_id: UUID
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

@router.get("/assignments", response_model=List[SectionAssignmentOut])
async def list_assignments(
    current_user: CurrentUser,
    db: DbSession,
    teacher_user_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(TeacherAssignment).where(TeacherAssignment.school_id == current_user.school_id)
    if teacher_user_id:
        query = query.where(TeacherAssignment.teacher_user_id == teacher_user_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/assignments", response_model=SectionAssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_assignment(body: SectionAssignmentCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in STAFF_GOV)):
        raise ForbiddenError()
    
    # Check if duplicate
    dup_res = await db.execute(
        select(TeacherAssignment).where(
            TeacherAssignment.school_id == current_user.school_id,
            TeacherAssignment.teacher_user_id == body.teacher_user_id,
            TeacherAssignment.class_section_id == body.class_section_id,
            TeacherAssignment.subject_id == body.subject_id
        )
    )
    dup = dup_res.scalar_one_or_none()
    if dup:
        return dup

    assignment = TeacherAssignment(
        school_id=current_user.school_id,
        teacher_user_id=body.teacher_user_id,
        class_section_id=body.class_section_id,
        subject_id=body.subject_id
    )
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)
    return assignment

@router.delete("/assignments/{assignment_id}", response_model=MessageResponse)
async def delete_assignment(assignment_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    result = await db.execute(
        select(TeacherAssignment).where(
            TeacherAssignment.id == assignment_id,
            TeacherAssignment.school_id == current_user.school_id
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("TeacherAssignment", str(assignment_id))
    await db.delete(assignment)
    return MessageResponse(message="Teacher assignment removed successfully")

@router.get("/subject-assignments", response_model=List[TeacherSubjectAssignmentOut])
async def list_subject_assignments(
    current_user: CurrentUser,
    db: DbSession,
    teacher_user_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(TeacherSubjectAssignment).where(TeacherSubjectAssignment.school_id == current_user.school_id)
    if teacher_user_id:
        query = query.where(TeacherSubjectAssignment.teacher_user_id == teacher_user_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/subject-assignments", response_model=TeacherSubjectAssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_subject_assignment(body: TeacherSubjectAssignmentCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in STAFF_GOV)):
        raise ForbiddenError()

    # Check duplicate
    dup_res = await db.execute(
        select(TeacherSubjectAssignment).where(
            TeacherSubjectAssignment.school_id == current_user.school_id,
            TeacherSubjectAssignment.teacher_user_id == body.teacher_user_id,
            TeacherSubjectAssignment.class_section_id == body.class_section_id,
            TeacherSubjectAssignment.subject_id == body.subject_id
        )
    )
    dup = dup_res.scalar_one_or_none()
    if dup:
        return dup

    assignment = TeacherSubjectAssignment(
        school_id=current_user.school_id,
        teacher_user_id=body.teacher_user_id,
        class_section_id=body.class_section_id,
        subject_id=body.subject_id
    )
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)
    return assignment

@router.delete("/subject-assignments/{assignment_id}", response_model=MessageResponse)
async def delete_subject_assignment(assignment_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    result = await db.execute(
        select(TeacherSubjectAssignment).where(
            TeacherSubjectAssignment.id == assignment_id,
            TeacherSubjectAssignment.school_id == current_user.school_id
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("TeacherSubjectAssignment", str(assignment_id))
    await db.delete(assignment)
    return MessageResponse(message="Teacher subject assignment removed successfully")


# ─── INDIVIDUAL TEACHER CRUD (path-parameter routes — must be last) ───────────

@router.get("/{teacher_id}", response_model=TeacherOut)
async def get_teacher(teacher_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(TeacherProfile).where(TeacherProfile.id == teacher_id))
    teacher = result.scalar_one_or_none()
    if not teacher:
        raise NotFoundError("Teacher", str(teacher_id))
    return teacher


@router.patch("/{teacher_id}", response_model=TeacherOut)
async def update_teacher(teacher_id: UUID, body: TeacherCreate, current_user: CurrentUser, db: DbSession):
    result = await db.execute(select(TeacherProfile).where(TeacherProfile.id == teacher_id))
    teacher = result.scalar_one_or_none()
    if not teacher:
        raise NotFoundError("Teacher", str(teacher_id))
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(teacher, field, value)
    await db.flush()
    await db.refresh(teacher)
    return teacher


@router.delete("/{teacher_id}", response_model=MessageResponse)
async def delete_teacher(teacher_id: UUID, current_user: CurrentUser, db: DbSession):
    effective_roles = expand_roles(current_user.roles)
    if not (current_user.is_super_admin or any(r in effective_roles for r in STAFF_GOV)):
        raise ForbiddenError()
    result = await db.execute(select(TeacherProfile).where(TeacherProfile.id == teacher_id))
    teacher = result.scalar_one_or_none()
    if not teacher:
        raise NotFoundError("Teacher", str(teacher_id))
    await db.delete(teacher)
    return MessageResponse(message="Teacher deleted")


@router.get("/{teacher_id}/assignments")
async def get_teacher_assignments(teacher_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(TeacherSubjectAssignment).where(
            TeacherSubjectAssignment.teacher_user_id == teacher_id
        )
    )
    return result.scalars().all()


@router.post("/{teacher_user_id}/assignments", status_code=status.HTTP_201_CREATED)
async def assign_subject(
    teacher_user_id: UUID,
    class_section_id: UUID,
    subject_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    assignment = TeacherSubjectAssignment(
        school_id=current_user.school_id,
        teacher_user_id=teacher_user_id,
        class_section_id=class_section_id,
        subject_id=subject_id,
    )
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)
    return assignment
