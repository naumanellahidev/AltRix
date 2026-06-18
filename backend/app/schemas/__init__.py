"""
Pydantic schemas for all API request/response models.
"""
from datetime import datetime, date
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


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
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


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
    due_date: Optional[str] = None
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
    due_date: Optional[str] = None
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


