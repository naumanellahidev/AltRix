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
    TimetableSlot, AcademicAssessment, Holiday, TimetablePeriod,
)
from app.models.people import (
    Student, Guardian, TeacherProfile, TeacherSubjectAssignment,
    StudentEnrollment, TeacherAssignment, SchoolIdCardSettings,
)
from app.models.inquiry import SchoolInquirySettings
from app.models.admissions import AdmissionApplication, AdmissionApplicationDocument
from app.models.attendance import AttendanceSession, AttendanceEntry, StaffAttendance
from app.models.exams import Exam, ExamDatesheet, ExamResult, AssessmentResult
from app.models.finance import (
    FeeStructure, FeeComponent, FeeAllocation,
    FeeVoucher, FeePayment, PaymentTransaction,
    InstallmentPlan, InstallmentPayment, SiblingDiscount,
    TaxCertificate, FeeEscalation, PaymentGatewayConfig,
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
    AiSemanticCache, AiCacheStats,
    EventStore, EventSubscriberLog, ActivityTimeline,
)
from app.models.transport import (
    BusRoute, BusStop, Bus, BusStudentAssignment, BusLiveLocation,
)
from app.models.events import (
    SchoolEvent, EventPhoto, PTMSlot, PTMBooking,
    EventRSVP, SportsScorecard, AnnualFunctionPlan,
)
from app.models.report_cards import (
    ReportCardTemplate, ReportCard, ReportCardSubjectEntry,
    CoCurricularGrade, GradeScale,
)
from app.models.curriculum import (
    CurriculumPreset, LearningOutcome, AssessmentLOMapping,
    AssessmentCriteria, CriteriaScore, StrandAssessment, GradeBoundary,
)
from app.models.visitors import (
    VisitorPass, VisitorBlacklist,
)
from app.models.owner_insights import OwnerAiInsight
from app.models.documents import SchoolDocument, DocumentTemplate, IssuedCertificate
from app.models.exams import ExamRoom, ExamSeatingPlan, ExamSeatAssignment, ExamInvigilator

__all__ = [
    "School", "Profile", "UserRole", "SchoolMembership", "SchoolBranding",
    "PlatformSuperAdmin", "PlatformBillingPlan",
    "Campus",
    "AcademicClass", "ClassSection", "Subject", "ClassSectionSubject",
    "TimetableSlot", "AcademicAssessment", "Holiday", "TimetablePeriod",
    "Student", "Guardian", "TeacherProfile", "TeacherSubjectAssignment",
    "StudentEnrollment", "TeacherAssignment", "SchoolIdCardSettings", "SchoolInquirySettings",
    "AdmissionApplication", "AdmissionApplicationDocument",
    "AttendanceSession", "AttendanceEntry", "StaffAttendance",
    "Exam", "ExamDatesheet", "ExamResult", "AssessmentResult",
    "FeeStructure", "FeeComponent", "FeeAllocation",
    "FeeVoucher", "FeePayment", "PaymentTransaction",
    "InstallmentPlan", "InstallmentPayment", "SiblingDiscount",
    "TaxCertificate", "FeeEscalation", "PaymentGatewayConfig",
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
    "AiSemanticCache", "AiCacheStats",
    "EventStore", "EventSubscriberLog", "ActivityTimeline",
    "BusRoute", "BusStop", "Bus", "BusStudentAssignment", "BusLiveLocation",
    "SchoolEvent", "EventPhoto", "PTMSlot", "PTMBooking",
    "EventRSVP", "SportsScorecard", "AnnualFunctionPlan",
    "ReportCardTemplate", "ReportCard", "ReportCardSubjectEntry",
    "CoCurricularGrade", "GradeScale",
    "CurriculumPreset", "LearningOutcome", "AssessmentLOMapping",
    "AssessmentCriteria", "CriteriaScore", "StrandAssessment", "GradeBoundary",
    "VisitorPass", "VisitorBlacklist",
    "OwnerAiInsight",
    "SchoolDocument", "DocumentTemplate", "IssuedCertificate",
    "ExamRoom", "ExamSeatingPlan", "ExamSeatAssignment", "ExamInvigilator",
]
