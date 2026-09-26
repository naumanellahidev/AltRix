"""
Router for Hostel & Boarding Facility Management System.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, text

from app.dependencies import CurrentUser, DbSession
from app.models.hostel import HostelRoom, HostelAllocation, HostelAttendance, HostelMessMenu
from app.utils.pagination import ListPageParams
from app.exceptions import ForbiddenError
from app.utils.permissions import ACADEMIC_GOV, expand_roles

router = APIRouter(prefix="/hostel", tags=["Hostel Management"])


# Hostel records are the school's own; only its academic staff (and anyone the
# school has made a warden through those roles) change them.
HOSTEL_STAFF = ACADEMIC_GOV


def _school(current_user) -> UUID:
    if not current_user.school_id:
        raise ForbiddenError("No school context")
    return UUID(str(current_user.school_id))


def _require_staff(current_user) -> None:
    if current_user.is_super_admin:
        return
    if not any(r in expand_roles(current_user.roles) for r in HOSTEL_STAFF):
        raise ForbiddenError("Only school staff manage the hostel")


async def _require_student_in_school(db, student_id: UUID, school_id: UUID) -> None:
    found = await db.execute(
        text("SELECT 1 FROM students WHERE id = CAST(:sid AS UUID) AND school_id = CAST(:school AS UUID)"),
        {"sid": str(student_id), "school": str(school_id)},
    )
    if found.first() is None:
        raise HTTPException(status_code=404, detail="Student not found in this school")


class HostelRoomCreateSchema(BaseModel):
    building_name: Optional[str] = "Main Hostel Block"
    room_number: str
    capacity: int = 2
    room_type: Optional[str] = "Standard Non-AC"
    fee_per_term: Optional[float] = 15000.0


class HostelRoomResponseSchema(BaseModel):
    id: UUID
    school_id: UUID
    building_name: str
    room_number: str
    capacity: int
    occupied_count: int
    room_type: str
    fee_per_term: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class HostelAllocateSchema(BaseModel):
    room_id: UUID
    student_id: UUID
    check_in_date: Optional[str] = None


class HostelAttendanceSchema(BaseModel):
    student_id: UUID
    attendance_date: Optional[str] = None
    status: str = "present"  # present, absent, leave, late
    warden_notes: Optional[str] = None


class MessMenuCreateSchema(BaseModel):
    day_of_week: str
    breakfast: str
    lunch: str
    dinner: str
    special_notes: Optional[str] = None


class MessMenuResponseSchema(BaseModel):
    id: UUID
    school_id: UUID
    day_of_week: str
    breakfast: str
    lunch: str
    dinner: str
    special_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("/rooms", response_model=List[HostelRoomResponseSchema])
async def list_hostel_rooms(
    db: DbSession,
    current_user: CurrentUser, page: ListPageParams,
):
    school_id = _school(current_user)
    stmt = select(HostelRoom).where(HostelRoom.school_id == school_id).order_by(HostelRoom.room_number)
    res = await db.execute(page.apply(stmt))
    return list(res.scalars().all())


@router.post("/rooms", response_model=HostelRoomResponseSchema)
async def create_hostel_room(
    payload: HostelRoomCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = _school(current_user)
    _require_staff(current_user)
    room = HostelRoom(
        school_id=school_id,
        building_name=payload.building_name or "Main Hostel Block",
        room_number=payload.room_number,
        capacity=payload.capacity,
        occupied_count=0,
        room_type=payload.room_type or "Standard Non-AC",
        fee_per_term=payload.fee_per_term,
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room


@router.post("/allocate")
async def allocate_student_to_room(
    payload: HostelAllocateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = _school(current_user)
    _require_staff(current_user)
    await _require_student_in_school(db, payload.student_id, school_id)
    stmt = (
        select(HostelRoom)
        .where(HostelRoom.id == payload.room_id, HostelRoom.school_id == school_id)
        .with_for_update()
    )
    res = await db.execute(stmt)
    room = res.scalar_one_or_none()
    housed = await db.execute(
        select(HostelAllocation.id).where(
            HostelAllocation.school_id == school_id,
            HostelAllocation.student_id == payload.student_id,
            HostelAllocation.status == "active",
        )
    )
    if housed.first() is not None:
        raise HTTPException(status_code=409, detail="This student already has a hostel room")

    if not room:
        raise HTTPException(status_code=404, detail="Hostel room not found")

    if room.occupied_count >= room.capacity:
        raise HTTPException(status_code=400, detail="Room is at full capacity")

    room.occupied_count += 1

    allocation = HostelAllocation(
        school_id=school_id,
        room_id=payload.room_id,
        student_id=payload.student_id,
        check_in_date=payload.check_in_date or datetime.now().strftime("%Y-%m-%d"),
        status="active",
    )
    db.add(allocation)
    await db.commit()
    return {"message": "Student allocated to hostel room successfully", "room_number": room.room_number}


@router.post("/attendance")
async def mark_hostel_night_attendance(
    payload: HostelAttendanceSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = _school(current_user)
    _require_staff(current_user)
    await _require_student_in_school(db, payload.student_id, school_id)
    att = HostelAttendance(
        school_id=school_id,
        student_id=payload.student_id,
        attendance_date=payload.attendance_date or datetime.now().strftime("%Y-%m-%d"),
        status=payload.status,
        warden_notes=payload.warden_notes,
    )
    db.add(att)
    await db.commit()
    return {"message": "Hostel night attendance recorded", "status": payload.status}


@router.get("/mess-menu", response_model=List[MessMenuResponseSchema])
async def get_hostel_mess_menu(
    db: DbSession,
    current_user: CurrentUser, page: ListPageParams,
):
    school_id = _school(current_user)
    stmt = select(HostelMessMenu).where(HostelMessMenu.school_id == school_id)
    res = await db.execute(page.apply(stmt))
    return list(res.scalars().all())


@router.post("/mess-menu", response_model=MessMenuResponseSchema)
async def update_hostel_mess_menu(
    payload: MessMenuCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = _school(current_user)
    _require_staff(current_user)
    stmt = select(HostelMessMenu).where(
        HostelMessMenu.school_id == school_id,
        HostelMessMenu.day_of_week == payload.day_of_week
    )
    res = await db.execute(stmt)
    menu = res.scalar_one_or_none()

    if not menu:
        menu = HostelMessMenu(
            school_id=school_id,
            day_of_week=payload.day_of_week,
            breakfast=payload.breakfast,
            lunch=payload.lunch,
            dinner=payload.dinner,
            special_notes=payload.special_notes,
        )
        db.add(menu)
    else:
        menu.breakfast = payload.breakfast
        menu.lunch = payload.lunch
        menu.dinner = payload.dinner
        menu.special_notes = payload.special_notes

    await db.commit()
    await db.refresh(menu)
    return menu


@router.get("/my-stay")
async def get_my_hostel_stay(student_id: UUID, current_user: CurrentUser, db: DbSession):
    """
    A boarder's own stay: room, building, warden and roommates' names.

    The student and parent hostel screens showed an invented hall, room, bed,
    warden (with a phone number), roommates and mess menu for every child,
    boarder or not. A child with no active allocation gets ``allocated: false``.
    """
    school_id = _school(current_user)
    from app.utils.security import get_allowed_student_ids
    allowed = await get_allowed_student_ids(current_user, db)
    if allowed is not None and str(student_id) not in {str(s) for s in allowed}:
        raise ForbiddenError("You can only see your own (or your child's) hostel stay.")
    await _require_student_in_school(db, student_id, school_id)

    row = (await db.execute(text(
        """
        SELECT a.room_id, a.check_in_date, r.room_number, r.room_type, r.building_name, r.capacity,
               b.name AS building, b.warden_name, b.warden_phone
        FROM hostel_allocations a
        JOIN hostel_rooms r ON r.id = a.room_id AND r.school_id = a.school_id
        LEFT JOIN hostel_buildings b ON b.school_id = a.school_id AND b.name = r.building_name
        WHERE a.school_id = :sid AND a.student_id = :st AND a.status = 'active'
        ORDER BY a.check_in_date DESC NULLS LAST LIMIT 1
        """
    ), {"sid": school_id, "st": student_id})).mappings().first()
    if not row:
        return {"allocated": False}
    mates = (await db.execute(text(
        """
        SELECT TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))) AS name
        FROM hostel_allocations a JOIN students s ON s.id = a.student_id
        WHERE a.school_id = :sid AND a.room_id = :room AND a.status = 'active' AND a.student_id <> :st
        ORDER BY 1
        """
    ), {"sid": school_id, "room": row["room_id"], "st": student_id})).scalars().all()
    return {
        "allocated": True,
        "building": row["building"] or row["building_name"],
        "room_number": row["room_number"],
        "room_type": row["room_type"],
        "capacity": row["capacity"],
        "check_in_date": row["check_in_date"].isoformat() if row["check_in_date"] else None,
        "warden_name": row["warden_name"],
        "warden_phone": row["warden_phone"],
        "roommates": list(mates),
    }
