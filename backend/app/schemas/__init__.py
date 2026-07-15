"""
Pydantic schemas for all API request/response models.
"""
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


# ─── COMMON ───────────────────────────────────────────────────────────────────

class IDResponse(BaseModel):
    id: UUID
    message: str = "Success"


class MessageResponse(BaseModel):
    message: str


# ─── AUTH ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    user_id: str
    email: str
    roles: List[str] = []


class UserInfo(BaseModel):
    id: str
    email: str
    roles: List[str]
    school_id: Optional[str] = None
    campus_id: Optional[str] = None
    is_super_admin: bool = False


# ─── SCHOOLS ──────────────────────────────────────────────────────────────────

class SchoolCreate(BaseModel):
    name: str
    slug: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    tagline: Optional[str] = None


class SchoolUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    tagline: Optional[str] = None
    is_active: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None


class SchoolOut(BaseModel):
    id: UUID
    name: str
    slug: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    tagline: Optional[str] = None
    motto: Optional[str] = None
    is_active: Optional[bool] = None
    owner_user_id: Optional[UUID] = None
    subscription_plan: Optional[str] = None
    subscription_status: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── CAMPUSES ─────────────────────────────────────────────────────────────────

class CampusCreate(BaseModel):
    name: str
    slug: str
    code: Optional[str] = None
    address: Optional[str] = None
    principal_user_id: Optional[UUID] = None
    is_active: Optional[bool] = True


class CampusUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    principal_user_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class CampusOut(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    slug: str
    code: Optional[str] = None
    address: Optional[str] = None
    principal_user_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── ACADEMIC CLASSES ─────────────────────────────────────────────────────────

class ClassCreate(BaseModel):
    name: str
    grade_level: Optional[int] = None


class ClassOut(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    grade_level: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SectionCreate(BaseModel):
    class_id: UUID
    name: str
    campus_id: Optional[UUID] = None
    room: Optional[str] = None


class SectionOut(BaseModel):
    id: UUID
    school_id: UUID
    class_id: UUID
    campus_id: Optional[UUID] = None
    name: str
    room: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SubjectCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    is_elective: Optional[bool] = False


class SubjectOut(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    is_elective: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── STUDENTS ─────────────────────────────────────────────────────────────────

class StudentCreate(BaseModel):
    first_name: str
    last_name: str
    section_id: Optional[UUID] = None
    campus_id: Optional[UUID] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    registration_number: Optional[str] = None
    roll_number: Optional[str] = None
    photo_url: Optional[str] = None
    blood_group: Optional[str] = None
    card_valid_until: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    admission_date: Optional[str] = None
    status: Optional[str] = "active"


class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    section_id: Optional[UUID] = None
    campus_id: Optional[UUID] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    registration_number: Optional[str] = None
    roll_number: Optional[str] = None
    photo_url: Optional[str] = None
    blood_group: Optional[str] = None
    card_valid_until: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class StudentOut(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    section_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    first_name: str
    last_name: str
    registration_number: Optional[str] = None
    roll_number: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    blood_group: Optional[str] = None
    card_valid_until: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    admission_date: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── SCHOOL ID CARD SETTINGS ──────────────────────────────────────────────────

class SchoolIdCardSettingsCreate(BaseModel):
    card_layout: Optional[str] = "vertical"
    primary_color: Optional[str] = "#1e40af"
    text_color: Optional[str] = "#ffffff"
    card_title: Optional[str] = "STUDENT IDENTIFICATION"
    show_logo: Optional[bool] = True
    show_qr_code: Optional[bool] = True
    show_roll_number: Optional[bool] = True
    show_class: Optional[bool] = True
    show_dob: Optional[bool] = True
    show_blood_group: Optional[bool] = True
    show_emergency_contact: Optional[bool] = True
    show_signature: Optional[bool] = False
    signature_text: Optional[str] = "Authorized Signature"
    design_style: Optional[str] = "modern"


class SchoolIdCardSettingsUpdate(BaseModel):
    card_layout: Optional[str] = None
    primary_color: Optional[str] = None
    text_color: Optional[str] = None
    card_title: Optional[str] = None
    show_logo: Optional[bool] = None
    show_qr_code: Optional[bool] = None
    show_roll_number: Optional[bool] = None
    show_class: Optional[bool] = None
    show_dob: Optional[bool] = None
    show_blood_group: Optional[bool] = None
    show_emergency_contact: Optional[bool] = None
    show_signature: Optional[bool] = None
    signature_text: Optional[str] = None
    design_style: Optional[str] = None


class SchoolIdCardSettingsOut(BaseModel):
    id: UUID
    school_id: UUID
    card_layout: str
    primary_color: str
    text_color: str
    card_title: str
    show_logo: bool
    show_qr_code: bool
    show_roll_number: bool
    show_class: bool
    show_dob: bool
    show_blood_group: bool
    show_emergency_contact: bool
    show_signature: bool
    signature_text: str
    design_style: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── SCHOOL INQUIRY SETTINGS ──────────────────────────────────────────────────

class SchoolInquirySettingsCreate(BaseModel):
    form_title: Optional[str] = "Admissions & Inquiry Form"
    show_logo: Optional[bool] = True
    success_message: Optional[str] = "Thank you for inquiring! Our admissions counselor will get in touch with you shortly."
    accent_color: Optional[str] = "#f59e0b"
    fields_config: Optional[dict] = {"parentName": True, "email": True, "phone": True, "studentName": True, "studentGrade": True, "priorSchool": True, "message": True}
    required_config: Optional[dict] = {"email": True, "phone": True, "studentName": True, "studentGrade": False}


class SchoolInquirySettingsUpdate(BaseModel):
    form_title: Optional[str] = None
    show_logo: Optional[bool] = None
    success_message: Optional[str] = None
    accent_color: Optional[str] = None
    fields_config: Optional[dict] = None
    required_config: Optional[dict] = None


class SchoolInquirySettingsOut(BaseModel):
    id: UUID
    school_id: UUID
    form_title: str
    show_logo: bool
    success_message: str
    accent_color: str
    fields_config: dict
    required_config: dict
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── GUARDIANS / PARENTS ──────────────────────────────────────────────────────

class GuardianCreate(BaseModel):
    student_id: UUID
    first_name: str
    last_name: str
    relationship: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    cnic: Optional[str] = None
    occupation: Optional[str] = None
    address: Optional[str] = None
    is_primary: Optional[bool] = True
    can_pickup: Optional[bool] = True


class GuardianOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    user_id: Optional[UUID] = None
    first_name: str
    last_name: str
    relationship: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── TEACHERS ─────────────────────────────────────────────────────────────────

class TeacherCreate(BaseModel):
    user_id: UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    campus_id: Optional[UUID] = None
    date_of_joining: Optional[str] = None
    gender: Optional[str] = None
    salary: Optional[int] = None


class TeacherOut(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    user_id: UUID
    employee_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    date_of_joining: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── ADMISSIONS ───────────────────────────────────────────────────────────────

class AdmissionCreate(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    applying_for_class_id: Optional[UUID] = None
    applying_for_section_id: Optional[UUID] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    parent_address: Optional[str] = None
    previous_school: Optional[str] = None
    notes: Optional[str] = None
    desired_subjects: Optional[List[str]] = None


class AdmissionStatusUpdate(BaseModel):
    status: str  # pending, reviewing, approved, rejected
    decision_notes: Optional[str] = None


class AdmissionOut(BaseModel):
    id: UUID
    school_id: UUID
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    applying_for_class_id: Optional[UUID] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    status: str
    registration_number: Optional[str] = None
    decision_notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── ATTENDANCE ───────────────────────────────────────────────────────────────

class AttendanceSessionCreate(BaseModel):
    class_section_id: UUID
    session_date: str
    campus_id: Optional[UUID] = None
    period_label: Optional[str] = None


class AttendanceEntryCreate(BaseModel):
    student_id: UUID
    status: str = "present"  # present, absent, late, excused
    note: Optional[str] = None


class BulkAttendanceCreate(BaseModel):
    session_id: UUID
    entries: List[AttendanceEntryCreate]


class AttendanceSessionOut(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    class_section_id: UUID
    session_date: str
    period_label: Optional[str] = None
    created_by: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AttendanceEntryOut(BaseModel):
    id: UUID
    session_id: UUID
    student_id: UUID
    status: str
    note: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── EXAMS ────────────────────────────────────────────────────────────────────

class ExamCreate(BaseModel):
    title: str
    exam_type: Optional[str] = None
    term: Optional[str] = None
    academic_year: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    campus_id: Optional[UUID] = None


class ExamOut(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    title: str
    exam_type: Optional[str] = None
    term: Optional[str] = None
    academic_year: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_published: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ExamResultCreate(BaseModel):
    student_id: UUID
    subject_id: Optional[UUID] = None
    class_section_id: Optional[UUID] = None
    marks_obtained: Optional[float] = None
    max_marks: Optional[float] = None
    grade: Optional[str] = None
    remarks: Optional[str] = None
    is_absent: Optional[bool] = False


class ExamResultOut(BaseModel):
    id: UUID
    exam_id: UUID
    student_id: UUID
    subject_id: Optional[UUID] = None
    marks_obtained: Optional[float] = None
    max_marks: Optional[float] = None
    grade: Optional[str] = None
    percentage: Optional[float] = None
    rank: Optional[int] = None
    is_absent: Optional[bool] = None

    model_config = {"from_attributes": True}


# ─── FINANCE ──────────────────────────────────────────────────────────────────

class FeeStructureCreate(BaseModel):
    name: str
    description: Optional[str] = None
    academic_year: Optional[str] = None
    campus_id: Optional[UUID] = None
    class_ids: Optional[List[str]] = None
    total_amount: Optional[float] = None
    notes: Optional[str] = None


class FeeStructureOut(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    academic_year: Optional[str] = None
    total_amount: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FeeVoucherCreate(BaseModel):
    student_id: UUID
    month: Optional[str] = None
    academic_year: Optional[str] = None
    total_amount: float
    discount_amount: Optional[float] = 0
    net_amount: Optional[float] = None
    due_date: Optional[date] = None
    campus_id: Optional[UUID] = None
    notes: Optional[str] = None


class FeeVoucherOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    voucher_number: Optional[str] = None
    month: Optional[str] = None
    total_amount: float
    net_amount: float
    status: str
    due_date: Optional[date] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FeePaymentCreate(BaseModel):
    student_id: UUID
    voucher_id: Optional[UUID] = None
    amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = "cash"
    transaction_id: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class FeePaymentOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    voucher_id: Optional[UUID] = None
    amount: float
    payment_date: str
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── NOTICES ──────────────────────────────────────────────────────────────────

class NoticeCreate(BaseModel):
    title: str
    content: Optional[str] = None
    notice_type: Optional[str] = "general"
    target_roles: Optional[List[str]] = None
    campus_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None


class NoticeOut(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    title: str
    content: Optional[str] = None
    notice_type: Optional[str] = None
    target_roles: Optional[List[str]] = None
    is_published: Optional[bool] = None
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── DIARY ────────────────────────────────────────────────────────────────────

class DiaryEntryCreate(BaseModel):
    class_section_id: Optional[UUID] = None
    subject_id: Optional[UUID] = None
    title: str
    content: Optional[str] = None
    entry_date: str
    homework: Optional[str] = None
    campus_id: Optional[UUID] = None


class DiaryEntryOut(BaseModel):
    id: UUID
    school_id: UUID
    class_section_id: Optional[UUID] = None
    subject_id: Optional[UUID] = None
    teacher_user_id: Optional[UUID] = None
    title: str
    content: Optional[str] = None
    entry_date: str
    homework: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── MESSAGING ────────────────────────────────────────────────────────────────

class AdminMessageCreate(BaseModel):
    subject: str
    content: Optional[str] = None
    priority: Optional[str] = "normal"
    recipient_user_ids: List[UUID]
    campus_id: Optional[UUID] = None
    attachment_urls: Optional[List[str]] = None
    reply_to_id: Optional[UUID] = None


class AdminMessageOut(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    sender_user_id: UUID
    subject: str
    content: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    body: Optional[str] = None
    type: Optional[str] = None
    entity_id: Optional[UUID] = None
    entity_type: Optional[str] = None
    category: Optional[str] = "general"
    action_url: Optional[str] = None
    priority: Optional[str] = "normal"
    icon: Optional[str] = None
    color: Optional[str] = None
    metadata: Optional[dict] = None
    archived_at: Optional[datetime] = None
    is_favorite: Optional[bool] = False
    is_pinned: Optional[bool] = False
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def map_metadata(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "metadata_json" in data and "metadata" not in data:
                data["metadata"] = data["metadata_json"]
            return data
        
        # Handle SQLAlchemy ORM instance
        if hasattr(data, "id"):
            return {
                "id": data.id,
                "user_id": data.user_id,
                "title": data.title,
                "body": data.body,
                "type": data.type,
                "entity_id": data.entity_id,
                "entity_type": data.entity_type,
                "category": data.category,
                "action_url": data.action_url,
                "priority": getattr(data, "priority", "normal"),
                "icon": getattr(data, "icon", None),
                "color": getattr(data, "color", None),
                "metadata": getattr(data, "metadata_json", {}),
                "archived_at": getattr(data, "archived_at", None),
                "is_favorite": getattr(data, "is_favorite", False),
                "is_pinned": getattr(data, "is_pinned", False),
                "read_at": data.read_at,
                "created_at": data.created_at,
            }
        return data


# ─── COMPLAINTS ───────────────────────────────────────────────────────────────

class ComplaintCreate(BaseModel):
    subject: str
    content: str
    category: Optional[str] = None
    flow: str = "parent_to_school"
    student_id: Optional[UUID] = None
    campus_id: Optional[UUID] = None


class ComplaintStatusUpdate(BaseModel):
    status: str  # open, in_progress, resolved, closed
    resolution_note: Optional[str] = None


class ComplaintOut(BaseModel):
    id: UUID
    school_id: UUID
    sender_user_id: UUID
    subject: str
    content: str
    category: Optional[str] = None
    flow: str
    status: str
    resolution_note: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────

class AssignmentCreate(BaseModel):
    class_section_id: UUID
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    max_marks: Optional[float] = None
    campus_id: Optional[UUID] = None
    attachment_urls: Optional[List[str]] = None


class AssignmentOut(BaseModel):
    id: UUID
    school_id: UUID
    class_section_id: UUID
    teacher_user_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    max_marks: Optional[float] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── BEHAVIOR ─────────────────────────────────────────────────────────────────

class BehaviorNoteCreate(BaseModel):
    student_id: UUID
    title: str
    content: Optional[str] = None
    note_type: Optional[str] = "general"
    is_shared_with_parents: Optional[bool] = False
    campus_id: Optional[UUID] = None


class BehaviorNoteOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    teacher_user_id: Optional[UUID] = None
    title: str
    content: Optional[str] = None
    note_type: Optional[str] = None
    is_shared_with_parents: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── HR ───────────────────────────────────────────────────────────────────────

class LeaveRequestCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    days_count: Optional[float] = None
    reason: Optional[str] = None
    campus_id: Optional[UUID] = None


class LeaveRequestOut(BaseModel):
    id: UUID
    school_id: UUID
    user_id: UUID
    leave_type: str
    start_date: str
    end_date: str
    status: str
    reason: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PayrollCreate(BaseModel):
    user_id: UUID
    month: str
    year: int
    basic_salary: Optional[float] = None
    allowances: Optional[float] = 0
    deductions: Optional[float] = 0
    net_salary: Optional[float] = None
    campus_id: Optional[UUID] = None


class PayrollOut(BaseModel):
    id: UUID
    school_id: UUID
    user_id: UUID
    month: str
    year: int
    basic_salary: Optional[float] = None
    net_salary: Optional[float] = None
    payment_status: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── AI ───────────────────────────────────────────────────────────────────────

class AiPredictionOut(BaseModel):
    id: UUID
    student_id: UUID
    predicted_grade: Optional[str] = None
    promotion_probability: Optional[float] = None
    failure_risk: Optional[float] = None
    confidence: Optional[float] = None
    factors: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AiStudentProfileOut(BaseModel):
    id: UUID
    student_id: UUID
    learning_style: Optional[str] = None
    personality_type: Optional[str] = None
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    strengths: Optional[List[str]] = None
    weaknesses: Optional[List[str]] = None
    needs_counseling: Optional[bool] = None
    needs_extra_support: Optional[bool] = None
    last_analyzed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AiEarlyWarningOut(BaseModel):
    id: UUID
    student_id: UUID
    warning_type: str
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    recommended_actions: Optional[List[str]] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── TIMETABLE ────────────────────────────────────────────────────────────────

class TimetableSlotCreate(BaseModel):
    class_section_id: UUID
    subject_id: Optional[UUID] = None
    teacher_user_id: Optional[UUID] = None
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: str
    end_time: str
    room: Optional[str] = None
    period_label: Optional[str] = None
    campus_id: Optional[UUID] = None


class TimetableSlotOut(BaseModel):
    id: UUID
    school_id: UUID
    class_section_id: UUID
    subject_id: Optional[UUID] = None
    teacher_user_id: Optional[UUID] = None
    day_of_week: int
    start_time: str
    end_time: str
    room: Optional[str] = None
    period_label: Optional[str] = None
    is_active: Optional[bool] = None

    model_config = {"from_attributes": True}


# ─── AUDIT ────────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: UUID
    school_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── PAYMENT GATEWAY ──────────────────────────────────────────────────────────

class JazzCashPaymentRequest(BaseModel):
    student_id: UUID
    voucher_id: Optional[UUID] = None
    amount: float
    mobile_number: str
    description: Optional[str] = None


class PaymentCallbackData(BaseModel):
    pp_ResponseCode: str
    pp_ResponseMessage: str
    pp_Amount: str
    pp_TxnRefNo: str
    pp_MerchantID: str
    pp_SecureHash: Optional[str] = None
    model_config = {"extra": "allow"}


# ─── SCHOOL BRANDING ──────────────────────────────────────────────────────────

class BrandingUpdate(BaseModel):
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    font_family: Optional[str] = None
    accent_hue: Optional[float] = None
    accent_saturation: Optional[float] = None
    accent_lightness: Optional[float] = None
    radius_scale: Optional[float] = None


class BrandingOut(BaseModel):
    id: UUID
    school_id: UUID
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    logo_url: Optional[str] = None
    font_family: Optional[str] = None
    accent_hue: Optional[float] = None
    accent_saturation: Optional[float] = None
    accent_lightness: Optional[float] = None
    radius_scale: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── ROLES ────────────────────────────────────────────────────────────────────

class UserRoleCreate(BaseModel):
    user_id: UUID
    role: str
    campus_id: Optional[UUID] = None


class UserRoleOut(BaseModel):
    id: UUID
    user_id: UUID
    school_id: UUID
    role: str
    campus_id: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── REPORTS ──────────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    report_type: str  # report_card, attendance, finance, campus
    student_id: Optional[UUID] = None
    class_section_id: Optional[UUID] = None
    campus_id: Optional[UUID] = None
    academic_year: Optional[str] = None
    term: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None


# ─── MIGRATED HOOK RESPONSE SCHEMAS ───────────────────────────────────────────

class SchoolPermissionsOut(BaseModel):
    isPlatformSuperAdmin: bool
    canManageStaff: bool
    canManageStudents: bool
    canWorkCrm: bool
    canManageFinance: bool


class UserRoleBriefOut(BaseModel):
    role: str


class MyStudentIdOut(BaseModel):
    student_id: Optional[UUID] = None


class UserProfileOut(BaseModel):
    id: UUID
    email: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── EVENT BUS SCHEMAS ────────────────────────────────────────────────────────

class EventEnvelope(BaseModel):
    id: Optional[Union[str, UUID]] = None
    event_name: str
    category: str
    school_id: Optional[Union[str, UUID]] = None
    campus_id: Optional[Union[str, UUID]] = None
    user_id: Optional[Union[str, UUID]] = None
    entity_type: Optional[str] = None
    entity_id: Optional[Union[str, UUID]] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    correlation_id: Optional[Union[str, UUID]] = None
    request_id: Optional[str] = None
    source: Optional[str] = "system"
    version: Optional[str] = "1.0.0"



class ActivityTimelineOut(BaseModel):
    id: UUID
    school_id: Optional[UUID]
    campus_id: Optional[UUID]
    user_id: Optional[UUID]
    event_name: str
    title: str
    description: Optional[str]
    category: str
    entity_type: Optional[str]
    entity_id: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class EventStoreOut(BaseModel):
    id: UUID
    event_name: str
    category: str
    school_id: Optional[UUID]
    campus_id: Optional[UUID]
    user_id: Optional[UUID]
    entity_type: Optional[str]
    entity_id: Optional[UUID]
    payload: Dict[str, Any]
    metadata: Dict[str, Any]
    correlation_id: UUID
    request_id: Optional[str]
    source: str
    status: str
    retry_count: int
    execution_time_ms: Optional[int]
    version: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EventMonitoringStats(BaseModel):
    published_count: int
    processed_count: int
    failed_count: int
    retry_queue_count: int
    avg_processing_time_ms: float
    subscriber_statuses: Dict[str, str]


# ─── REPORT CARD TEMPLATES ────────────────────────────────────────────────────

class ReportCardTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_default: Optional[bool] = False
    layout_config: Optional[Dict[str, Any]] = None
    grading_system: Optional[str] = "percentage"
    show_position: Optional[bool] = True
    show_class_average: Optional[bool] = True
    show_highest_marks: Optional[bool] = False
    show_attendance: Optional[bool] = True
    show_co_curricular: Optional[bool] = True
    show_teacher_remarks: Optional[bool] = True
    show_principal_remarks: Optional[bool] = True
    show_trend_graph: Optional[bool] = True
    show_digital_signature: Optional[bool] = True
    principal_signature_name: Optional[str] = None
    principal_signature_title: Optional[str] = "Principal"
    enable_qr_verification: Optional[bool] = True
    language: Optional[str] = "en"
    co_curricular_categories: Optional[List[str]] = None


class ReportCardTemplateOut(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    description: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    layout_config: Optional[Dict[str, Any]] = None
    grading_system: Optional[str] = None
    show_position: Optional[bool] = None
    show_class_average: Optional[bool] = None
    show_highest_marks: Optional[bool] = None
    show_attendance: Optional[bool] = None
    show_co_curricular: Optional[bool] = None
    show_teacher_remarks: Optional[bool] = None
    show_principal_remarks: Optional[bool] = None
    show_trend_graph: Optional[bool] = None
    show_digital_signature: Optional[bool] = None
    principal_signature_name: Optional[str] = None
    principal_signature_title: Optional[str] = None
    enable_qr_verification: Optional[bool] = None
    language: Optional[str] = None
    co_curricular_categories: Optional[List[str]] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── REPORT CARDS ─────────────────────────────────────────────────────────────

class ReportCardGenerateRequest(BaseModel):
    template_id: Optional[UUID] = None
    exam_id: Optional[UUID] = None
    class_section_id: UUID
    period_type: Optional[str] = "term"
    period_label: Optional[str] = None
    academic_year: Optional[str] = None


class ReportCardSubjectEntryOut(BaseModel):
    id: UUID
    subject_id: Optional[UUID] = None
    subject_name: str
    marks_obtained: Optional[float] = None
    max_marks: Optional[float] = None
    percentage: Optional[float] = None
    grade: Optional[str] = None
    gpa_points: Optional[float] = None
    position_in_subject: Optional[int] = None
    class_average: Optional[float] = None
    highest_in_class: Optional[float] = None
    teacher_comment: Optional[str] = None
    sort_order: Optional[int] = 0

    model_config = {"from_attributes": True}


class CoCurricularGradeCreate(BaseModel):
    activity_name: str
    category: Optional[str] = None
    grade: Optional[str] = None
    score: Optional[float] = None
    max_score: Optional[float] = None
    remarks: Optional[str] = None


class CoCurricularGradeOut(BaseModel):
    id: UUID
    report_card_id: UUID
    activity_name: str
    category: Optional[str] = None
    grade: Optional[str] = None
    score: Optional[float] = None
    max_score: Optional[float] = None
    remarks: Optional[str] = None
    sort_order: Optional[int] = 0

    model_config = {"from_attributes": True}


class ReportCardOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    template_id: Optional[UUID] = None
    exam_id: Optional[UUID] = None
    period_type: str
    period_label: Optional[str] = None
    academic_year: Optional[str] = None
    total_marks: Optional[float] = None
    max_total_marks: Optional[float] = None
    percentage: Optional[float] = None
    gpa: Optional[float] = None
    overall_grade: Optional[str] = None
    position_in_class: Optional[int] = None
    total_students_in_class: Optional[int] = None
    attendance_percentage: Optional[float] = None
    total_present_days: Optional[int] = None
    total_school_days: Optional[int] = None
    teacher_remarks: Optional[str] = None
    principal_remarks: Optional[str] = None
    is_published: Optional[bool] = None
    published_at: Optional[datetime] = None
    qr_verification_token: Optional[str] = None
    signed_by_name: Optional[str] = None
    signed_by_title: Optional[str] = None
    signed_at: Optional[datetime] = None
    trend_data: Optional[List[Dict[str, Any]]] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ReportCardUpdateRemarks(BaseModel):
    teacher_remarks: Optional[str] = None
    principal_remarks: Optional[str] = None


# ─── GRADE SCALES ─────────────────────────────────────────────────────────────

class GradeScaleCreate(BaseModel):
    label: str
    min_percentage: float
    max_percentage: float = 100
    gpa_points: Optional[float] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = 0


class GradeScaleOut(BaseModel):
    id: UUID
    school_id: UUID
    label: str
    min_percentage: float
    max_percentage: float
    gpa_points: Optional[float] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── CURRICULUM FRAMEWORK ─────────────────────────────────────────────────────

class CurriculumPresetOut(BaseModel):
    id: UUID
    school_id: Optional[UUID] = None
    name: str
    code: str
    description: Optional[str] = None
    is_global: Optional[bool] = None
    is_active: Optional[bool] = None
    grade_structure: Optional[Dict[str, Any]] = None
    strand_definitions: Optional[List[Dict[str, Any]]] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class LearningOutcomeCreate(BaseModel):
    preset_id: Optional[UUID] = None
    subject_id: Optional[UUID] = None
    code: str
    title: str
    description: Optional[str] = None
    strand: Optional[str] = None
    sub_strand: Optional[str] = None
    grade_level: Optional[int] = None
    bloom_level: Optional[str] = None


class LearningOutcomeOut(BaseModel):
    id: UUID
    school_id: UUID
    preset_id: Optional[UUID] = None
    subject_id: Optional[UUID] = None
    code: str
    title: str
    description: Optional[str] = None
    strand: Optional[str] = None
    sub_strand: Optional[str] = None
    grade_level: Optional[int] = None
    bloom_level: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = 0
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AssessmentCriteriaCreate(BaseModel):
    assessment_id: Optional[UUID] = None
    learning_outcome_id: Optional[UUID] = None
    criteria_name: str
    description: Optional[str] = None
    max_score: Optional[float] = 4
    rubric_levels: Optional[List[Dict[str, Any]]] = None


class AssessmentCriteriaOut(BaseModel):
    id: UUID
    school_id: UUID
    assessment_id: Optional[UUID] = None
    learning_outcome_id: Optional[UUID] = None
    criteria_name: str
    description: Optional[str] = None
    max_score: Optional[float] = None
    rubric_levels: Optional[List[Dict[str, Any]]] = None
    sort_order: Optional[int] = 0
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CriteriaScoreCreate(BaseModel):
    criteria_id: UUID
    student_id: UUID
    score: Optional[float] = None
    level_achieved: Optional[str] = None
    teacher_feedback: Optional[str] = None


class CriteriaScoreOut(BaseModel):
    id: UUID
    school_id: UUID
    criteria_id: UUID
    student_id: UUID
    score: Optional[float] = None
    level_achieved: Optional[str] = None
    teacher_feedback: Optional[str] = None
    scored_by: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class StrandAssessmentCreate(BaseModel):
    student_id: UUID
    subject_id: Optional[UUID] = None
    strand_name: str
    sub_strand_name: Optional[str] = None
    academic_year: Optional[str] = None
    term_label: Optional[str] = None
    score: Optional[float] = None
    max_score: Optional[float] = None
    level: Optional[str] = None


class StrandAssessmentOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    subject_id: Optional[UUID] = None
    strand_name: str
    sub_strand_name: Optional[str] = None
    academic_year: Optional[str] = None
    term_label: Optional[str] = None
    score: Optional[float] = None
    max_score: Optional[float] = None
    percentage: Optional[float] = None
    level: Optional[str] = None
    grade: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GradeBoundaryCreate(BaseModel):
    subject_id: Optional[UUID] = None
    preset_id: Optional[UUID] = None
    label: str
    min_percentage: float
    max_percentage: float = 100
    gpa_equivalent: Optional[float] = None
    description: Optional[str] = None
    is_passing: Optional[bool] = True


class GradeBoundaryOut(BaseModel):
    id: UUID
    school_id: UUID
    subject_id: Optional[UUID] = None
    preset_id: Optional[UUID] = None
    label: str
    min_percentage: float
    max_percentage: float
    gpa_equivalent: Optional[float] = None
    description: Optional[str] = None
    is_passing: Optional[bool] = None
    sort_order: Optional[int] = 0
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AssessmentLOMappingCreate(BaseModel):
    assessment_id: UUID
    learning_outcome_id: UUID
    weightage: Optional[float] = None


class AssessmentLOMappingOut(BaseModel):
    id: UUID
    school_id: UUID
    assessment_id: UUID
    learning_outcome_id: UUID
    weightage: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── ENHANCED FEE PORTAL ─────────────────────────────────────────────────────

class InstallmentPlanCreate(BaseModel):
    invoice_id: UUID
    student_id: UUID
    total_amount: float
    total_installments: int
    frequency: Optional[str] = "monthly"
    start_date: str
    notes: Optional[str] = None


class InstallmentPlanOut(BaseModel):
    id: UUID
    school_id: UUID
    invoice_id: UUID
    student_id: UUID
    total_amount: float
    total_installments: int
    installment_amount: float
    frequency: Optional[str] = None
    start_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class InstallmentPaymentOut(BaseModel):
    id: UUID
    plan_id: UUID
    installment_number: int
    due_date: Optional[date] = None
    amount: float
    paid_amount: float
    status: str
    payment_id: Optional[UUID] = None
    paid_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SiblingDiscountCreate(BaseModel):
    name: str
    sibling_number: int
    discount_type: Optional[str] = "percent"
    discount_value: float
    applies_to: Optional[str] = "tuition"
    is_active: Optional[bool] = True


class SiblingDiscountOut(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    sibling_number: int
    discount_type: str
    discount_value: float
    applies_to: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TaxCertificateGenerateRequest(BaseModel):
    student_id: UUID
    fiscal_year: str
    school_ntn: Optional[str] = None


class TaxCertificateOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    parent_user_id: Optional[UUID] = None
    fiscal_year: str
    certificate_number: str
    total_fees_paid: float
    total_tuition: float
    total_other_charges: float
    school_ntn: Optional[str] = None
    payment_details: Optional[List[Dict[str, Any]]] = None
    generated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FeeEscalationOut(BaseModel):
    id: UUID
    school_id: UUID
    invoice_id: UUID
    student_id: UUID
    escalation_level: int
    escalation_type: str
    overdue_days: int
    overdue_amount: float
    action_taken: Optional[str] = None
    notification_sent: Optional[bool] = None
    resolved: Optional[bool] = None
    resolved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaymentGatewayConfigCreate(BaseModel):
    gateway_name: str
    display_name: Optional[str] = None
    is_active: Optional[bool] = False
    is_default: Optional[bool] = False
    config: Optional[Dict[str, Any]] = None
    supported_methods: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    processing_fee_type: Optional[str] = None
    processing_fee_value: Optional[float] = None


class PaymentGatewayConfigOut(BaseModel):
    id: UUID
    school_id: UUID
    gateway_name: str
    display_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    supported_methods: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    processing_fee_type: Optional[str] = None
    processing_fee_value: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── VISITOR MANAGEMENT ───────────────────────────────────────────────────────

class VisitorPassCreate(BaseModel):
    visitor_name: str
    phone: str
    email: Optional[str] = None
    cnic: Optional[str] = None
    purpose: str = "meeting"
    details: Optional[str] = None
    scheduled_date: str
    student_id: Optional[UUID] = None


class VisitorPassOut(BaseModel):
    id: UUID
    school_id: UUID
    parent_user_id: Optional[UUID] = None
    student_id: Optional[UUID] = None
    visitor_name: str
    phone: str
    email: Optional[str] = None
    cnic: Optional[str] = None
    photo_url: Optional[str] = None
    purpose: str
    details: Optional[str] = None
    qr_code_token: str
    pass_type: str
    checkin_status: str
    scheduled_date: date
    checkin_at: Optional[datetime] = None
    checkout_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class VisitorBlacklistCreate(BaseModel):
    name: str
    cnic: Optional[str] = None
    phone: Optional[str] = None
    reason: str


class VisitorBlacklistOut(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    cnic: Optional[str] = None
    phone: Optional[str] = None
    reason: str
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── EVENT EXTENSIONS ─────────────────────────────────────────────────────────

class EventRSVPCreate(BaseModel):
    student_id: UUID
    status: str  # going, maybe, not_going
    notes: Optional[str] = None


class EventRSVPOut(BaseModel):
    id: UUID
    school_id: UUID
    event_id: UUID
    parent_user_id: UUID
    student_id: UUID
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SportsScorecardCreate(BaseModel):
    title: str
    house_name: str
    points: int
    position: Optional[int] = None
    details: Optional[str] = None


class SportsScorecardOut(BaseModel):
    id: UUID
    school_id: UUID
    event_id: UUID
    title: str
    house_name: str
    points: int
    position: Optional[int] = None
    details: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AnnualFunctionPlanCreate(BaseModel):
    task_name: str
    assigned_to: Optional[UUID] = None
    due_date: Optional[str] = None
    status: str = "pending"
    priority: str = "medium"


class AnnualFunctionPlanOut(BaseModel):
    id: UUID
    school_id: UUID
    event_id: UUID
    task_name: str
    assigned_to: Optional[UUID] = None
    due_date: Optional[date] = None
    status: str
    priority: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── OWNER AI INSIGHTS ────────────────────────────────────────────────────────

class OwnerAiInsightOut(BaseModel):
    id: UUID
    school_id: UUID
    revenue_forecast: Optional[dict] = None
    enrollment_forecast: Optional[dict] = None
    teacher_risk_scores: Optional[dict] = None
    parent_sentiments: Optional[dict] = None
    benchmark_scores: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── DOCUMENT MANAGEMENT SYSTEM (DMS) ─────────────────────────────────────────

class SchoolDocumentCreate(BaseModel):
    owner_type: str  # student, staff
    owner_id: UUID
    document_type: str
    file_name: str
    file_url: str
    expiry_date: Optional[str] = None  # YYYY-MM-DD


class SchoolDocumentOut(BaseModel):
    id: UUID
    school_id: UUID
    owner_type: str
    owner_id: UUID
    document_type: str
    file_name: str
    file_url: str
    expiry_date: Optional[date] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DocumentTemplateOut(BaseModel):
    id: UUID
    school_id: UUID
    template_name: str
    body_content: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class IssuedCertificateCreate(BaseModel):
    student_id: UUID
    template_name: str
    content: str
    digital_signature_name: Optional[str] = None
    digital_signature_title: Optional[str] = None


class IssuedCertificateOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    template_name: str
    content: str
    digital_signature_name: Optional[str] = None
    digital_signature_title: Optional[str] = None
    signed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── EXAMS SEATING ARRANGEMENTS & ROOMS ───────────────────────────────────────

class ExamRoomCreate(BaseModel):
    room_name: str
    capacity_rows: int
    capacity_cols: int


class ExamRoomOut(BaseModel):
    id: UUID
    school_id: UUID
    room_name: str
    capacity_rows: int
    capacity_cols: int
    total_capacity: int
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ExamSeatAssignmentOut(BaseModel):
    id: UUID
    seating_plan_id: UUID
    student_id: UUID
    student_name: str
    student_roll: str
    student_class: str
    row_num: int
    col_num: int
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ExamSeatingPlanOut(BaseModel):
    id: UUID
    school_id: UUID
    exam_id: UUID
    datesheet_id: UUID
    room_id: UUID
    room_name: str
    invigilators: List[dict] = []
    assignments: List[ExamSeatAssignmentOut] = []
    created_at: Optional[datetime] = None

    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── STAFF APPRAISALS & KPIS ──────────────────────────────────────────────────

class StaffKpiOut(BaseModel):
    id: UUID
    school_id: UUID
    staff_user_id: UUID
    punctuality_score: float
    results_score: float
    parent_feedback_score: float
    co_curricular_score: float
    average_score: float
    evaluation_period: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class StaffAppraisalCreate(BaseModel):
    self_appraisal_text: str


class StaffAppraisalOut(BaseModel):
    id: UUID
    school_id: UUID
    staff_user_id: UUID
    self_appraisal_text: str
    reviewer_user_id: Optional[UUID] = None
    review_comments: Optional[str] = None
    status: str
    salary_increment_pct: float
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class Feedback360Create(BaseModel):
    staff_user_id: UUID
    rating: int
    comments: Optional[str] = None


class Feedback360Out(BaseModel):
    id: UUID
    school_id: UUID
    staff_user_id: UUID
    rating: int
    comments: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PerformanceImprovementPlanCreate(BaseModel):
    staff_user_id: UUID
    issues_identified: str
    action_steps: str
    deadline_date: str


class PerformanceImprovementPlanOut(BaseModel):
    id: UUID
    school_id: UUID
    staff_user_id: UUID
    issues_identified: str
    action_steps: str
    deadline_date: date
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── STUDENT WELLBEING & MEDICAL ──────────────────────────────────────────────

class StudentMedicalRecordCreate(BaseModel):
    student_id: UUID
    allergies: Optional[str] = None
    conditions: Optional[str] = None
    medications: Optional[str] = None
    health_insurance_info: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


class StudentMedicalRecordOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    allergies: Optional[str] = None
    conditions: Optional[str] = None
    medications: Optional[str] = None
    health_insurance_info: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class InfirmaryVisitLogCreate(BaseModel):
    student_id: UUID
    reason: str
    treatment_given: Optional[str] = None
    doctor_notes: Optional[str] = None
    status: str = "treated"


class InfirmaryVisitLogOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    visit_date: date
    reason: str
    treatment_given: Optional[str] = None
    doctor_notes: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class VaccinationRecordCreate(BaseModel):
    student_id: UUID
    vaccine_name: str
    dose_number: int = 1
    administered_date: str
    next_due_date: Optional[str] = None


class VaccinationRecordOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    vaccine_name: str
    dose_number: int
    administered_date: date
    next_due_date: Optional[date] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FirstAidIncidentCreate(BaseModel):
    student_id: UUID
    incident_description: str
    first_aid_given: str
    incident_date: str


class FirstAidIncidentOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    incident_description: str
    first_aid_given: str
    reporter_user_id: UUID
    incident_date: date
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WellbeingSurveyCreate(BaseModel):
    student_id: UUID
    mood_score: int
    stress_level: int
    notes: Optional[str] = None


class WellbeingSurveyOut(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    mood_score: int
    stress_level: int
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MedicalDirectoryCreate(BaseModel):
    contact_name: str
    specialty: Optional[str] = None
    phone: str
    hospital_name: Optional[str] = None
    address: Optional[str] = None


class MedicalDirectoryOut(BaseModel):
    id: UUID
    school_id: UUID
    contact_name: str
    specialty: Optional[str] = None
    phone: str
    hospital_name: Optional[str] = None
    address: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}



