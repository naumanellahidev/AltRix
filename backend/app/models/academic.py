"""
Academic models: classes, sections, subjects, timetable, assessments.
"""
import uuid
from datetime import datetime, time
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, Time
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class AcademicClass(Base):
    __tablename__ = "academic_classes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    grade_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    sections = relationship("ClassSection", back_populates="academic_class")


class ClassSection(Base):
    __tablename__ = "class_sections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("academic_classes.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    room: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    academic_class = relationship("AcademicClass", back_populates="sections")
    campus = relationship("Campus", back_populates="sections")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Property wrappers for backward compatibility with schema fields not in DB
    @property
    def description(self) -> Optional[str]: return None
    @description.setter
    def description(self, val: Optional[str]): pass

    @property
    def is_elective(self) -> Optional[bool]: return False
    @is_elective.setter
    def is_elective(self, val: Optional[bool]): pass


class ClassSectionSubject(Base):
    __tablename__ = "class_section_subjects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class TimetablePeriod(Base):
    __tablename__ = "timetable_periods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    is_break: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class TimetableSlot(Base):
    __tablename__ = "timetable_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    period_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("timetable_periods.id"), nullable=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Mon ... 6=Sun
    subject_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    teacher_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    room: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    is_published: Mapped[Optional[bool]] = mapped_column(Boolean, default=True, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    class_section = relationship("ClassSection")
    period = relationship("TimetablePeriod")

    # Property wrappers for backward compatibility with schema fields not in DB
    @property
    def is_active(self) -> Optional[bool]:
        return self.is_published

    @is_active.setter
    def is_active(self, value: Optional[bool]):
        self.is_published = value

    @property
    def subject_id(self) -> Optional[uuid.UUID]:
        return None

    @subject_id.setter
    def subject_id(self, value: Optional[uuid.UUID]):
        pass

    @property
    def period_label(self) -> Optional[str]:
        return self.period.label if self.period else None

    @period_label.setter
    def period_label(self, value: Optional[str]):
        pass

    @property
    def campus_id(self) -> Optional[uuid.UUID]:
        return self.class_section.campus_id if self.class_section else None

    @campus_id.setter
    def campus_id(self, value: Optional[uuid.UUID]):
        pass


class AcademicAssessment(Base):
    __tablename__ = "academic_assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    assessment_type: Mapped[str] = mapped_column(String, nullable=False, default="exam")
    assessment_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    max_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    passing_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    weightage_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    term_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_published: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_date: Mapped[str] = mapped_column(String, nullable=False)
    end_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    holiday_type: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="public")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    @property
    def campus_id(self) -> Optional[uuid.UUID]:
        return None

    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]):
        pass
