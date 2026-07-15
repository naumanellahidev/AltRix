import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import DateTime, Date, ForeignKey, String, Text, Float, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class StaffKpi(Base):
    __tablename__ = "staff_kpi_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    staff_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # references profile/user_id
    
    punctuality_score: Mapped[float] = mapped_column(Float, default=0.0)
    results_score: Mapped[float] = mapped_column(Float, default=0.0)
    parent_feedback_score: Mapped[float] = mapped_column(Float, default=0.0)
    co_curricular_score: Mapped[float] = mapped_column(Float, default=0.0)
    average_score: Mapped[float] = mapped_column(Float, default=0.0)
    
    evaluation_period: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "Annual 2026"
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")


class StaffAppraisal(Base):
    __tablename__ = "staff_appraisals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    staff_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    
    self_appraisal_text: Mapped[str] = mapped_column(Text, nullable=False)
    
    reviewer_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    review_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending_review")  # pending_review, approved, rejected
    salary_increment_pct: Mapped[float] = mapped_column(Float, default=0.0)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")


class Feedback360(Base):
    __tablename__ = "teacher_feedback_360"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    staff_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    student_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True)
    
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=5)  # 1-5 stars
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
    student = orm_relationship("Student")


class PerformanceImprovementPlan(Base):
    __tablename__ = "performance_improvement_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    staff_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    
    issues_identified: Mapped[str] = mapped_column(Text, nullable=False)
    action_steps: Mapped[str] = mapped_column(Text, nullable=False)
    deadline_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")  # active, completed, failed
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = orm_relationship("School")
