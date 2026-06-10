"""
Models package — imports all ORM models so SQLAlchemy's metadata is populated.
"""
from app.models.core import (
    School, Profile, UserRole, SchoolMembership, SchoolBranding,
    PlatformSuperAdmin, PlatformBillingPlan,
)
from app.models.campus import Campus
from app.models.academic import (
    AcademicClass, ClassSection, Subject, ClassSectionSubject,
    TimetableSlot, AcademicAssessment, Holiday,
)
from app.models.people import Student, Guardian, TeacherProfile, TeacherSubjectAssignment
from app.models.admissions import AdmissionApplication, AdmissionApplicationDocument
from app.models.attendance import AttendanceSession, AttendanceEntry, StaffAttendance
from app.models.exams import Exam, ExamDatesheet, ExamResult, AssessmentResult
from app.models.finance import (
    FeeStructure, FeeComponent, FeeAllocation,
    FeeVoucher, FeePayment, PaymentTransaction,
)
from app.models.messaging import (
    AdminMessage, AdminMessageRecipient, AdminMessageReaction,
    AdminMessagePin, Notice,
)
from app.models.misc import (
    AppNotification, DiaryEntry,
    Complaint, ComplaintFeedback,
    Assignment, AssignmentSubmission,
    BehaviorNote,
    HrLeaveRequest, HrPayroll,
    AuditLog,
    AiAcademicPrediction, AiStudentProfile, AiEarlyWarning,
    AiTeacherPerformance, AiCounselingQueue, AiSchoolReputation,
    AiCareerSuggestion, AiParentUpdate,
)

__all__ = [
    "School", "Profile", "UserRole", "SchoolMembership", "SchoolBranding",
    "PlatformSuperAdmin", "PlatformBillingPlan",
    "Campus",
    "AcademicClass", "ClassSection", "Subject", "ClassSectionSubject",
    "TimetableSlot", "AcademicAssessment", "Holiday",
    "Student", "Guardian", "TeacherProfile", "TeacherSubjectAssignment",
    "AdmissionApplication", "AdmissionApplicationDocument",
    "AttendanceSession", "AttendanceEntry", "StaffAttendance",
    "Exam", "ExamDatesheet", "ExamResult", "AssessmentResult",
    "FeeStructure", "FeeComponent", "FeeAllocation",
    "FeeVoucher", "FeePayment", "PaymentTransaction",
    "AdminMessage", "AdminMessageRecipient", "AdminMessageReaction",
    "AdminMessagePin", "Notice",
    "AppNotification", "DiaryEntry",
    "Complaint", "ComplaintFeedback",
    "Assignment", "AssignmentSubmission",
    "BehaviorNote",
    "HrLeaveRequest", "HrPayroll",
    "AuditLog",
    "AiAcademicPrediction", "AiStudentProfile", "AiEarlyWarning",
    "AiTeacherPerformance", "AiCounselingQueue", "AiSchoolReputation",
    "AiCareerSuggestion", "AiParentUpdate",
]
