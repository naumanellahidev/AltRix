"""
Parent Mobile Portal router: mobile feed, PTM slot booking, live bus updates, fee receipts.
"""
from typing import List, Optional
from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.events import PTMSlot, PTMBooking
from app.models.transport import StudentTransportAssignment, TransportEventLog, BusRoute

router = APIRouter(prefix="/parent-portal", tags=["Parent Portal"])


class PTMBookingCreateSchema(BaseModel):
    slot_id: UUID
    student_id: UUID
    notes: Optional[str] = None


@router.get("/overview")
async def get_parent_overview(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return {"error": "User has no school assigned"}
    
    # Fetch recent transport events
    stmt_logs = select(TransportEventLog).where(
        TransportEventLog.school_id == current_user.school_id
    ).order_by(TransportEventLog.created_at.desc()).limit(10)
    res_logs = await db.execute(stmt_logs)
    logs = res_logs.scalars().all()

    # Fetch available PTM slots
    stmt_ptm = select(PTMSlot).where(
        PTMSlot.school_id == current_user.school_id,
        PTMSlot.status == "open"
    ).limit(10)
    res_ptm = await db.execute(stmt_ptm)
    ptm_slots = res_ptm.scalars().all()

    return {
        "user_id": str(current_user.id),
        "recent_bus_events": [
            {
                "id": str(log.id),
                "event_type": log.event_type,
                "current_location": log.current_location,
                "notes": log.notes,
                "created_at": str(log.created_at)
            } for log in logs
        ],
        "available_ptm_slots": [
            {
                "id": str(slot.id),
                "teacher_id": str(slot.teacher_id),
                "slot_date": str(slot.slot_date),
                "start_time": str(slot.start_time),
                "end_time": str(slot.end_time),
            } for slot in ptm_slots
        ]
    }

@router.post("/ptm/book")
async def book_ptm_slot(payload: PTMBookingCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no school assigned")
    
    stmt = select(PTMSlot).where(PTMSlot.id == payload.slot_id, PTMSlot.school_id == current_user.school_id)
    res = await db.execute(stmt)
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="PTM Slot not found")
    if slot.status != "open":
        raise HTTPException(status_code=400, detail="PTM Slot is no longer open")

    booking = PTMBooking(
        school_id=current_user.school_id,
        slot_id=payload.slot_id,
        parent_id=current_user.id,
        student_id=payload.student_id,
        notes=payload.notes,
        status="confirmed"
    )
    slot.status = "booked"
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    return {"message": "PTM Slot successfully booked", "booking_id": str(booking.id)}
