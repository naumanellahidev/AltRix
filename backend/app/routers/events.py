"""
Events, Photo Gallery, and PTM (Parent-Teacher Meeting) router.
"""
from typing import List, Optional
from uuid import UUID
from datetime import date, datetime

from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, and_, or_, text
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbSession
from app.models.events import SchoolEvent, EventPhoto, PTMSlot, PTMBooking
from app.models.academic import TimetableSlot, TimetablePeriod

router = APIRouter(prefix="/school-events", tags=["Events & PTM"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class EventPhotoOut(BaseModel):
    id: str
    photo_url: str
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None
    sort_order: int = 0
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class SchoolEventOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    event_type: str = "general"
    event_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    cover_image_url: Optional[str] = None
    status: str = "upcoming"
    audience: str = "all"
    rsvp_enabled: bool = False
    rsvp_count: Optional[int] = 0
    photo_count: int = 0
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: str = "general"
    event_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    cover_image_url: Optional[str] = None
    audience: str = "all"
    rsvp_enabled: bool = False
    campus_id: Optional[str] = None

class PhotoCreate(BaseModel):
    photo_url: str
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None
    sort_order: int = 0

class PTMSlotOut(BaseModel):
    id: str
    teacher_user_id: str
    teacher_name: Optional[str] = None
    subject_name: Optional[str] = None
    slot_date: str
    start_time: str
    end_time: str
    location: Optional[str] = None
    slot_type: str = "manual"
    max_bookings: int = 1
    current_bookings: int = 0
    status: str = "available"
    is_booked_by_me: bool = False

    class Config:
        from_attributes = True

class PTMBookingOut(BaseModel):
    id: str
    slot_id: str
    teacher_name: Optional[str] = None
    subject_name: Optional[str] = None
    slot_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None
    status: str = "confirmed"
    parent_notes: Optional[str] = None
    teacher_notes: Optional[str] = None
    meeting_summary: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class PTMSlotCreate(BaseModel):
    teacher_user_id: str
    slot_date: str
    start_time: str
    end_time: str
    location: Optional[str] = None
    max_bookings: int = 1
    notes: Optional[str] = None

class PTMBookRequest(BaseModel):
    slot_id: str
    student_id: str
    parent_notes: Optional[str] = None

class PTMAutoGenerateRequest(BaseModel):
    ptm_date: str
    slot_duration_mins: int = 15
    start_time: str = "09:00"
    end_time: str = "14:00"
    location: Optional[str] = None


# ── Events Endpoints ─────────────────────────────────────────────────────────

@router.get("", response_model=List[SchoolEventOut])
async def list_events(
    current_user: CurrentUser, db: DbSession,
    event_type: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
):
    """List school events. Parents see all events."""
    if not current_user.school_id:
        return []
    q = (
        select(SchoolEvent)
        .where(SchoolEvent.school_id == current_user.school_id)
        .order_by(SchoolEvent.event_date.desc())
        .limit(limit)
    )
    if event_type:
        q = q.where(SchoolEvent.event_type == event_type)
    if status_filter:
        q = q.where(SchoolEvent.status == status_filter)

    res = await db.execute(q)
    events = res.scalars().all()

    result = []
    for ev in events:
        # Count photos
        count_res = await db.execute(
            select(func.count()).select_from(EventPhoto).where(EventPhoto.event_id == ev.id)
        )
        photo_count = count_res.scalar() or 0
        out = SchoolEventOut(
            id=str(ev.id), title=ev.title, description=ev.description,
            event_type=ev.event_type,
            event_date=ev.event_date.isoformat() if ev.event_date else "",
            start_time=ev.start_time, end_time=ev.end_time,
            location=ev.location, cover_image_url=ev.cover_image_url,
            status=ev.status, audience=ev.audience,
            rsvp_enabled=ev.rsvp_enabled, rsvp_count=ev.rsvp_count,
            photo_count=photo_count,
            created_at=ev.created_at.isoformat() if ev.created_at else None,
        )
        result.append(out)
    return result


@router.get("/{event_id}", response_model=SchoolEventOut)
async def get_event(event_id: UUID, current_user: CurrentUser, db: DbSession):
    """Get event details."""
    res = await db.execute(select(SchoolEvent).where(SchoolEvent.id == event_id))
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    count_res = await db.execute(
        select(func.count()).select_from(EventPhoto).where(EventPhoto.event_id == ev.id)
    )
    photo_count = count_res.scalar() or 0
    return SchoolEventOut(
        id=str(ev.id), title=ev.title, description=ev.description,
        event_type=ev.event_type,
        event_date=ev.event_date.isoformat() if ev.event_date else "",
        start_time=ev.start_time, end_time=ev.end_time,
        location=ev.location, cover_image_url=ev.cover_image_url,
        status=ev.status, audience=ev.audience,
        rsvp_enabled=ev.rsvp_enabled, rsvp_count=ev.rsvp_count,
        photo_count=photo_count,
        created_at=ev.created_at.isoformat() if ev.created_at else None,
    )


@router.get("/{event_id}/photos", response_model=List[EventPhotoOut])
async def get_event_photos(event_id: UUID, current_user: CurrentUser, db: DbSession):
    """Get all photos for an event."""
    q = (
        select(EventPhoto)
        .where(EventPhoto.event_id == event_id)
        .order_by(EventPhoto.sort_order, EventPhoto.created_at)
    )
    res = await db.execute(q)
    photos = res.scalars().all()
    return [EventPhotoOut(
        id=str(p.id), photo_url=p.photo_url, thumbnail_url=p.thumbnail_url,
        caption=p.caption, sort_order=p.sort_order,
        created_at=p.created_at.isoformat() if p.created_at else None,
    ) for p in photos]


@router.post("", response_model=SchoolEventOut, status_code=status.HTTP_201_CREATED)
async def create_event(body: EventCreate, current_user: CurrentUser, db: DbSession):
    """Create a new school event."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    from datetime import datetime as dt
    ev = SchoolEvent(
        school_id=current_user.school_id,
        title=body.title, description=body.description,
        event_type=body.event_type,
        event_date=dt.strptime(body.event_date, "%Y-%m-%d").date(),
        start_time=body.start_time, end_time=body.end_time,
        location=body.location, cover_image_url=body.cover_image_url,
        audience=body.audience, rsvp_enabled=body.rsvp_enabled,
        campus_id=UUID(body.campus_id) if body.campus_id else None,
        created_by=current_user.user_id,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return SchoolEventOut(
        id=str(ev.id), title=ev.title, description=ev.description,
        event_type=ev.event_type,
        event_date=ev.event_date.isoformat(),
        start_time=ev.start_time, end_time=ev.end_time,
        location=ev.location, cover_image_url=ev.cover_image_url,
        status=ev.status, audience=ev.audience,
        rsvp_enabled=ev.rsvp_enabled, rsvp_count=0, photo_count=0,
        created_at=ev.created_at.isoformat() if ev.created_at else None,
    )


@router.post("/{event_id}/photos", response_model=EventPhotoOut, status_code=status.HTTP_201_CREATED)
async def add_event_photo(event_id: UUID, body: PhotoCreate, current_user: CurrentUser, db: DbSession):
    """Add a photo to an event."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    photo = EventPhoto(
        school_id=current_user.school_id,
        event_id=event_id,
        photo_url=body.photo_url, thumbnail_url=body.thumbnail_url,
        caption=body.caption, sort_order=body.sort_order,
        uploaded_by=current_user.user_id,
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return EventPhotoOut(
        id=str(photo.id), photo_url=photo.photo_url,
        thumbnail_url=photo.thumbnail_url, caption=photo.caption,
        sort_order=photo.sort_order,
        created_at=photo.created_at.isoformat() if photo.created_at else None,
    )


# ── PTM Endpoints ────────────────────────────────────────────────────────────

@router.get("/ptm/my-slots", response_model=List[PTMSlotOut])
async def get_my_ptm_slots(current_user: CurrentUser, db: DbSession, student_id: Optional[str] = None):
    """Parent: get available PTM slots for their child's teachers."""
    if not current_user.school_id:
        return []

    # Find child's teachers
    query = text("""
        SELECT DISTINCT tsa.teacher_user_id, 
               COALESCE(hsd.full_name, p.display_name, p.email) as teacher_name,
               s.name as subject_name
        FROM teacher_subject_assignments tsa
        JOIN student_enrollments se ON se.class_section_id = tsa.class_section_id AND se.school_id = tsa.school_id
        LEFT JOIN hr_staff_directory hsd ON hsd.linked_user_id = tsa.teacher_user_id AND hsd.school_id = tsa.school_id
        LEFT JOIN profiles p ON p.id = tsa.teacher_user_id
        LEFT JOIN subjects s ON s.id = tsa.subject_id
        WHERE tsa.school_id = :school_id
        AND se.student_id IN (
            SELECT student_id FROM student_guardians WHERE user_id = :parent_id
        )
    """)
    res = await db.execute(query, {"school_id": current_user.school_id, "parent_id": current_user.user_id})
    teachers = res.fetchall()
    teacher_map = {str(t[0]): {"name": t[1], "subject": t[2]} for t in teachers}
    teacher_ids = [t[0] for t in teachers]

    if not teacher_ids:
        return []

    # Get available slots for these teachers (upcoming)
    today = date.today()
    q = (
        select(PTMSlot)
        .where(
            PTMSlot.school_id == current_user.school_id,
            PTMSlot.teacher_user_id.in_(teacher_ids),
            PTMSlot.slot_date >= today,
            PTMSlot.status != "cancelled",
        )
        .order_by(PTMSlot.slot_date, PTMSlot.start_time)
    )
    slot_res = await db.execute(q)
    slots = slot_res.scalars().all()

    # Check which slots this parent has already booked
    my_bookings_q = (
        select(PTMBooking.slot_id)
        .where(
            PTMBooking.parent_user_id == current_user.user_id,
            PTMBooking.status == "confirmed",
        )
    )
    my_res = await db.execute(my_bookings_q)
    my_booked_slot_ids = {str(r[0]) for r in my_res.fetchall()}

    result = []
    for s in slots:
        tid = str(s.teacher_user_id)
        info = teacher_map.get(tid, {})
        result.append(PTMSlotOut(
            id=str(s.id),
            teacher_user_id=tid,
            teacher_name=info.get("name"),
            subject_name=info.get("subject"),
            slot_date=s.slot_date.isoformat() if s.slot_date else "",
            start_time=s.start_time, end_time=s.end_time,
            location=s.location, slot_type=s.slot_type,
            max_bookings=s.max_bookings, current_bookings=s.current_bookings,
            status=s.status,
            is_booked_by_me=str(s.id) in my_booked_slot_ids,
        ))
    return result


@router.post("/ptm/book", response_model=PTMBookingOut, status_code=status.HTTP_201_CREATED)
async def book_ptm(body: PTMBookRequest, current_user: CurrentUser, db: DbSession):
    """Parent: book a PTM slot."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")

    # Verify slot exists and is available
    slot_res = await db.execute(select(PTMSlot).where(PTMSlot.id == UUID(body.slot_id)))
    slot = slot_res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="PTM slot not found")
    if slot.status == "cancelled":
        raise HTTPException(status_code=400, detail="This slot has been cancelled")
    if slot.current_bookings >= slot.max_bookings:
        raise HTTPException(status_code=400, detail="This slot is fully booked")

    # Check if already booked
    existing_q = select(PTMBooking).where(
        PTMBooking.slot_id == UUID(body.slot_id),
        PTMBooking.parent_user_id == current_user.user_id,
        PTMBooking.status == "confirmed",
    )
    existing_res = await db.execute(existing_q)
    if existing_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already booked this slot")

    booking = PTMBooking(
        school_id=current_user.school_id,
        slot_id=UUID(body.slot_id),
        parent_user_id=current_user.user_id,
        student_id=UUID(body.student_id),
        parent_notes=body.parent_notes,
    )
    db.add(booking)

    # Update slot booking count
    slot.current_bookings += 1
    if slot.current_bookings >= slot.max_bookings:
        slot.status = "fully_booked"

    await db.commit()
    await db.refresh(booking)

    return PTMBookingOut(
        id=str(booking.id), slot_id=str(booking.slot_id),
        student_id=str(booking.student_id),
        status=booking.status, parent_notes=booking.parent_notes,
        slot_date=slot.slot_date.isoformat() if slot.slot_date else None,
        start_time=slot.start_time, end_time=slot.end_time,
        location=slot.location,
        created_at=booking.created_at.isoformat() if booking.created_at else None,
    )


@router.get("/ptm/my-bookings", response_model=List[PTMBookingOut])
async def get_my_ptm_bookings(current_user: CurrentUser, db: DbSession):
    """Parent: list their PTM bookings."""
    if not current_user.school_id:
        return []
    q = (
        select(PTMBooking)
        .options(selectinload(PTMBooking.slot))
        .where(
            PTMBooking.school_id == current_user.school_id,
            PTMBooking.parent_user_id == current_user.user_id,
        )
        .order_by(PTMBooking.created_at.desc())
    )
    res = await db.execute(q)
    bookings = res.scalars().all()

    # Get teacher names
    teacher_names = {}
    for b in bookings:
        tid = str(b.slot.teacher_user_id) if b.slot else None
        if tid and tid not in teacher_names:
            name_res = await db.execute(text(
                "SELECT COALESCE(hsd.full_name, p.display_name, p.email) "
                "FROM profiles p LEFT JOIN hr_staff_directory hsd ON hsd.linked_user_id = p.id "
                "WHERE p.id = :uid LIMIT 1"
            ), {"uid": tid})
            name_row = name_res.fetchone()
            teacher_names[tid] = name_row[0] if name_row else "Teacher"

    # Get student names
    student_names = {}
    for b in bookings:
        sid = str(b.student_id)
        if sid not in student_names:
            sname_res = await db.execute(text(
                "SELECT first_name, last_name FROM students WHERE id = :sid"
            ), {"sid": sid})
            sname_row = sname_res.fetchone()
            student_names[sid] = f"{sname_row[0] or ''} {sname_row[1] or ''}".strip() if sname_row else "Student"

    result = []
    for b in bookings:
        tid = str(b.slot.teacher_user_id) if b.slot else None
        result.append(PTMBookingOut(
            id=str(b.id), slot_id=str(b.slot_id),
            teacher_name=teacher_names.get(tid, "Teacher") if tid else None,
            slot_date=b.slot.slot_date.isoformat() if b.slot and b.slot.slot_date else None,
            start_time=b.slot.start_time if b.slot else None,
            end_time=b.slot.end_time if b.slot else None,
            location=b.slot.location if b.slot else None,
            student_id=str(b.student_id),
            student_name=student_names.get(str(b.student_id), "Student"),
            status=b.status, parent_notes=b.parent_notes,
            teacher_notes=b.teacher_notes, meeting_summary=b.meeting_summary,
            created_at=b.created_at.isoformat() if b.created_at else None,
        ))
    return result


@router.delete("/ptm/bookings/{booking_id}")
async def cancel_ptm_booking(booking_id: UUID, current_user: CurrentUser, db: DbSession):
    """Parent: cancel a PTM booking."""
    res = await db.execute(select(PTMBooking).where(PTMBooking.id == booking_id))
    booking = res.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if str(booking.parent_user_id) != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="Not your booking")
    if booking.status != "confirmed":
        raise HTTPException(status_code=400, detail="Booking is not in confirmed status")

    booking.status = "cancelled"
    booking.cancelled_at = datetime.utcnow()

    # Decrement slot booking count
    slot_res = await db.execute(select(PTMSlot).where(PTMSlot.id == booking.slot_id))
    slot = slot_res.scalar_one_or_none()
    if slot:
        slot.current_bookings = max(0, slot.current_bookings - 1)
        if slot.status == "fully_booked":
            slot.status = "available"

    await db.commit()
    return {"status": "cancelled"}


# ── PTM Admin: Create Slots (Manual + Auto) ──────────────────────────────────

@router.post("/ptm/slots", response_model=PTMSlotOut, status_code=status.HTTP_201_CREATED)
async def create_ptm_slot(body: PTMSlotCreate, current_user: CurrentUser, db: DbSession):
    """Admin: create a manual PTM slot."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    from datetime import datetime as dt
    slot = PTMSlot(
        school_id=current_user.school_id,
        teacher_user_id=UUID(body.teacher_user_id),
        slot_date=dt.strptime(body.slot_date, "%Y-%m-%d").date(),
        start_time=body.start_time, end_time=body.end_time,
        location=body.location, max_bookings=body.max_bookings,
        notes=body.notes, slot_type="manual",
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return PTMSlotOut(
        id=str(slot.id), teacher_user_id=str(slot.teacher_user_id),
        slot_date=slot.slot_date.isoformat(), start_time=slot.start_time,
        end_time=slot.end_time, location=slot.location,
        slot_type=slot.slot_type, max_bookings=slot.max_bookings,
        current_bookings=0, status=slot.status,
    )


@router.post("/ptm/auto-generate", status_code=status.HTTP_201_CREATED)
async def auto_generate_ptm_slots(body: PTMAutoGenerateRequest, current_user: CurrentUser, db: DbSession):
    """Admin: auto-generate PTM slots from teacher timetable free periods."""
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="No school context")
    from datetime import datetime as dt, timedelta

    ptm_date = dt.strptime(body.ptm_date, "%Y-%m-%d").date()
    day_of_week = ptm_date.weekday()  # 0=Monday

    # Get all teachers in the school
    teachers_res = await db.execute(text(
        "SELECT DISTINCT linked_user_id FROM hr_staff_directory WHERE school_id = :sid AND linked_user_id IS NOT NULL AND is_active = true"
    ), {"sid": current_user.school_id})
    teacher_ids = [r[0] for r in teachers_res.fetchall()]

    if not teacher_ids:
        return {"slots_created": 0, "message": "No active teachers found"}

    # Parse start/end times
    start_dt = dt.strptime(body.start_time, "%H:%M")
    end_dt = dt.strptime(body.end_time, "%H:%M")
    duration = timedelta(minutes=body.slot_duration_mins)

    slots_created = 0
    for tid in teacher_ids:
        # Generate time slots
        current_time = start_dt
        while current_time + duration <= end_dt:
            slot_start = current_time.strftime("%H:%M")
            slot_end = (current_time + duration).strftime("%H:%M")

            slot = PTMSlot(
                school_id=current_user.school_id,
                teacher_user_id=tid,
                slot_date=ptm_date,
                start_time=slot_start,
                end_time=slot_end,
                location=body.location,
                slot_type="auto_generated",
            )
            db.add(slot)
            slots_created += 1
            current_time += duration

    await db.commit()
    return {"slots_created": slots_created, "message": f"Generated {slots_created} PTM slots"}
