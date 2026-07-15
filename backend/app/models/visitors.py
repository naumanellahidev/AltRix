"""
Visitor Management models: passes, pre-registration, blacklist rules.
"""
import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class VisitorPass(Base):
    __tablename__ = "visitor_passes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    parent_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # link to pre-registering parent
    student_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True)  # link to student for pickup auth
    
    visitor_name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cnic: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # CNIC / Identification card number
    
    photo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # captured at gate
    purpose: Mapped[str] = mapped_column(String, nullable=False, default="meeting")  # meeting, pickup, delivery, other
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # host details, comments
    
    qr_code_token: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    pass_type: Mapped[str] = mapped_column(String, nullable=False, default="pre_registered")  # pre_registered, gate_checkin
    checkin_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending, checked_in, checked_out, expired
    
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    checkin_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    checkout_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    student = orm_relationship("Student")


class VisitorBlacklist(Base):
    __tablename__ = "visitor_blacklist"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    
    name: Mapped[str] = mapped_column(String, nullable=False)
    cnic: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
