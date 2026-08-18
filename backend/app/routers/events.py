"""
Events, Photo Gallery, and PTM (Parent-Teacher Meeting) router.
"""
import uuid
import logging
from typing import List, Optional
from datetime import date, datetime

from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, and_, or_, text
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbSession
from app.utils.permissions import expand_roles, ACADEMIC_GOV
from app.models.campus import Campus
from app.models.events import (
    SchoolEvent, EventPhoto, PTMSlot, PTMBooking,
    EventRSVP, SportsScorecard, AnnualFunctionPlan,
)
from app.models.academic import TimetableSlot, TimetablePeriod
from app.schemas import (
    EventRSVPCreate, EventRSVPOut,
    SportsScorecardCreate, SportsScorecardOut,
    AnnualFunctionPlanCreate, AnnualFunctionPlanOut,
    MessageResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/school-events", tags=["Events & PTM"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _to_uuid(val) -> Optional[uuid.UUID]:
    """Safely coerce any string or UUID object to native uuid.UUID."""
    if val is None or val == "" or str(val).lower() == "all" or str(val).lower() == "none":
        return None
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except Exception:
        return None

def _parse_date(val) -> date:
    """Safely parse various date string representations."""
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    s = str(val).strip()
    if "T" in s:
        s = s.split("T")[0]
    elif " " in s:
        s = s.split(" ")[0]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return date.today()


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
    """List school events."""
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        return []
    
    q = (
        select(SchoolEvent)
        .where(SchoolEvent.school_id == school_uuid)
        .order_by(SchoolEvent.event_date.desc())
        .limit(limit)
    )
    if event_type:
        q = q.where(SchoolEvent.event_type == event_type)
    if status_filter:
        q = q.where(SchoolEvent.status == status_filter)

    try:
        res = await db.execute(q)
        events = res.scalars().all()

        result = []
        for ev in events:
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
                status=ev.status or "upcoming", audience=ev.audience or "all",
                rsvp_enabled=bool(ev.rsvp_enabled), rsvp_count=ev.rsvp_count or 0,
                photo_count=photo_count,
                created_at=ev.created_at.isoformat() if ev.created_at else None,
            )
            result.append(out)
        return result
    except Exception as e:
        logger.error(f"Error listing events: {e}", exc_info=True)
        return []


@router.get("/{event_id}", response_model=SchoolEventOut)
async def get_event(event_id: str, current_user: CurrentUser, db: DbSession):
    """Get event details."""
    ev_uuid = _to_uuid(event_id)
    if not ev_uuid:
        raise HTTPException(status_code=404, detail="Invalid event ID")

    res = await db.execute(select(SchoolEvent).where(SchoolEvent.id == ev_uuid))
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
        status=ev.status or "upcoming", audience=ev.audience or "all",
        rsvp_enabled=bool(ev.rsvp_enabled), rsvp_count=ev.rsvp_count or 0,
        photo_count=photo_count,
        created_at=ev.created_at.isoformat() if ev.created_at else None,
    )


@router.get("/{event_id}/photos", response_model=List[EventPhotoOut])
async def get_event_photos(event_id: str, current_user: CurrentUser, db: DbSession):
    """Get all photos for an event."""
    ev_uuid = _to_uuid(event_id)
    if not ev_uuid:
        return []

    q = (
        select(EventPhoto)
        .where(EventPhoto.event_id == ev_uuid)
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
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="No school context in user session")
    
    campus_uuid = _to_uuid(body.campus_id)
    if campus_uuid:
        camp_chk = await db.execute(select(Campus.id).where(Campus.id == campus_uuid, Campus.school_id == school_uuid))
        if not camp_chk.scalar_one_or_none():
            campus_uuid = None

    user_uuid = _to_uuid(getattr(current_user, "user_id", None)) or _to_uuid(getattr(current_user, "id", None))
    ev_date = _parse_date(body.event_date)

    try:
        ev = SchoolEvent(
            school_id=school_uuid,
            campus_id=campus_uuid,
            title=body.title.strip(),
            description=body.description.strip() if body.description else None,
            event_type=body.event_type or "general",
            event_date=ev_date,
            start_time=body.start_time,
            end_time=body.end_time,
            location=body.location,
            cover_image_url=body.cover_image_url if body.cover_image_url else None,
            status="upcoming",
            audience=body.audience or "all",
            rsvp_enabled=bool(body.rsvp_enabled),
            rsvp_count=0,
            created_by=user_uuid,
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
            status=ev.status or "upcoming", audience=ev.audience or "all",
            rsvp_enabled=bool(ev.rsvp_enabled), rsvp_count=0, photo_count=0,
            created_at=ev.created_at.isoformat() if ev.created_at else None,
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create school event: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save event: {str(e)}")


@router.post("/{event_id}/photos", response_model=EventPhotoOut, status_code=status.HTTP_201_CREATED)
async def add_event_photo(event_id: str, body: PhotoCreate, current_user: CurrentUser, db: DbSession):
    """Add a photo to an event."""
    school_uuid = _to_uuid(current_user.school_id)
    ev_uuid = _to_uuid(event_id)
    if not school_uuid or not ev_uuid:
        raise HTTPException(status_code=400, detail="Invalid school or event context")

    user_uuid = _to_uuid(getattr(current_user, "user_id", None)) or _to_uuid(getattr(current_user, "id", None))

    try:
        photo = EventPhoto(
            school_id=school_uuid,
            event_id=ev_uuid,
            photo_url=body.photo_url,
            thumbnail_url=body.thumbnail_url,
            caption=body.caption,
            sort_order=body.sort_order,
            uploaded_by=user_uuid,
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
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to add event photo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add photo: {str(e)}")


# ── Event RSVPs ──────────────────────────────────────────────────────────────

@router.post("/{event_id}/rsvp", response_model=EventRSVPOut, status_code=status.HTTP_201_CREATED)
async def submit_event_rsvp(
    event_id: str,
    body: EventRSVPCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Parent records event RSVP going/maybe/not_going response for their child."""
    school_uuid = _to_uuid(current_user.school_id)
    ev_uuid = _to_uuid(event_id)
    student_uuid = _to_uuid(body.student_id)
    parent_uuid = _to_uuid(getattr(current_user, "id", None)) or _to_uuid(getattr(current_user, "user_id", None))

    if not school_uuid or not ev_uuid or not student_uuid or not parent_uuid:
        raise HTTPException(status_code=400, detail="Invalid event, parent or student ID")

    try:
        existing_query = select(EventRSVP).where(
            EventRSVP.event_id == ev_uuid,
            EventRSVP.parent_user_id == parent_uuid,
            EventRSVP.student_id == student_uuid,
        )
        res = await db.execute(existing_query)
        rsvp = res.scalar_one_or_none()

        if rsvp:
            rsvp.status = body.status
            rsvp.notes = body.notes
        else:
            rsvp = EventRSVP(
                school_id=school_uuid,
                event_id=ev_uuid,
                parent_user_id=parent_uuid,
                student_id=student_uuid,
                status=body.status,
                notes=body.notes,
            )
            db.add(rsvp)

        # Increment event RSVP count
        event_res = await db.execute(select(SchoolEvent).where(SchoolEvent.id == ev_uuid))
        event = event_res.scalar_one_or_none()
        if event and body.status == "going":
            event.rsvp_count = (event.rsvp_count or 0) + 1

        await db.commit()
        await db.refresh(rsvp)
        return rsvp
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to submit RSVP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to record RSVP")


@router.get("/{event_id}/rsvps", response_model=List[EventRSVPOut])
async def get_event_rsvps(event_id: str, current_user: CurrentUser, db: DbSession):
    """Get RSVP list for an event (organizer/staff view)."""
    ev_uuid = _to_uuid(event_id)
    if not ev_uuid:
        return []
    res = await db.execute(
        select(EventRSVP)
        .where(EventRSVP.event_id == ev_uuid)
        .order_by(EventRSVP.created_at.desc())
    )
    return res.scalars().all()


# ── Sports Scorecard ──────────────────────────────────────────────────────────

@router.get("/{event_id}/scorecard", response_model=List[SportsScorecardOut])
async def get_sports_scorecard(event_id: str, current_user: CurrentUser, db: DbSession):
    """Fetch house scores / positions for a sports day event."""
    ev_uuid = _to_uuid(event_id)
    if not ev_uuid:
        return []
    res = await db.execute(
        select(SportsScorecard)
        .where(SportsScorecard.event_id == ev_uuid)
        .order_by(SportsScorecard.points.desc(), SportsScorecard.position)
    )
    return res.scalars().all()


@router.post("/{event_id}/scorecard", response_model=SportsScorecardOut, status_code=status.HTTP_201_CREATED)
async def update_sports_scorecard(
    event_id: str,
    body: SportsScorecardCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Record / update a score entry for a sports day activity."""
    school_uuid = _to_uuid(current_user.school_id)
    ev_uuid = _to_uuid(event_id)
    if not school_uuid or not ev_uuid:
        raise HTTPException(status_code=400, detail="No school or event context")

    try:
        existing_query = select(SportsScorecard).where(
            SportsScorecard.event_id == ev_uuid,
            SportsScorecard.title == body.title,
            SportsScorecard.house_name == body.house_name,
        )
        res = await db.execute(existing_query)
        scorecard = res.scalar_one_or_none()

        if scorecard:
            scorecard.points = body.points
            scorecard.position = body.position
            scorecard.details = body.details
        else:
            scorecard = SportsScorecard(
                school_id=school_uuid,
                event_id=ev_uuid,
                title=body.title,
                house_name=body.house_name,
                points=body.points,
                position=body.position,
                details=body.details,
            )
            db.add(scorecard)

        await db.commit()
        await db.refresh(scorecard)
        return scorecard
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to update scorecard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save score")


# ── Annual Function Planning ──────────────────────────────────────────────────

@router.get("/{event_id}/tasks", response_model=List[AnnualFunctionPlanOut])
async def get_annual_function_tasks(event_id: str, current_user: CurrentUser, db: DbSession):
    """Get organizers task checklist for annual function planning."""
    ev_uuid = _to_uuid(event_id)
    if not ev_uuid:
        return []
    res = await db.execute(
        select(AnnualFunctionPlan)
        .where(AnnualFunctionPlan.event_id == ev_uuid)
        .order_by(AnnualFunctionPlan.due_date, AnnualFunctionPlan.created_at)
    )
    return res.scalars().all()


@router.post("/{event_id}/tasks", response_model=AnnualFunctionPlanOut, status_code=status.HTTP_201_CREATED)
async def create_annual_function_task(
    event_id: str,
    body: AnnualFunctionPlanCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Create a task item for event planners."""
    school_uuid = _to_uuid(current_user.school_id)
    ev_uuid = _to_uuid(event_id)
    if not school_uuid or not ev_uuid:
        raise HTTPException(status_code=400, detail="No school or event context")
    
    due = None
    if body.due_date:
        due = _parse_date(body.due_date)

    assigned_uuid = _to_uuid(body.assigned_to)

    try:
        task = AnnualFunctionPlan(
            school_id=school_uuid,
            event_id=ev_uuid,
            task_name=body.task_name,
            assigned_to=assigned_uuid,
            due_date=due,
            status=body.status or "pending",
            priority=body.priority or "medium",
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add planning task")


@router.patch("/tasks/{task_id}", response_model=AnnualFunctionPlanOut)
async def toggle_planning_task(
    task_id: str,
    body: dict,
    current_user: CurrentUser,
    db: DbSession,
):
    """Update task priority, status, or assignee."""
    t_uuid = _to_uuid(task_id)
    if not t_uuid:
        raise HTTPException(status_code=404, detail="Task not found")

    res = await db.execute(select(AnnualFunctionPlan).where(AnnualFunctionPlan.id == t_uuid))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if "status" in body:
        task.status = body["status"]
    if "priority" in body:
        task.priority = body["priority"]
    if "assigned_to" in body:
        task.assigned_to = _to_uuid(body["assigned_to"])

    await db.commit()
    await db.refresh(task)
    return task


# ── PTM Endpoints ────────────────────────────────────────────────────────────

@router.get("/ptm/my-slots", response_model=List[PTMSlotOut])
async def get_my_ptm_slots(current_user: CurrentUser, db: DbSession, student_id: Optional[str] = None):
    """Parent: get available PTM slots for their child's teachers."""
    school_uuid = _to_uuid(current_user.school_id)
    parent_uuid = _to_uuid(getattr(current_user, "user_id", None)) or _to_uuid(getattr(current_user, "id", None))
    if not school_uuid or not parent_uuid:
        return []

    try:
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
        res = await db.execute(query, {"school_id": school_uuid, "parent_id": parent_uuid})
        teachers = res.fetchall()
        teacher_map = {str(t[0]): {"name": t[1], "subject": t[2]} for t in teachers}
        teacher_ids = [t[0] for t in teachers]

        if not teacher_ids:
            return []

        today = date.today()
        q = (
            select(PTMSlot)
            .where(
                PTMSlot.school_id == school_uuid,
                PTMSlot.teacher_user_id.in_(teacher_ids),
                PTMSlot.slot_date >= today,
                PTMSlot.status != "cancelled",
            )
            .order_by(PTMSlot.slot_date, PTMSlot.start_time)
        )
        slot_res = await db.execute(q)
        slots = slot_res.scalars().all()

        my_bookings_q = (
            select(PTMBooking.slot_id)
            .where(
                PTMBooking.parent_user_id == parent_uuid,
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
                location=s.location, slot_type=s.slot_type or "manual",
                max_bookings=s.max_bookings or 1, current_bookings=s.current_bookings or 0,
                status=s.status or "available",
                is_booked_by_me=str(s.id) in my_booked_slot_ids,
            ))
        return result
    except Exception as e:
        logger.error(f"Failed to fetch PTM slots: {e}", exc_info=True)
        return []


@router.post("/ptm/book", response_model=PTMBookingOut, status_code=status.HTTP_201_CREATED)
async def book_ptm(body: PTMBookRequest, current_user: CurrentUser, db: DbSession):
    """Parent: book a PTM slot."""
    school_uuid = _to_uuid(current_user.school_id)
    slot_uuid = _to_uuid(body.slot_id)
    student_uuid = _to_uuid(body.student_id)
    parent_uuid = _to_uuid(getattr(current_user, "user_id", None)) or _to_uuid(getattr(current_user, "id", None))

    if not school_uuid or not slot_uuid or not student_uuid or not parent_uuid:
        raise HTTPException(status_code=400, detail="Invalid school, slot, or student context")

    slot_res = await db.execute(select(PTMSlot).where(PTMSlot.id == slot_uuid))
    slot = slot_res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="PTM slot not found")
    if slot.status == "cancelled":
        raise HTTPException(status_code=400, detail="This slot has been cancelled")
    if slot.current_bookings >= slot.max_bookings:
        raise HTTPException(status_code=400, detail="This slot is fully booked")

    existing_q = select(PTMBooking).where(
        PTMBooking.slot_id == slot_uuid,
        PTMBooking.parent_user_id == parent_uuid,
        PTMBooking.status == "confirmed",
    )
    existing_res = await db.execute(existing_q)
    if existing_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already booked this slot")

    booking = PTMBooking(
        school_id=school_uuid,
        slot_id=slot_uuid,
        parent_user_id=parent_uuid,
        student_id=student_uuid,
        parent_notes=body.parent_notes,
    )
    db.add(booking)

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
    school_uuid = _to_uuid(current_user.school_id)
    parent_uuid = _to_uuid(getattr(current_user, "user_id", None)) or _to_uuid(getattr(current_user, "id", None))
    if not school_uuid or not parent_uuid:
        return []

    q = (
        select(PTMBooking)
        .options(selectinload(PTMBooking.slot))
        .where(
            PTMBooking.school_id == school_uuid,
            PTMBooking.parent_user_id == parent_uuid,
        )
        .order_by(PTMBooking.created_at.desc())
    )
    res = await db.execute(q)
    bookings = res.scalars().all()

    teacher_names = {}
    for b in bookings:
        tid = str(b.slot.teacher_user_id) if b.slot else None
        if tid and tid not in teacher_names:
            t_uuid = _to_uuid(tid)
            if t_uuid:
                name_res = await db.execute(text(
                    "SELECT COALESCE(hsd.full_name, p.display_name, p.email) "
                    "FROM profiles p LEFT JOIN hr_staff_directory hsd ON hsd.linked_user_id = p.id "
                    "WHERE p.id = :uid LIMIT 1"
                ), {"uid": t_uuid})
                name_row = name_res.fetchone()
                teacher_names[tid] = name_row[0] if name_row else "Teacher"

    student_names = {}
    for b in bookings:
        sid = str(b.student_id)
        if sid not in student_names:
            s_uuid = _to_uuid(sid)
            if s_uuid:
                sname_res = await db.execute(text(
                    "SELECT first_name, last_name FROM students WHERE id = :sid"
                ), {"sid": s_uuid})
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
async def cancel_ptm_booking(booking_id: str, current_user: CurrentUser, db: DbSession):
    """Parent: cancel a PTM booking."""
    b_uuid = _to_uuid(booking_id)
    parent_uuid = _to_uuid(getattr(current_user, "user_id", None)) or _to_uuid(getattr(current_user, "id", None))
    if not b_uuid:
        raise HTTPException(status_code=404, detail="Booking not found")

    res = await db.execute(select(PTMBooking).where(PTMBooking.id == b_uuid))
    booking = res.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if parent_uuid and booking.parent_user_id != parent_uuid and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")
    if booking.status != "confirmed":
        raise HTTPException(status_code=400, detail="Booking is not in confirmed status")

    booking.status = "cancelled"
    booking.cancelled_at = datetime.utcnow()

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
    school_uuid = _to_uuid(current_user.school_id)
    teacher_uuid = _to_uuid(body.teacher_user_id)
    if not school_uuid or not teacher_uuid:
        raise HTTPException(status_code=400, detail="Invalid school or teacher context")

    slot_d = _parse_date(body.slot_date)

    slot = PTMSlot(
        school_id=school_uuid,
        teacher_user_id=teacher_uuid,
        slot_date=slot_d,
        start_time=body.start_time, end_time=body.end_time,
        location=body.location, max_bookings=body.max_bookings or 1,
        notes=body.notes, slot_type="manual",
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return PTMSlotOut(
        id=str(slot.id), teacher_user_id=str(slot.teacher_user_id),
        slot_date=slot.slot_date.isoformat(), start_time=slot.start_time,
        end_time=slot.end_time, location=slot.location,
        slot_type=slot.slot_type or "manual", max_bookings=slot.max_bookings or 1,
        current_bookings=0, status=slot.status or "available",
    )


@router.post("/ptm/auto-generate", status_code=status.HTTP_201_CREATED)
async def auto_generate_ptm_slots(body: PTMAutoGenerateRequest, current_user: CurrentUser, db: DbSession):
    """Admin: auto-generate PTM slots from teacher timetable free periods."""
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="No school context")
    from datetime import timedelta

    ptm_date = _parse_date(body.ptm_date)

    teachers_res = await db.execute(text(
        "SELECT DISTINCT linked_user_id FROM hr_staff_directory WHERE school_id = :sid AND linked_user_id IS NOT NULL AND is_active = true"
    ), {"sid": school_uuid})
    teacher_ids = [r[0] for r in teachers_res.fetchall()]

    if not teacher_ids:
        return {"slots_created": 0, "message": "No active teachers found"}

    try:
        start_dt = datetime.strptime(body.start_time, "%H:%M")
        end_dt = datetime.strptime(body.end_time, "%H:%M")
    except Exception:
        start_dt = datetime.strptime("09:00", "%H:%M")
        end_dt = datetime.strptime("14:00", "%H:%M")
    duration = timedelta(minutes=body.slot_duration_mins or 15)

    slots_created = 0
    for tid in teacher_ids:
        t_uuid = _to_uuid(tid)
        if not t_uuid:
            continue
        current_time = start_dt
        while current_time + duration <= end_dt:
            slot_start = current_time.strftime("%H:%M")
            slot_end = (current_time + duration).strftime("%H:%M")

            slot = PTMSlot(
                school_id=school_uuid,
                teacher_user_id=t_uuid,
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
