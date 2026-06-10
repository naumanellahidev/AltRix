"""
People models: students, teachers, guardians (parents).
"""
import uuid
from typing import Optional
from sqlalchemy import (
    Boolean, Column, DateTime, Date, ForeignKey, Integer, String, Text, JSON
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=True)
    user_id = Column("profile_id", UUID(as_uuid=True), nullable=True)  # auth.users link (profile_id in DB)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=True)
    registration_number = Column(String, nullable=True)
    roll_number = Column(String, nullable=True)
    date_of_birth = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    photo_url = Column("profile_image_url", String, nullable=True)  # profile_image_url in DB
    blood_group = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    status = Column(String, nullable=True, default="active")  # active, inactive, graduated, transferred
    admission_date = Column(String, nullable=True)
    leaving_date = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    custom_fields = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    section = orm_relationship("ClassSection", back_populates="students")
    guardians = orm_relationship("Guardian", back_populates="student")


class Guardian(Base):
    __tablename__ = "student_guardians"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=True)  # parent's auth.users link
    full_name = Column(String, nullable=False)
    relationship = Column(String, nullable=True, default="parent")  # father, mother, guardian
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False, nullable=True)
    is_emergency_contact = Column(Boolean, default=False, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    student = orm_relationship("Student", back_populates="guardians")

    @property
    def first_name(self) -> str:
        return self.full_name.split(" ", 1)[0] if self.full_name else ""

    @first_name.setter
    def first_name(self, val: str):
        last = self.last_name or ""
        self.full_name = f"{val} {last}".strip()

    @property
    def last_name(self) -> str:
        parts = self.full_name.split(" ", 1) if self.full_name else []
        return parts[1] if len(parts) > 1 else ""

    @last_name.setter
    def last_name(self, val: str):
        first = self.first_name or ""
        self.full_name = f"{first} {val}".strip()

    @property
    def cnic(self) -> Optional[str]:
        return None

    @cnic.setter
    def cnic(self, val: Optional[str]):
        pass

    @property
    def occupation(self) -> Optional[str]:
        return None

    @occupation.setter
    def occupation(self, val: Optional[str]):
        pass

    @property
    def address(self) -> Optional[str]:
        return None

    @address.setter
    def address(self, val: Optional[str]):
        pass

    @property
    def can_pickup(self) -> Optional[bool]:
        return True

    @can_pickup.setter
    def can_pickup(self, val: Optional[bool]):
        pass


class TeacherProfile(Base):
    __tablename__ = "teacher_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)  # auth.users link
    employee_id = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    department = Column(String, nullable=True)
    qualifications = Column(ARRAY(String), nullable=True)
    specializations = Column(ARRAY(String), nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    date_of_joining = Column(String, nullable=True)
    date_of_birth = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    cnic = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    salary = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class TeacherSubjectAssignment(Base):
    __tablename__ = "teacher_subject_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    teacher_user_id = Column(UUID(as_uuid=True), nullable=False)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
