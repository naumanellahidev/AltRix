"""
Attendance router: sessions, bulk entry, reports.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select, text

from app.dependencies import CurrentUser, DbSession
from app.exceptions import NotFoundError, ForbiddenError
from app.models.attendance import AttendanceSession, AttendanceEntry, StaffAttendance
from app.schemas import (
    AttendanceSessionCreate, BulkAttendanceCreate,
    AttendanceSessionOut, AttendanceEntryOut,
    MessageResponse,
)
from app.utils.permissions import expand_roles, ACADEMIC_GOV

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/recent-entries")
async def get_recent_entries(
    current_user: CurrentUser,
    db: DbSession,
    from_date: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []
    try:
        query = "SELECT student_id, status FROM attendance_entries WHERE school_id = :school_id"
        params = {"school_id": current_user.school_id}
        if from_date:
            query += " AND created_at >= :from_date"
            params["from_date"] = from_date
        res = await db.execute(text(query), params)
        return [
            {"student_id": str(r[0]), "status": r[1]}
            for r in res.fetchall()
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.attendance").warning(f"Error fetching recent attendance entries: {e}")
        return []


@router.get("/sessions", response_model=List[AttendanceSessionOut])
async def list_sessions(
    current_user: CurrentUser,
    db: DbSession,
    section_id: Optional[UUID] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    campus_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(AttendanceSession).where(AttendanceSession.school_id == current_user.school_id)
    if section_id:
        query = query.where(AttendanceSession.class_section_id == section_id)
    if campus_id:
        query = query.where(AttendanceSession.campus_id == campus_id)
    if from_date:
        query = query.where(AttendanceSession.session_date >= from_date)
    if to_date:
        query = query.where(AttendanceSession.session_date <= to_date)
    result = await db.execute(query.order_by(AttendanceSession.session_date.desc()))
    return result.scalars().all()


@router.post("/sessions", response_model=AttendanceSessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(body: AttendanceSessionCreate, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    session = AttendanceSession(
        school_id=current_user.school_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


@router.get("/sessions/{session_id}/entries", response_model=List[AttendanceEntryOut])
async def get_session_entries(session_id: UUID, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(AttendanceEntry).where(AttendanceEntry.session_id == session_id)
    )
    return result.scalars().all()


@router.post("/sessions/{session_id}/entries/bulk", response_model=List[AttendanceEntryOut])
async def bulk_mark_attendance(
    session_id: UUID,
    body: BulkAttendanceCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Mark attendance for all students in a session at once."""
    if not current_user.school_id:
        raise ForbiddenError("No school context")

    # Verify session exists
    session_result = await db.execute(
        select(AttendanceSession).where(AttendanceSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    entries = []
    for entry_data in body.entries:
        entry = AttendanceEntry(
            school_id=current_user.school_id,
            campus_id=session.campus_id,
            session_id=session_id,
            created_by=current_user.id,
            **entry_data.model_dump(),
        )
        db.add(entry)
        entries.append(entry)

    await db.flush()
    for entry in entries:
        await db.refresh(entry)
    return entries


@router.get("/report")
async def attendance_report(
    current_user: CurrentUser,
    db: DbSession,
    student_id: Optional[UUID] = Query(None),
    section_id: Optional[UUID] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
):
    """Generate attendance summary: present/absent/late counts."""
    if not current_user.school_id:
        return []

    conditions = ["ae.school_id = :school_id"]
    params: dict = {"school_id": current_user.school_id}

    if student_id:
        conditions.append("ae.student_id = :student_id")
        params["student_id"] = str(student_id)
    if section_id:
        conditions.append("atts.class_section_id = :section_id")
        params["section_id"] = str(section_id)
    if from_date:
        conditions.append("atts.session_date >= :from_date")
        params["from_date"] = from_date
    if to_date:
        conditions.append("atts.session_date <= :to_date")
        params["to_date"] = to_date

    where_clause = " AND ".join(conditions)
    sql = f"""
        SELECT
            ae.student_id,
            COUNT(*) FILTER (WHERE ae.status = 'present') AS present_count,
            COUNT(*) FILTER (WHERE ae.status = 'absent') AS absent_count,
            COUNT(*) FILTER (WHERE ae.status = 'late') AS late_count,
            COUNT(*) FILTER (WHERE ae.status = 'excused') AS excused_count,
            COUNT(*) AS total_sessions
        FROM attendance_entries ae
        JOIN attendance_sessions atts ON ae.session_id = atts.id
        WHERE {where_clause}
        GROUP BY ae.student_id
        ORDER BY ae.student_id
    """
    result = await db.execute(text(sql), params)
    rows = result.fetchall()
    return [
        {
            "student_id": str(row[0]),
            "present": row[1],
            "absent": row[2],
            "late": row[3],
            "excused": row[4],
            "total": row[5],
            "percentage": round((row[1] / row[5] * 100) if row[5] > 0 else 0, 1),
        }
        for row in rows
    ]



from datetime import datetime, timezone

# ─── MIGRATED HOOK ENDPOINTS ──────────────────────────────────────────────────

@router.get("/get-or-create")
async def get_or_create_session(
    section_id: UUID,
    session_date: str,
    period_label: str,
    read_only: bool,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    
    # Check existing
    res = await db.execute(
        select(AttendanceSession.id).where(
            AttendanceSession.school_id == current_user.school_id,
            AttendanceSession.class_section_id == section_id,
            AttendanceSession.session_date == session_date,
            AttendanceSession.period_label == period_label,
        )
    )
    row = res.fetchone()
    session_id = str(row[0]) if row else None
    
    if not session_id:
        if read_only:
            session_id = None
        else:
            session = AttendanceSession(
                school_id=current_user.school_id,
                class_section_id=section_id,
                session_date=session_date,
                period_label=period_label,
                created_by=current_user.id,
            )
            db.add(session)
            await db.flush()
            session_id = str(session.id)
    
    # Load enrolled student rows (using direct SQL)
    sql = """
        SELECT s.id, s.first_name, s.last_name
        FROM student_enrollments se
        JOIN students s ON se.student_id = s.id
        WHERE se.school_id = :sid AND se.class_section_id = :section_id
    """
    students_res = await db.execute(text(sql), {"sid": current_user.school_id, "section_id": str(section_id)})
    students = students_res.fetchall()
    
    # Load entries
    entries = []
    if session_id:
        entries_res = await db.execute(
            select(AttendanceEntry.student_id, AttendanceEntry.status).where(
                AttendanceEntry.session_id == session_id
            )
        )
        entries = entries_res.fetchall()
        
    status_map = {str(e[0]): e[1] for e in entries}
    
    rows = [
        {
            "student_id": str(s[0]),
            "first_name": s[1],
            "last_name": s[2],
            "status": status_map.get(str(s[0]), "present"),
        }
        for s in students
    ]
    
    return {"sessionId": session_id, "rows": rows}


@router.post("/sessions/{session_id}/save")
async def save_attendance_entries(
    session_id: UUID,
    body: List[dict],
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
        
    await db.execute(
        text("DELETE FROM attendance_entries WHERE session_id = :session_id AND school_id = :school_id"),
        {"session_id": str(session_id), "school_id": current_user.school_id}
    )
    
    for r in body:
        entry = AttendanceEntry(
            school_id=current_user.school_id,
            session_id=session_id,
            student_id=r.get("student_id"),
            status=r.get("status"),
            created_by=current_user.id,
        )
        db.add(entry)
        
    await db.flush()
    return {"message": "Attendance saved successfully"}


@router.get("/history/{section_id}", response_model=List[AttendanceSessionOut])
async def list_session_history(
    section_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 30,
):
    if not current_user.school_id:
        return []
    query = (
        select(AttendanceSession)
        .where(
            AttendanceSession.school_id == current_user.school_id,
            AttendanceSession.class_section_id == section_id
        )
        .order_by(AttendanceSession.session_date.desc(), AttendanceSession.period_label.asc())
        .limit(limit)
    )
    res = await db.execute(query)
    return res.scalars().all()


@router.get("/stats/{section_id}")
async def load_student_attendance_stats(
    section_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        return []
        
    sessions_res = await db.execute(
        select(AttendanceSession.id).where(
            AttendanceSession.school_id == current_user.school_id,
            AttendanceSession.class_section_id == section_id
        )
    )
    sessions = [str(r[0]) for r in sessions_res.fetchall()]
    if not sessions:
        return []
        
    entries_res = await db.execute(
        select(AttendanceEntry.student_id, AttendanceEntry.status).where(
            AttendanceEntry.session_id.in_(sessions)
        )
    )
    entries = entries_res.fetchall()
    
    sql = """
        SELECT s.id, s.first_name, s.last_name
        FROM student_enrollments se
        JOIN students s ON se.student_id = s.id
        WHERE se.school_id = :sid AND se.class_section_id = :section_id
    """
    students_res = await db.execute(text(sql), {"sid": current_user.school_id, "section_id": str(section_id)})
    students = students_res.fetchall()
    
    stats_map = {}
    for student_id, status in entries:
        sid_str = str(student_id)
        if sid_str not in stats_map:
            stats_map[sid_str] = {"present": 0, "absent": 0, "late": 0, "excused": 0}
        if status in stats_map[sid_str]:
            stats_map[sid_str][status] += 1
            
    total_sessions = len(sessions)
    
    results = []
    for s in students:
        s_id = str(s[0])
        stats = stats_map.get(s_id, {"present": 0, "absent": 0, "late": 0, "excused": 0})
        attended = stats["present"] + stats["late"]
        percentage = round((attended / total_sessions * 100) if total_sessions > 0 else 100, 1)
        results.append({
            "student_id": s_id,
            "first_name": s[1],
            "last_name": s[2],
            "total_sessions": total_sessions,
            "present_count": stats["present"],
            "absent_count": stats["absent"],
            "late_count": stats["late"],
            "excused_count": stats["excused"],
            "attendance_percentage": percentage,
        })
        
    return results


@router.get("/sessions/{session_id}/roster")
async def get_session_roster(
    session_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        return []
        
    res = await db.execute(
        select(AttendanceSession.class_section_id).where(
            AttendanceSession.id == session_id
        ).limit(1)
    )
    row = res.fetchone()
    if not row:
        return []
    section_id = str(row[0])
    
    sql = """
        SELECT s.id, s.first_name, s.last_name
        FROM student_enrollments se
        JOIN students s ON se.student_id = s.id
        WHERE se.school_id = :sid AND se.class_section_id = :section_id
    """
    students_res = await db.execute(text(sql), {"sid": current_user.school_id, "section_id": section_id})
    students = students_res.fetchall()
    
    entries_res = await db.execute(
        select(AttendanceEntry.student_id, AttendanceEntry.status).where(
            AttendanceEntry.session_id == session_id
        )
    )
    entries = entries_res.fetchall()
    status_map = {str(e[0]): e[1] for e in entries}
    
    return [
        {
            "student_id": str(s[0]),
            "first_name": s[1],
            "last_name": s[2],
            "status": status_map.get(str(s[0]), "present"),
        }
        for s in students
    ]


# ─── STAFF ATTENDANCE ─────────────────────────────────────────────────────────

@router.get("/staff")
async def list_staff_attendance(
    current_user: CurrentUser,
    db: DbSession,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    user_id: Optional[UUID] = Query(None),
):
    if not current_user.school_id:
        return []
    query = select(StaffAttendance).where(StaffAttendance.school_id == current_user.school_id)
    if user_id:
        query = query.where(StaffAttendance.user_id == user_id)
    if from_date:
        query = query.where(StaffAttendance.attendance_date >= from_date)
    if to_date:
        query = query.where(StaffAttendance.attendance_date <= to_date)
    result = await db.execute(query.order_by(StaffAttendance.attendance_date.desc()))
    return result.scalars().all()


@router.post("/staff", status_code=status.HTTP_201_CREATED)
async def mark_staff_attendance(body: dict, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    entry = StaffAttendance(
        school_id=current_user.school_id,
        marked_by=current_user.id,
        **{k: v for k, v in body.items() if k in [
            "user_id", "attendance_date", "check_in_time", "check_out_time",
            "status", "notes", "campus_id"
        ]},
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


@router.get("/staff-today")
async def get_staff_today(
    school_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    if not current_user.school_id:
        raise ForbiddenError("No school context")
        
    today_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    try:
        sql = """
            SELECT 
                a.id, a.user_id, a.status, a.created_at, a.attendance_date,
                a.clock_in, a.clock_out, a.latitude, a.longitude,
                p.display_name
            FROM hr_staff_attendance a
            LEFT JOIN profiles p ON a.user_id = p.id
            WHERE a.school_id = :school_id::uuid AND a.attendance_date = :today_date::date
        """
        res = await db.execute(text(sql), {"school_id": school_id, "today_date": today_date})
        rows = res.fetchall()
        
        return [
            {
                "id": str(r[0]),
                "user_id": str(r[1]),
                "status": r[2],
                "created_at": r[3].isoformat() if r[3] else None,
                "attendance_date": r[4].isoformat() if hasattr(r[4], 'isoformat') else str(r[4]),
                "clock_in": r[5].isoformat() if hasattr(r[5], 'isoformat') else (str(r[5]) if r[5] is not None else None),
                "clock_out": r[6].isoformat() if hasattr(r[6], 'isoformat') else (str(r[6]) if r[6] is not None else None),
                "latitude": float(r[7]) if r[7] is not None else None,
                "longitude": float(r[8]) if r[8] is not None else None,
                "userName": r[9] or f"Staff Member ({str(r[1])[:6]})"
            }
            for r in rows
        ]
    except Exception as e:
        import logging
        logging.getLogger("app.attendance").warning(f"Error fetching today's staff attendance: {e}")
        return []
