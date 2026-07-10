import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base

class SchoolInquirySettings(Base):
    __tablename__ = "school_inquiry_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)
    form_title: Mapped[str] = mapped_column(String, nullable=False, default="Admissions & Inquiry Form")
    show_logo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    success_message: Mapped[str] = mapped_column(String, nullable=False, default="Thank you for inquiring! Our admissions counselor will get in touch with you shortly.")
    accent_color: Mapped[str] = mapped_column(String, nullable=False, default="#f59e0b")
    fields_config = Column(JSONB, nullable=False, default={"parentName": True, "email": True, "phone": True, "studentName": True, "studentGrade": True, "priorSchool": True, "message": True})
    required_config = Column(JSONB, nullable=False, default={"email": True, "phone": True, "studentName": True, "studentGrade": False})
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
