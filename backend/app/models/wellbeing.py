"""
SQLAlchemy ORM models for Student Health, Infirmary & Wellbeing Center.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class StudentMedicalRecord(Base):
    __tablename__ = "student_medical_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    blood_group: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    allergies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chronic_conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    doctor_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class InfirmaryVisitLog(Base):
    __tablename__ = "infirmary_visit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    visit_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    symptoms: Mapped[str] = mapped_column(Text, nullable=False)
    treatment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medication_given: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nurse_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="in_clinic", nullable=False)  # in_clinic, discharged, referred_home

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class VaccinationRecord(Base):
    __tablename__ = "vaccination_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    vaccine_name: Mapped[str] = mapped_column(String(150), nullable=False)
    dose_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    administered_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="completed", nullable=False)  # completed, pending

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class FirstAidIncident(Base):
    __tablename__ = "first_aid_incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    incident_type: Mapped[str] = mapped_column(String(150), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    action_taken: Mapped[Text] = mapped_column(Text, nullable=False)
    parent_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
