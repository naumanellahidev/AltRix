"""
SQLAlchemy ORM models for Alumni Network & Placement Portal.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AlumniProfile(Base):
    __tablename__ = "alumni_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    graduation_year: Mapped[int] = mapped_column(Integer, nullable=False)
    higher_education_uni: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    current_company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    designation: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AlumniEvent(Base):
    __tablename__ = "alumni_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)

    event_title: Mapped[str] = mapped_column(String(200), nullable=False)
    event_date: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rsvp_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AlumniDonation(Base):
    __tablename__ = "alumni_donations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    alumni_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("alumni_profiles.id"), nullable=False)

    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    purpose: Mapped[str] = mapped_column(String(150), default="Scholarship Fund", nullable=False)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
