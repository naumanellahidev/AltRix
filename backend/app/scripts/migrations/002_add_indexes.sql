-- AltRix Production: Performance Indexes
-- Run ONCE. All use CONCURRENTLY + IF NOT EXISTS — safe to re-run.
-- Generated: 2026-06-15

-- ─────────────────────────────────────────────────────────────────────────────
-- STUDENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_school_status
    ON students(school_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_campus
    ON students(campus_id) WHERE campus_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_registration
    ON students(registration_number) WHERE registration_number IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STUDENT_ENROLLMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_student
    ON student_enrollments(student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_section
    ON student_enrollments(class_section_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_school
    ON student_enrollments(school_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ATTENDANCE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_sessions_school_date
    ON attendance_sessions(school_id, session_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_sessions_section
    ON attendance_sessions(class_section_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_entries_session
    ON attendance_entries(session_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_entries_student
    ON attendance_entries(student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_entries_status
    ON attendance_entries(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- FEE INVOICES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_invoices_school_status
    ON fee_invoices(school_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_invoices_student
    ON fee_invoices(student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_invoices_due_date
    ON fee_invoices(due_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_invoices_campus
    ON fee_invoices(campus_id) WHERE campus_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- FEE PAYMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_payments_school_paid_at
    ON fee_payments(school_id, paid_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_payments_student
    ON fee_payments(student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_payments_invoice
    ON fee_payments(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- USER ROLES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_user_school
    ON user_roles(user_id, school_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_school_role
    ON user_roles(school_id, role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_campus
    ON user_roles(campus_id) WHERE campus_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- APP NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_school
    ON app_notifications(user_id, school_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread
    ON app_notifications(user_id, school_id, read_at)
    WHERE read_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_created
    ON app_notifications(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_school_date
    ON audit_logs(school_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user
    ON audit_logs(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action
    ON audit_logs(action);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_resource
    ON audit_logs(resource_type, resource_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignments_school_section
    ON assignments(school_id, class_section_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignment_submissions_assignment
    ON assignment_submissions(assignment_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignment_submissions_student
    ON assignment_submissions(student_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPLAINTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_school_status
    ON complaints(school_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_sender
    ON complaints(sender_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ACADEMIC CLASSES & SECTIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_sections_school
    ON class_sections(school_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_sections_campus
    ON class_sections(campus_id) WHERE campus_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_academic_classes_school
    ON academic_classes(school_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TEACHER ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teacher_assignments_teacher
    ON teacher_assignments(teacher_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teacher_assignments_section
    ON teacher_assignments(class_section_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- HR
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_leave_requests_school_user
    ON hr_leave_requests(school_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_salary_records_school_user
    ON hr_salary_records(school_id, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TOKEN BLACKLIST
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_blacklist_user
    ON token_blacklist(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_blacklist_expires
    ON token_blacklist(expires_at);
