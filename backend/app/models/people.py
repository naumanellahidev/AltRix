"""
People models: students, teachers, guardians (parents).
"""
import uuid
from typing import Optional
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Date, ForeignKey, Integer, String, Text, JSON
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship
from sqlalchemy.sql import func

from app.database import Base


class Student(Base):
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column("profile_id", UUID(as_uuid=True), nullable=True)  # auth.users link (profile_id in DB)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    registration_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    roll_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_of_birth: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column("profile_image_url", String, nullable=True)  # profile_image_url in DB
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    emergency_contact: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="active")  # active, inactive, graduated, transferred
    admission_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    blood_group: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    card_valid_until: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    enrollments = orm_relationship("StudentEnrollment", back_populates="student", cascade="all, delete-orphan")
    section = orm_relationship("ClassSection", secondary="student_enrollments", viewonly=True, uselist=False)
    guardians = orm_relationship("Guardian", back_populates="student")

    @property
    def section_id(self) -> Optional[uuid.UUID]:
        try:
            return self.enrollments[0].class_section_id if self.enrollments else None
        except Exception:
            return None

    @section_id.setter
    def section_id(self, val: Optional[uuid.UUID]):
        pass

    # Property wrappers for backward compatibility with schema fields not in DB

    @property
    def leaving_date(self) -> Optional[str]: return None
    @leaving_date.setter
    def leaving_date(self, val: Optional[str]): pass

    @property
    def custom_fields(self) -> Optional[dict]: return None
    @custom_fields.setter
    def custom_fields(self, val: Optional[dict]): pass

    @property
    def email(self) -> Optional[str]: return None
    @email.setter
    def email(self, val: Optional[str]): pass



class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    student = orm_relationship("Student", back_populates="enrollments")


class Guardian(Base):
    __tablename__ = "student_guardians"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # parent's auth.users link
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    relationship: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="parent")  # father, mother, guardian
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_primary: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    is_emergency_contact: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    # Relationships
    student = orm_relationship("Student", back_populates="guardians")

    @property
    def updated_at(self) -> Optional[datetime]: return self.created_at
    @updated_at.setter
    def updated_at(self, val: Optional[datetime]): pass

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
    __tablename__ = "hr_staff_directory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cnic: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    position: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    employment_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    joining_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    emergency_contact: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    linked_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    linked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=False)

    # Property wrappers for backward compatibility with schema fields not in DB
    @property
    def user_id(self) -> Optional[uuid.UUID]:
        return self.linked_user_id

    @user_id.setter
    def user_id(self, val: Optional[uuid.UUID]):
        self.linked_user_id = val

    @property
    def designation(self) -> Optional[str]:
        return self.position

    @designation.setter
    def designation(self, val: Optional[str]):
        self.position = val

    @property
    def date_of_joining(self) -> Optional[str]:
        return self.joining_date.strftime("%Y-%m-%d") if self.joining_date else None

    @date_of_joining.setter
    def date_of_joining(self, val: Optional[str]):
        if val:
            try:
                from datetime import datetime as dt
                self.joining_date = dt.strptime(val, "%Y-%m-%d").date()
            except ValueError:
                pass

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
    def employee_id(self) -> Optional[str]: return None
    @employee_id.setter
    def employee_id(self, val: Optional[str]): pass

    @property
    def qualifications(self) -> Optional[list]: return []
    @qualifications.setter
    def qualifications(self, val: Optional[list]): pass

    @property
    def specializations(self) -> Optional[list]: return []
    @specializations.setter
    def specializations(self, val: Optional[list]): pass

    @property
    def photo_url(self) -> Optional[str]: return None
    @photo_url.setter
    def photo_url(self, val: Optional[str]): pass

    @property
    def salary(self) -> Optional[float]: return None
    @salary.setter
    def salary(self, val: Optional[float]): pass


class TeacherAssignment(Base):
    __tablename__ = "teacher_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    teacher_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class TeacherSubjectAssignment(Base):
    __tablename__ = "teacher_subject_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    class_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    teacher_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class SchoolIdCardSettings(Base):
    __tablename__ = "school_id_card_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False, unique=True)
    card_layout: Mapped[str] = mapped_column(String, nullable=False, default="vertical")
    primary_color: Mapped[str] = mapped_column(String, nullable=False, default="#1e40af")
    text_color: Mapped[str] = mapped_column(String, nullable=False, default="#ffffff")
    card_title: Mapped[str] = mapped_column(String, nullable=False, default="STUDENT IDENTIFICATION")
    show_logo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_qr_code: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_roll_number: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_class: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_dob: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_blood_group: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_emergency_contact: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_signature: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    signature_text: Mapped[str] = mapped_column(String, nullable=False, default="Authorized Signature")
    design_style: Mapped[str] = mapped_column(String, nullable=False, default="modern")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
