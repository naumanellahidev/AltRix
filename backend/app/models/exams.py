"""
Exams and results models.
"""
import uuid
from typing import Optional
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.ext.hybrid import hybrid_property

from app.database import Base



class Exam(Base):
    __tablename__ = "exams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    name = Column(String, nullable=False)
    term_label = Column(String, nullable=True)
    academic_year = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="draft")
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    result_published = Column(Boolean, default=False, nullable=False)
    result_published_at = Column(DateTime(timezone=True), nullable=True)
    passing_percentage = Column(Float, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    exam_date = Column(String, nullable=False)
    start_time = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    room = Column(String, nullable=True)
    max_marks = Column(Float, nullable=True)
    passing_marks = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class ExamResult(Base):
    __tablename__ = "exam_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    marks_obtained = Column(Float, nullable=True)
    max_marks = Column(Float, nullable=True)
    grade = Column(String, nullable=True)
    remarks = Column(Text, nullable=True)
    graded_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("academic_assessments.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    marks_obtained = Column(Float, nullable=True)
    grade = Column(String, nullable=True)
    remarks = Column(Text, nullable=True)
    is_absent = Column(Boolean, default=False, nullable=True)
    graded_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
