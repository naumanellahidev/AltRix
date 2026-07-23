"""
SQLAlchemy ORM models for Hostel & Boarding Facility Management.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class HostelBuilding(Base):
    __tablename__ = "hostel_buildings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    total_floors: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    warden_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    warden_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class HostelRoom(Base):
    __tablename__ = "hostel_rooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    building_name: Mapped[str] = mapped_column(String(150), default="Main Hostel Block", nullable=False)

    room_number: Mapped[str] = mapped_column(String(50), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    occupied_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    room_type: Mapped[str] = mapped_column(String(50), default="Standard Non-AC", nullable=False)  # Deluxe AC, Standard Non-AC
    fee_per_term: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class HostelAllocation(Base):
    __tablename__ = "hostel_allocations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("hostel_rooms.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    check_in_date: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class HostelAttendance(Base):
    __tablename__ = "hostel_attendance"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    attendance_date: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="present", nullable=False)  # present, absent, leave, late
    warden_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class HostelMessMenu(Base):
    __tablename__ = "hostel_mess_menu"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)

    day_of_week: Mapped[str] = mapped_column(String(50), nullable=False)  # Monday, Tuesday...
    breakfast: Mapped[str] = mapped_column(String(255), nullable=False)
    lunch: Mapped[str] = mapped_column(String(255), nullable=False)
    dinner: Mapped[str] = mapped_column(String(255), nullable=False)
    special_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
