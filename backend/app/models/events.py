"""
Event, gallery, and PTM (Parent-Teacher Meeting) models.
"""
import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class SchoolEvent(Base):
    __tablename__ = "school_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False, default="general")
    # Types: sports_day, annual_function, ptm, assembly, trip, competition, cultural, general
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "09:00"
    end_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cover_image_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="upcoming")  # upcoming, ongoing, completed, cancelled
    audience: Mapped[str] = mapped_column(String, nullable=False, default="all")  # all, parents, students, staff
    rsvp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rsvp_count: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    max_attendees: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    photos = orm_relationship("EventPhoto", back_populates="event", cascade="all, delete-orphan")


class EventPhoto(Base):
    __tablename__ = "event_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("school_events.id", ondelete="CASCADE"), nullable=False)
    photo_url: Mapped[str] = mapped_column(String, nullable=False)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    caption: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    event = orm_relationship("SchoolEvent", back_populates="photos")


class PTMSlot(Base):
    __tablename__ = "ptm_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    teacher_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[str] = mapped_column(String, nullable=False)  # "09:00"
    end_time: Mapped[str] = mapped_column(String, nullable=False)  # "09:15"
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    slot_type: Mapped[str] = mapped_column(String, nullable=False, default="manual")  # manual, auto_generated
    max_bookings: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_bookings: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="available")  # available, fully_booked, cancelled
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    bookings = orm_relationship("PTMBooking", back_populates="slot", cascade="all, delete-orphan")


class PTMBooking(Base):
    __tablename__ = "ptm_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    slot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ptm_slots.id", ondelete="CASCADE"), nullable=False)
    parent_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="confirmed")  # confirmed, cancelled, completed, no_show
    parent_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    teacher_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meeting_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    slot = orm_relationship("PTMSlot", back_populates="bookings")


class EventRSVP(Base):
    __tablename__ = "event_rsvps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("school_events.id", ondelete="CASCADE"), nullable=False)
    parent_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    
    status: Mapped[str] = mapped_column(String, nullable=False, default="going")  # going, maybe, not_going
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    event = orm_relationship("SchoolEvent")
    student = orm_relationship("Student")


class SportsScorecard(Base):
    __tablename__ = "sports_scorecards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("school_events.id", ondelete="CASCADE"), nullable=False)
    
    title: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "100m Sprint"
    house_name: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "Red House"
    points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1, 2, 3, etc.
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # student details, score values
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    event = orm_relationship("SchoolEvent")


class AnnualFunctionPlan(Base):
    __tablename__ = "annual_function_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("school_events.id", ondelete="CASCADE"), nullable=False)
    
    task_name: Mapped[str] = mapped_column(String, nullable=False)
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # staff user id
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending, in_progress, completed
    priority: Mapped[str] = mapped_column(String, nullable=False, default="medium")  # low, medium, high
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    event = orm_relationship("SchoolEvent")

