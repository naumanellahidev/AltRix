"""
Curriculum models: learning outcomes, assessment criteria, strand assessments,
grade boundaries, and curriculum presets (Punjab Board, Cambridge, IB).
"""
import uuid
from typing import Optional
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class CurriculumPreset(Base):
    """Pre-defined curriculum framework presets (Punjab Board, Cambridge, IB, Custom)."""
    __tablename__ = "curriculum_presets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=True)  # NULL = global preset
    name: Mapped[str] = mapped_column(String, nullable=False)  # "Punjab Board (SNC)", "Cambridge IGCSE", "IB MYP", "Custom"
    code: Mapped[str] = mapped_column(String, nullable=False)  # "punjab_snc", "cambridge", "ib_myp", "custom"
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # True = available to all schools
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Grade structure (JSON)
    grade_structure = Column(JSON, nullable=True, default=lambda: {
        "grading_type": "percentage",  # percentage | letter | criterion
        "pass_percentage": 33,
        "grade_boundaries": []
    })

    # Subject areas / strands structure (JSON)
    strand_definitions = Column(JSON, nullable=True)  # [{subject, strands: [{name, sub_strands: []}]}]

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class LearningOutcome(Base):
    """Curriculum learning outcomes mapped to subjects and strands."""
    __tablename__ = "learning_outcomes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    preset_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("curriculum_presets.id"), nullable=True)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)

    code: Mapped[str] = mapped_column(String, nullable=False)  # "ENG-5-R-01", "MATH-3-NS-05"
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strand: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Reading", "Number Sense", "Geometry"
    sub_strand: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Comprehension", "Fractions"
    grade_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Class/grade level (1-12)
    bloom_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "remember", "understand", "apply", "analyze", "evaluate", "create"

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class AssessmentLOMapping(Base):
    """Maps assessments to learning outcomes they cover."""
    __tablename__ = "assessment_lo_mappings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    assessment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("academic_assessments.id"), nullable=False)
    learning_outcome_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_outcomes.id"), nullable=False)
    weightage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # How much of this assessment covers this LO
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AssessmentCriteria(Base):
    """Criterion-referenced rubric for an assessment linked to learning outcomes."""
    __tablename__ = "assessment_criteria"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    assessment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("academic_assessments.id"), nullable=True)
    learning_outcome_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_outcomes.id"), nullable=True)

    criteria_name: Mapped[str] = mapped_column(String, nullable=False)  # "Reading Comprehension", "Problem Solving"
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=4)

    # Rubric levels (JSON array)
    rubric_levels = Column(JSON, nullable=True, default=lambda: [
        {"level": 4, "label": "Exceeding", "description": "Exceeds expected standards consistently"},
        {"level": 3, "label": "Meeting", "description": "Meets expected standards"},
        {"level": 2, "label": "Approaching", "description": "Approaching expected standards"},
        {"level": 1, "label": "Beginning", "description": "Below expected standards"},
    ])

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class CriteriaScore(Base):
    """Student score for a specific criterion within an assessment."""
    __tablename__ = "criteria_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    criteria_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assessment_criteria.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    level_achieved: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Exceeding", "Meeting", etc.
    teacher_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scored_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class StrandAssessment(Base):
    """Strand-level aggregated scores for a student in a subject."""
    __tablename__ = "strand_assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)

    strand_name: Mapped[str] = mapped_column(String, nullable=False)  # "Reading", "Writing", "Number Sense"
    sub_strand_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    academic_year: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    term_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    level: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Exceeding", "Meeting", "Approaching", "Beginning"
    grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    assessed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class GradeBoundary(Base):
    """School/subject-specific grade boundaries overriding default grade scales."""
    __tablename__ = "grade_boundaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)  # NULL = school-wide
    preset_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("curriculum_presets.id"), nullable=True)

    label: Mapped[str] = mapped_column(String, nullable=False)  # A*, A, B, C, D, E, U (Cambridge) or A+, A, B+... (Punjab)
    min_percentage: Mapped[float] = mapped_column(Float, nullable=False)
    max_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=100)
    gpa_equivalent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_passing: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
