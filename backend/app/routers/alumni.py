"""
Router for Alumni Network, Career Placement & Contributions Portal.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.alumni import AlumniProfile, AlumniEvent, AlumniDonation

router = APIRouter(prefix="/alumni", tags=["Alumni Network"])


class AlumniRegisterSchema(BaseModel):
    full_name: str
    graduation_year: int
    higher_education_uni: Optional[str] = None
    current_company: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None


class AlumniProfileResponseSchema(BaseModel):
    id: UUID
    school_id: UUID
    full_name: str
    graduation_year: int
    higher_education_uni: Optional[str] = None
    current_company: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AlumniEventCreateSchema(BaseModel):
    event_title: str
    event_date: str
    location: Optional[str] = "Main Auditorium"
    description: Optional[str] = None


class AlumniEventResponseSchema(BaseModel):
    id: UUID
    school_id: UUID
    event_title: str
    event_date: str
    location: Optional[str] = None
    description: Optional[str] = None
    rsvp_count: int

    model_config = ConfigDict(from_attributes=True)


class AlumniDonationCreateSchema(BaseModel):
    alumni_id: UUID
    amount: float
    purpose: Optional[str] = "Scholarship Fund"


@router.get("/directory", response_model=List[AlumniProfileResponseSchema])
async def list_alumni_directory(
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(AlumniProfile).where(AlumniProfile.school_id == school_id).order_by(AlumniProfile.graduation_year.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/register", response_model=AlumniProfileResponseSchema)
async def register_alumni(
    payload: AlumniRegisterSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    profile = AlumniProfile(
        school_id=school_id,
        full_name=payload.full_name,
        graduation_year=payload.graduation_year,
        higher_education_uni=payload.higher_education_uni,
        current_company=payload.current_company,
        designation=payload.designation,
        email=payload.email,
        phone=payload.phone,
        linkedin_url=payload.linkedin_url,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/events", response_model=List[AlumniEventResponseSchema])
async def list_alumni_events(
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(AlumniEvent).where(AlumniEvent.school_id == school_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/events", response_model=AlumniEventResponseSchema)
async def create_alumni_event(
    payload: AlumniEventCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    event = AlumniEvent(
        school_id=school_id,
        event_title=payload.event_title,
        event_date=payload.event_date,
        location=payload.location,
        description=payload.description,
        rsvp_count=0,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/donations")
async def record_alumni_donation(
    payload: AlumniDonationCreateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    school_id = current_user.school_id or UUID("00000000-0000-0000-0000-000000000000")
    donation = AlumniDonation(
        school_id=school_id,
        alumni_id=payload.alumni_id,
        amount=payload.amount,
        purpose=payload.purpose or "Scholarship Fund",
    )
    db.add(donation)
    await db.commit()
    return {"message": "Alumni contribution logged successfully", "donation_id": str(donation.id)}
