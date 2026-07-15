"""
Report card models: templates, generated report cards, subject entries, co-curricular grades, grade scales.
"""
import uuid
from typing import Optional
from datetime import datetime, date

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class ReportCardTemplate(Base):
    """School-customizable report card template with layout, grading, and branding config."""
    __tablename__ = "report_card_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Layout configuration (JSON)
    layout_config = Column(JSON, nullable=True, default=lambda: {
        "orientation": "portrait",  # portrait | landscape
        "paper_size": "A4",
        "show_school_logo": True,
        "show_student_photo": True,
        "show_watermark": False,
        "header_style": "classic",  # classic | modern | minimal
        "color_scheme": "default",  # default | custom
        "custom_primary_color": None,
        "custom_accent_color": None,
    })

    # Grading configuration
    grading_system: Mapped[str] = mapped_column(String, nullable=False, default="percentage")  # percentage | gpa | letter | custom
    show_position: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_class_average: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_highest_marks: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_attendance: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_co_curricular: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_teacher_remarks: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_principal_remarks: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_trend_graph: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Signature & Verification
    show_digital_signature: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    principal_signature_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    principal_signature_title: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="Principal")
    enable_qr_verification: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Language
    language: Mapped[str] = mapped_column(String, nullable=False, default="en")

    # Co-curricular categories (JSON array)
    co_curricular_categories = Column(JSON, nullable=True, default=lambda: [
        "Sports", "Arts", "Music", "Drama", "Debate", "Community Service", "Leadership"
    ])

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class ReportCard(Base):
    """Generated report card for a student, linked to a template."""
    __tablename__ = "report_cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("report_card_templates.id"), nullable=True)
    exam_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=True)

    # Period info
    period_type: Mapped[str] = mapped_column(String, nullable=False, default="term")  # term | monthly | annual
    period_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Term 1", "January 2026", "Annual 2025-2026"
    academic_year: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "2025-2026"

    # Aggregate scores
    total_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_total_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overall_grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Position/Ranking
    position_in_class: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_students_in_class: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Attendance
    attendance_percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_present_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_school_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Remarks
    teacher_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    principal_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Publishing & Verification
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    qr_verification_token: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)

    # Digital signature metadata
    signed_by_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    signed_by_title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Trend data (JSON: [{term, percentage, gpa}])
    trend_data = Column(JSON, nullable=True)

    generated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class ReportCardSubjectEntry(Base):
    """Subject-level marks within a report card."""
    __tablename__ = "report_card_subject_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("report_cards.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    subject_name: Mapped[str] = mapped_column(String, nullable=False)

    marks_obtained: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gpa_points: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Position & Class stats
    position_in_subject: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    class_average: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    highest_in_class: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    teacher_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class CoCurricularGrade(Base):
    """Co-curricular/extracurricular grades for a report card."""
    __tablename__ = "co_curricular_grades"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("report_cards.id", ondelete="CASCADE"), nullable=False)
    activity_name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Sports, Arts, Music, etc.
    grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # A, B, C, D, E
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class GradeScale(Base):
    """Custom grade boundaries for a school's grading system."""
    __tablename__ = "grade_scales"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)  # A+, A, B+, B, etc.
    min_percentage: Mapped[float] = mapped_column(Float, nullable=False)
    max_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=100)
    gpa_points: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 4.0, 3.7, etc.
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Outstanding", "Excellent"
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Hex color for UI
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
