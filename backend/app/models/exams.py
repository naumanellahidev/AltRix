"""
Exams and results models.
"""
import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.ext.hybrid import hybrid_property

from app.database import Base



class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    term_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    academic_year: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    result_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    result_published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    passing_percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def campus_id(self) -> Optional[uuid.UUID]:
        return None

    @campus_id.setter
    def campus_id(self, val: Optional[uuid.UUID]):
        pass

    @property
    def title(self) -> str:
        return self.name

    @title.setter
    def title(self, val: str):
        self.name = val

    @property
    def exam_type(self) -> Optional[str]:
        return self.status

    @exam_type.setter
    def exam_type(self, val: Optional[str]):
        if val:
            self.status = val

    @property
    def term(self) -> Optional[str]:
        return self.term_label

    @term.setter
    def term(self, val: Optional[str]):
        self.term_label = val

    @hybrid_property
    def is_published(self) -> bool:
        return self.result_published

    @is_published.setter
    def is_published(self, val: bool):
        self.result_published = val

    @is_published.expression
    def is_published(cls):
        return cls.result_published



class ExamDatesheet(Base):
    __tablename__ = "exam_datesheets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    exam_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    exam_date: Mapped[str] = mapped_column(String, nullable=False)
    start_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    room: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    max_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    passing_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class ExamResult(Base):
    __tablename__ = "exam_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    exam_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    marks_obtained: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    graded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Property wrappers for backward compatibility
    @property
    def class_section_id(self) -> Optional[uuid.UUID]:
        return None

    @class_section_id.setter
    def class_section_id(self, val: Optional[uuid.UUID]):
        pass

    @property
    def percentage(self) -> Optional[float]:
        if self.marks_obtained is not None and self.max_marks:
            return float(self.marks_obtained / self.max_marks * 100)
        return None

    @percentage.setter
    def percentage(self, val: Optional[float]):
        pass

    @property
    def rank(self) -> Optional[int]:
        return None

    @rank.setter
    def rank(self, val: Optional[int]):
        pass

    @property
    def is_absent(self) -> bool:
        return False

    @is_absent.setter
    def is_absent(self, val: bool):
        pass



class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    assessment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("academic_assessments.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    marks_obtained: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_absent: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    graded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class ExamRoom(Base):
    __tablename__ = "exam_rooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    
    room_name: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "Main Auditorium"
    capacity_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    capacity_cols: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    total_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    school = relationship = orm_relationship("School")


class ExamSeatingPlan(Base):
    __tablename__ = "exam_seating_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    
    exam_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    datesheet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exam_datesheets.id", ondelete="CASCADE"), nullable=False)
    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exam_rooms.id", ondelete="CASCADE"), nullable=False)
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    exam = orm_relationship("Exam")
    datesheet = orm_relationship("ExamDatesheet")
    room = orm_relationship("ExamRoom")


class ExamSeatAssignment(Base):
    __tablename__ = "exam_seat_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seating_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exam_seating_plans.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    row_num: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-indexed row
    col_num: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-indexed column
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    seating_plan = orm_relationship("ExamSeatingPlan")
    student = orm_relationship("Student")


class ExamInvigilator(Base):
    __tablename__ = "exam_invigilators"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seating_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exam_seating_plans.id", ondelete="CASCADE"), nullable=False)
    staff_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # profile or user id
    role: Mapped[str] = mapped_column(String, nullable=False, default="primary")  # primary, secondary, helper
    
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    seating_plan = orm_relationship("ExamSeatingPlan")

