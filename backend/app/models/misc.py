"""
Remaining models: notifications, diary, complaints, assignments, behavior,
HR, audit logs, AI tables.
"""
import uuid
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func

from app.database import Base


# ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

class AppNotification(Base):
    __tablename__ = "app_notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    type = Column(String, nullable=True, default="info")
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    entity_type = Column(String, nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── DIARY ────────────────────────────────────────────────────────────────────

class DiaryEntry(Base):
    __tablename__ = "diary_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    teacher_user_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    entry_date = Column(String, nullable=False)
    homework = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


# ─── COMPLAINTS ───────────────────────────────────────────────────────────────

class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    sender_user_id = Column(UUID(as_uuid=True), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True)
    subject = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String, nullable=True)
    flow = Column(String, nullable=False, default="parent_to_school")
    status = Column(String, nullable=False, default="open")  # open, in_progress, resolved, closed
    resolution_note = Column(Text, nullable=True)
    resolved_by = Column(UUID(as_uuid=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=False)


class ComplaintFeedback(Base):
    __tablename__ = "complaint_feedbacks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    complaint_id = Column(UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=False)
    author_user_id = Column(UUID(as_uuid=True), nullable=False)
    author_role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=False)


# ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    teacher_user_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(String, nullable=True)
    max_marks = Column(Float, nullable=True)
    status = Column(String, nullable=True, default="active")
    attachment_urls = Column(ARRAY(String), nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("assignments.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    content = Column(Text, nullable=True)
    attachment_urls = Column(ARRAY(String), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=True, default="submitted")
    marks_obtained = Column(Float, nullable=True)
    marks = Column(Float, nullable=True)
    marks_before_penalty = Column(Float, nullable=True)
    penalty_applied = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    graded_by = Column(UUID(as_uuid=True), nullable=True)
    graded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── BEHAVIOR ─────────────────────────────────────────────────────────────────

class BehaviorNote(Base):
    __tablename__ = "behavior_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    teacher_user_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    note_type = Column(String, nullable=True, default="general")  # positive, negative, general
    is_shared_with_parents = Column(Boolean, default=False, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── HR ───────────────────────────────────────────────────────────────────────

class HrLeaveRequest(Base):
    __tablename__ = "hr_leave_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    leave_type = Column(String, nullable=False)  # annual, sick, casual, unpaid
    start_date = Column(String, nullable=False)
    end_date = Column(String, nullable=False)
    days_count = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending, approved, rejected
    reviewed_by = Column(UUID(as_uuid=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class HrPayroll(Base):
    __tablename__ = "hr_payroll"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    month = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    basic_salary = Column(Float, nullable=True)
    allowances = Column(Float, nullable=True, default=0)
    deductions = Column(Float, nullable=True, default=0)
    net_salary = Column(Float, nullable=True)
    payment_status = Column(String, nullable=True, default="pending")  # pending, paid
    payment_date = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    generated_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


# ─── AUDIT ────────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=True)
    action = Column(String, nullable=False)  # create, update, delete, login, logout
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


# ─── AI TABLES ────────────────────────────────────────────────────────────────

class AiAcademicPrediction(Base):
    __tablename__ = "ai_academic_predictions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    predicted_grade = Column(String, nullable=True)
    promotion_probability = Column(Float, nullable=True)
    failure_risk = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    factors = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AiStudentProfile(Base):
    __tablename__ = "ai_student_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    learning_style = Column(String, nullable=True)
    personality_type = Column(String, nullable=True)
    risk_level = Column(String, nullable=True)
    risk_score = Column(Float, nullable=True)
    strengths = Column(ARRAY(String), nullable=True)
    weaknesses = Column(ARRAY(String), nullable=True)
    needs_counseling = Column(Boolean, nullable=True)
    needs_extra_support = Column(Boolean, nullable=True)
    analysis_data = Column(JSON, nullable=True)
    last_analyzed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiEarlyWarning(Base):
    __tablename__ = "ai_early_warnings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    warning_type = Column(String, nullable=False)
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    severity = Column(String, nullable=True)  # low, medium, high
    status = Column(String, nullable=True, default="active")
    detected_patterns = Column(ARRAY(String), nullable=True)
    recommended_actions = Column(ARRAY(String), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AiTeacherPerformance(Base):
    __tablename__ = "ai_teacher_performance"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    teacher_user_id = Column(UUID(as_uuid=True), nullable=False)
    overall_score = Column(Float, nullable=True)
    attendance_score = Column(Float, nullable=True)
    results_score = Column(Float, nullable=True)
    engagement_score = Column(Float, nullable=True)
    needs_training = Column(Boolean, nullable=True)
    feedback = Column(Text, nullable=True)
    analysis_data = Column(JSON, nullable=True)
    last_analyzed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiCounselingQueue(Base):
    __tablename__ = "ai_counseling_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    reason = Column(String, nullable=True)
    reason_type = Column(String, nullable=True)
    reason_details = Column(Text, nullable=True)
    priority = Column(String, nullable=True, default="normal")
    status = Column(String, nullable=True, default="pending")
    assigned_to = Column(UUID(as_uuid=True), nullable=True)
    scheduled_date = Column(String, nullable=True)
    session_notes = Column(Text, nullable=True)
    outcome = Column(String, nullable=True)
    detected_indicators = Column(ARRAY(String), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiSchoolReputation(Base):
    __tablename__ = "ai_school_reputation"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)
    overall_score = Column(Float, nullable=True)
    academic_score = Column(Float, nullable=True)
    community_score = Column(Float, nullable=True)
    reputation_score = Column(Float, nullable=True)
    parent_satisfaction = Column(Float, nullable=True)
    parent_satisfaction_index = Column(Float, nullable=True)
    nps_score = Column(Float, nullable=True)
    strengths = Column(ARRAY(String), nullable=True)
    improvements = Column(ARRAY(String), nullable=True)
    analysis_data = Column(JSON, nullable=True)
    last_analyzed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiCareerSuggestion(Base):
    __tablename__ = "ai_career_suggestions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    suggested_careers = Column(JSON, nullable=True)
    strengths = Column(ARRAY(String), nullable=True)
    interests = Column(ARRAY(String), nullable=True)
    recommended_subjects = Column(ARRAY(String), nullable=True)
    confidence = Column(Float, nullable=True)
    analysis_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AiParentUpdate(Base):
    __tablename__ = "ai_parent_updates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), nullable=True)
    parent_user_id = Column(UUID(as_uuid=True), nullable=True)
    update_type = Column(String, nullable=True)
    update_date = Column(String, nullable=True)
    content = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    attendance_status = Column(String, nullable=True)
    behavior_remarks = Column(Text, nullable=True)
    focus_trend = Column(String, nullable=True)
    participation_level = Column(String, nullable=True)
    performance_change_percent = Column(Float, nullable=True)
    teacher_notes = Column(Text, nullable=True)
    key_insights = Column(ARRAY(String), nullable=True)
    recommendations = Column(ARRAY(String), nullable=True)
    is_sent = Column(Boolean, default=False, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
