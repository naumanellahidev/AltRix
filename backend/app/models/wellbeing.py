import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import DateTime, Date, ForeignKey, String, Text, Integer, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class StudentMedicalRecord(Base):
    __tablename__ = "student_medical_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    allergies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # e.g., "Peanuts, Dust"
    conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # e.g., "Asthma"
    medications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # e.g., "Inhaler as needed"
    health_insurance_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
    student = orm_relationship("Student")


class InfirmaryVisitLog(Base):
    __tablename__ = "infirmary_visit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    visit_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    reason: Mapped[str] = mapped_column(String, nullable=False)  # e.g., "Fever", "Headache"
    treatment_given: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # e.g., "Panadol, rest"
    doctor_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="treated")  # treated, referred_to_hospital
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
    student = orm_relationship("Student")


class VaccinationRecord(Base):
    __tablename__ = "vaccination_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    vaccine_name: Mapped[str] = mapped_column(String, nullable=False)  # e.g., "BCG", "Polio"
    dose_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    administered_date: Mapped[date] = mapped_column(Date, nullable=False)
    next_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
    student = orm_relationship("Student")


class FirstAidIncident(Base):
    __tablename__ = "first_aid_incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    incident_description: Mapped[str] = mapped_column(Text, nullable=False)  # e.g. "Fell in playground during physical exercise"
    first_aid_given: Mapped[str] = mapped_column(Text, nullable=False)  # e.g. "Ice pack, cleaned wound with antiseptic"
    reporter_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # staff ID who reported
    incident_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
    student = orm_relationship("Student")


class WellbeingSurvey(Base):
    __tablename__ = "wellbeing_surveys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    mood_score: Mapped[int] = mapped_column(Integer, nullable=False, default=5)  # 1-10 slider
    stress_level: Mapped[int] = mapped_column(Integer, nullable=False, default=5)  # 1-10 slider
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
    student = orm_relationship("Student")


class MedicalDirectory(Base):
    __tablename__ = "medical_directory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    
    contact_name: Mapped[str] = mapped_column(String, nullable=False)  # e.g., "Dr. Asim Jamil"
    specialty: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g., "Pediatrician"
    phone: Mapped[str] = mapped_column(String, nullable=False)
    hospital_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g., "General Hospital"
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
