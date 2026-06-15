import uuid
from sqlalchemy import Column, DateTime, String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from app.database import Base

class SchoolInquirySettings(Base):
    __tablename__ = "school_inquiry_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)
    form_title = Column(String, nullable=False, default="Admissions & Inquiry Form")
    show_logo = Column(Boolean, nullable=False, default=True)
    success_message = Column(String, nullable=False, default="Thank you for inquiring! Our admissions counselor will get in touch with you shortly.")
    accent_color = Column(String, nullable=False, default="#f59e0b")
    fields_config = Column(JSONB, nullable=False, default={"parentName": True, "email": True, "phone": True, "studentName": True, "studentGrade": True, "priorSchool": True, "message": True})
    required_config = Column(JSONB, nullable=False, default={"email": True, "phone": True, "studentName": True, "studentGrade": False})
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
