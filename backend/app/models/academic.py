"""
Academic models: classes, sections, subjects, timetable, assessments.
"""
import uuid
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, Time
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class AcademicClass(Base):
    __tablename__ = "academic_classes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name = Column(String, nullable=False)
    grade_level = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    sections = relationship("ClassSection", back_populates="academic_class")


class ClassSection(Base):
    __tablename__ = "class_sections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_id = Column(UUID(as_uuid=True), ForeignKey("academic_classes.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    name = Column(String, nullable=False)
    room = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    academic_class = relationship("AcademicClass", back_populates="sections")
    campus = relationship("Campus", back_populates="sections")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name = Column(String, nullable=False)
    code = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)

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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class TimetablePeriod(Base):
    __tablename__ = "timetable_periods"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    label = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    is_break = Column(Boolean, default=False, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class TimetableSlot(Base):
    __tablename__ = "timetable_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    period_id = Column(UUID(as_uuid=True), ForeignKey("timetable_periods.id"), nullable=True)
    day_of_week = Column(Integer, nullable=False)  # 0=Mon ... 6=Sun
    subject_name = Column(String, nullable=True)
    teacher_user_id = Column(UUID(as_uuid=True), nullable=True)
    room = Column(String, nullable=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    is_published = Column(Boolean, default=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)

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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    title = Column(String, nullable=False)
    assessment_type = Column(String, nullable=False, default="exam")
    assessment_date = Column(String, nullable=True)
    max_marks = Column(Float, nullable=True)
    passing_marks = Column(Float, nullable=True)
    weightage_percent = Column(Float, nullable=True)
    term_label = Column(String, nullable=True)
    instructions = Column(Text, nullable=True)
    is_published = Column(Boolean, default=False, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    start_date = Column(String, nullable=False)
    end_date = Column(String, nullable=True)
    holiday_type = Column(String, nullable=True, default="public")
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    @property
    def campus_id(self) -> Optional[uuid.UUID]:
        return None

    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]):
        pass
