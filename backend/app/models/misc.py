"""
Remaining models: notifications, diary, complaints, assignments, behavior,
HR, audit logs, AI tables.
"""
import uuid
from datetime import date, datetime
from typing import Any, Optional, List

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


# ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

class AppNotification(Base):
    __tablename__ = "app_notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="info")
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="general")
    action_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_pushed: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    pushed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    priority: Mapped[Optional[str]] = mapped_column(String, default="normal", nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    metadata_json = Column("metadata", JSON, default=dict, nullable=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_favorite: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    is_pinned: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── DIARY ────────────────────────────────────────────────────────────────────

class DiaryEntry(Base):
    __tablename__ = "diary_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_section_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=True)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    teacher_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    entry_date: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="homework")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def homework(self) -> Optional[str]: return self.content
    @homework.setter
    def homework(self, val: Optional[str]) -> None: self.content = val

    @property
    def created_by(self) -> Optional[uuid.UUID]: return self.teacher_user_id
    @created_by.setter
    def created_by(self, val: Optional[uuid.UUID]) -> None: self.teacher_user_id = val

    @property
    def campus_id(self) -> Optional[uuid.UUID]: return None
    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]) -> None: pass


# ─── COMPLAINTS ───────────────────────────────────────────────────────────────

class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    sender_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    student_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    flow: Mapped[str] = mapped_column(String, nullable=False, default="parent_to_school")
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")  # open, in_progress, resolved, closed
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=False)


class ComplaintFeedback(Base):
    __tablename__ = "complaint_feedbacks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    complaint_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=False)
    author_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    author_role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=False)


# ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────

class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    teacher_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    max_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="active")
    attachment_urls = Column(ARRAY(String), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    assignment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assignments.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachment_urls = Column(ARRAY(String), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="submitted")
    marks_obtained: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    marks_before_penalty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    penalty_applied: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    graded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    graded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── BEHAVIOR ─────────────────────────────────────────────────────────────────

class BehaviorNote(Base):
    __tablename__ = "behavior_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    teacher_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note_type: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="general")  # positive, negative, general
    is_shared_with_parents: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── HR ───────────────────────────────────────────────────────────────────────

class HrLeaveRequest(Base):
    __tablename__ = "hr_leave_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    leave_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("hr_leave_types.id"), nullable=True)
    start_date: Mapped[str] = mapped_column(String, nullable=False)
    end_date: Mapped[str] = mapped_column(String, nullable=False)
    days_count: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending, approved, rejected
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def leave_type(self) -> str:
        return str(self.leave_type_id) if self.leave_type_id else "annual"

    @leave_type.setter
    def leave_type(self, val: str) -> None:
        if val:
            try:
                self.leave_type_id = uuid.UUID(val)
            except ValueError:
                pass

    @property
    def campus_id(self) -> Optional[uuid.UUID]: return None
    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]) -> None: pass

    @property
    def reviewed_at(self) -> Optional[datetime]: return self.created_at
    @reviewed_at.setter
    def reviewed_at(self, val: Optional[datetime]) -> None: pass

    @property
    def notes(self) -> Optional[str]: return None
    @notes.setter
    def notes(self, val: Optional[str]) -> None: pass

    @property
    def updated_at(self) -> Optional[datetime]: return self.created_at
    @updated_at.setter
    def updated_at(self, val: Optional[datetime]) -> None: pass


class HrPayroll(Base):
    __tablename__ = "hr_salary_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    base_salary: Mapped[float] = mapped_column(Float, nullable=False)
    allowances: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0)
    deductions: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0)
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean, default=True, nullable=True)
    effective_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="PKR")
    pay_frequency: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="monthly")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="pending")  # pending, approved, paid
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def basic_salary(self) -> Optional[float]: return self.base_salary
    @basic_salary.setter
    def basic_salary(self, val: Optional[float]) -> None: self.base_salary = val or 0.0

    @property
    def payment_status(self) -> Optional[str]: return self.status
    @payment_status.setter
    def payment_status(self, val: Optional[str]) -> None: self.status = val or "pending"

    @property
    def net_salary(self) -> Optional[float]:
        base = self.base_salary or 0.0
        allow = self.allowances or 0.0
        ded = self.deductions or 0.0
        return base + allow - ded
    @net_salary.setter
    def net_salary(self, val: Optional[float]) -> None: pass

    @property
    def payment_date(self) -> Optional[str]: return None
    @payment_date.setter
    def payment_date(self, val: Optional[str]) -> None: pass

    @property
    def generated_by(self) -> Optional[uuid.UUID]: return None
    @generated_by.setter
    def generated_by(self, val: Optional[uuid.UUID]) -> None: pass

    @property
    def campus_id(self) -> Optional[uuid.UUID]: return None
    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]) -> None: pass


# ─── AUDIT ────────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)  # create, update, delete, login, logout
    resource_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── AI TABLES ────────────────────────────────────────────────────────────────

class AiAcademicPrediction(Base):
    __tablename__ = "ai_academic_predictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    predicted_grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    promotion_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    failure_risk: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    factors = Column(JSON, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AiStudentProfile(Base):
    __tablename__ = "ai_student_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    learning_style: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    personality_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    risk_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    strengths = Column(ARRAY(String), nullable=True)
    weaknesses = Column(ARRAY(String), nullable=True)
    needs_counseling: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    needs_extra_support: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    analysis_data = Column(JSON, nullable=True)
    last_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiEarlyWarning(Base):
    __tablename__ = "ai_early_warnings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    warning_type: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # low, medium, high
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="active")
    detected_patterns = Column(ARRAY(String), nullable=True)
    recommended_actions = Column(ARRAY(String), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AiTeacherPerformance(Base):
    __tablename__ = "ai_teacher_performance"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    teacher_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    overall_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    attendance_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    results_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    engagement_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    needs_training: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analysis_data = Column(JSON, nullable=True)
    last_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiCounselingQueue(Base):
    __tablename__ = "ai_counseling_queue"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reason_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reason_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="normal")
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="pending")
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    scheduled_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    session_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    outcome: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    detected_indicators = Column(ARRAY(String), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiSchoolReputation(Base):
    __tablename__ = "ai_school_reputation"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)
    overall_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    academic_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    community_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reputation_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    parent_satisfaction: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    parent_satisfaction_index: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nps_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    strengths = Column(ARRAY(String), nullable=True)
    improvements = Column(ARRAY(String), nullable=True)
    analysis_data = Column(JSON, nullable=True)
    last_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiCareerSuggestion(Base):
    __tablename__ = "ai_career_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    suggested_careers = Column(JSON, nullable=True)
    strengths = Column(ARRAY(String), nullable=True)
    interests = Column(ARRAY(String), nullable=True)
    recommended_subjects = Column(ARRAY(String), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    analysis_data = Column(JSON, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiParentUpdate(Base):
    __tablename__ = "ai_parent_updates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    parent_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    update_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    update_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attendance_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    behavior_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    focus_trend: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    participation_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    performance_change_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    teacher_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_insights = Column(ARRAY(String), nullable=True)
    recommendations = Column(ARRAY(String), nullable=True)
    is_sent: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── AI SEMANTIC CACHE ────────────────────────────────────────────────────────

class AiSemanticCache(Base):
    """
    Stores AI Copilot responses indexed by semantic query representation.
    Enables reuse of AI answers for semantically similar questions without
    calling the AI model again. Scoped strictly by school_id and role_key.
    """
    __tablename__ = "ai_semantic_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    cache_type: Mapped[str] = mapped_column(String(30), nullable=False, default="live_erp")
    # Query storage
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    query_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    query_embedding = Column(JSON, nullable=True)          # float[] as JSON for cosine similarity
    # Security / tenant scoping
    role_key: Mapped[str] = mapped_column(String(200), nullable=False)  # sorted joined role string
    module_context: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)   # active UI module
    screen_context: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)   # active UI screen/route
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Response
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Freshness / invalidation
    data_deps = Column(ARRAY(String), nullable=True)  # e.g. ['attendance','finance']
    hit_count: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    is_valid: Mapped[Optional[bool]] = mapped_column(Boolean, default=True, nullable=True)  # soft-delete flag


class AiCacheStats(Base):
    """
    Daily statistics for AI semantic cache performance monitoring.
    Tracks hits, misses, and AI calls saved (Ollama compute-time savings).
    One row per school per day — upserted on each cache access.
    """
    __tablename__ = "ai_cache_stats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    stat_date: Mapped[date] = mapped_column(Date, nullable=False)
    cache_hits: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    cache_misses: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    ai_calls_saved: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    top_queries = Column(JSON, nullable=True, default=list)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class EventStore(Base):
    __tablename__ = "event_store"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    school_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload = Column(JSON, nullable=False, default=dict)
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)  # mapped to avoid SQLAlchemy metadata conflict
    correlation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, default=uuid.uuid4)
    request_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String, default="system", nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="published")
    retry_count: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String, default="1.0.0", nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EventSubscriberLog(Base):
    __tablename__ = "event_subscribers_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("event_store.id", ondelete="CASCADE"), nullable=False)
    subscriber_name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    retry_count: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ActivityTimeline(Base):
    __tablename__ = "activity_timeline"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    event_name: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
