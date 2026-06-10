"""
Admissions models.
"""
import uuid
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func

from app.database import Base


class AdmissionApplication(Base):
    __tablename__ = "admission_applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    previous_school = Column(String, nullable=True)
    applying_for_class_id = Column(UUID(as_uuid=True), nullable=True)
    applying_for_section_id = Column(UUID(as_uuid=True), nullable=True)
    desired_subjects = Column(ARRAY(String), nullable=True)
    parent_name = Column(String, nullable=True)
    parent_phone = Column(String, nullable=True)
    parent_email = Column(String, nullable=True)
    parent_address = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending, reviewing, approved, rejected, converted
    registration_number = Column(String, nullable=True)
    roll_number = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    decision_notes = Column(Text, nullable=True)
    submitted_by_user_id = Column(UUID(as_uuid=True), nullable=True)
    reviewed_by_user_id = Column(UUID(as_uuid=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    converted_student_id = Column(UUID(as_uuid=True), nullable=True)
    converted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=False)


class AdmissionApplicationDocument(Base):
    __tablename__ = "admission_application_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    application_id = Column(UUID(as_uuid=True), ForeignKey("admission_applications.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    uploaded_by_user_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
