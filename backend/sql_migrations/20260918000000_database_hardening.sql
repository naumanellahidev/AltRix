-- ============================================================================
-- AltRix — database hardening
--
-- Three problems, all of which get worse as the product grows:
--
--   1. Tenant queries had no index. Every school-scoped read - which is
--      almost every read in the product, since the data proxy adds a
--      school_id filter to all of them - was a sequential scan. 67 of
--      120 tenant tables were affected (53 already had one).
--
--   2. Money and marks were stored as double precision. Binary floating
--      point cannot represent 1650.10, so three of them sum to
--      4950.299999999999 and `paid_amount >= total_amount` is false for a
--      fully paid invoice. The same arithmetic decides grade boundaries.
--
--   3. Nothing stopped duplicate attendance for one student in one
--      session, and invoice numbers were unique across ALL schools rather
--      than within one - so two schools could not both have INV-2026-001,
--      and the random fallback numbering collides at ~2,000 invoices.
--
-- Idempotent throughout: safe to re-run, and safe to apply to a database
-- that already has some of these.
-- ============================================================================

BEGIN;

-- ─── 1. Tenant indexes ──────────────────────────────────────────────────
--
-- Each index is created only if its table and column exist, so a database
-- that lacks one of these tables still migrates.
--
-- CONCURRENTLY is deliberately NOT used: it cannot run inside a
-- transaction, and these tables are small enough today that a brief lock
-- during a deploy window is the cheaper trade. On a large existing
-- database, run this section separately with CONCURRENTLY instead.

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'admin_messages' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_admin_messages_school_id ON public.admin_messages (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'admission_application_documents' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_admission_application_documents_school_id ON public.admission_application_documents (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_academic_predictions' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_academic_predictions_school_id ON public.ai_academic_predictions (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_cache_stats' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_cache_stats_school_id ON public.ai_cache_stats (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_career_suggestions' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_career_suggestions_school_id ON public.ai_career_suggestions (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_counseling_queue' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_counseling_queue_school_id ON public.ai_counseling_queue (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_parent_updates' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_parent_updates_school_id ON public.ai_parent_updates (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_school_reputation' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_school_reputation_school_id ON public.ai_school_reputation (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_semantic_cache' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_semantic_cache_school_id ON public.ai_semantic_cache (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'alumni_donations' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_alumni_donations_school_id ON public.alumni_donations (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'alumni_events' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_alumni_events_school_id ON public.alumni_events (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'alumni_profiles' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_alumni_profiles_school_id ON public.alumni_profiles (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'assessment_criteria' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_assessment_criteria_school_id ON public.assessment_criteria (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'assessment_lo_mappings' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_assessment_lo_mappings_school_id ON public.assessment_lo_mappings (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'assessment_results' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_assessment_results_school_id ON public.assessment_results (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'assignment_submissions' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_assignment_submissions_school_id ON public.assignment_submissions (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'behavior_notes' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_behavior_notes_school_id ON public.behavior_notes (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'book_issues' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_book_issues_school_id ON public.book_issues (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'book_reservations' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_book_reservations_school_id ON public.book_reservations (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'bus_routes' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_bus_routes_school_id ON public.bus_routes (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'campuses' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_campuses_school_id ON public.campuses (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'complaint_feedbacks' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_complaint_feedbacks_school_id ON public.complaint_feedbacks (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'criteria_scores' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_criteria_scores_school_id ON public.criteria_scores (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'curriculum_presets' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_curriculum_presets_school_id ON public.curriculum_presets (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'driver_profiles' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_driver_profiles_school_id ON public.driver_profiles (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'event_photos' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_event_photos_school_id ON public.event_photos (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'exam_datesheets' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_exam_datesheets_school_id ON public.exam_datesheets (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'exam_results' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_exam_results_school_id ON public.exam_results (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'exam_seating_plans' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_exam_seating_plans_school_id ON public.exam_seating_plans (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'fee_plan_items' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_fee_plan_items_school_id ON public.fee_plan_items (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'first_aid_incidents' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_first_aid_incidents_school_id ON public.first_aid_incidents (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'hostel_allocations' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_hostel_allocations_school_id ON public.hostel_allocations (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'hostel_attendance' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_hostel_attendance_school_id ON public.hostel_attendance (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'hostel_buildings' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_hostel_buildings_school_id ON public.hostel_buildings (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'hostel_mess_menu' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_hostel_mess_menu_school_id ON public.hostel_mess_menu (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'hostel_rooms' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_hostel_rooms_school_id ON public.hostel_rooms (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'infirmary_visit_logs' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_infirmary_visit_logs_school_id ON public.infirmary_visit_logs (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'installment_payments' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_installment_payments_school_id ON public.installment_payments (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'installment_plans' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_installment_plans_school_id ON public.installment_plans (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'inventory_categories' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_categories_school_id ON public.inventory_categories (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_items_school_id ON public.inventory_items (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'issued_certificates' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_issued_certificates_school_id ON public.issued_certificates (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'jazzcash_transactions' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_jazzcash_transactions_school_id ON public.jazzcash_transactions (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'library_books' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_library_books_school_id ON public.library_books (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'performance_improvement_plans' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_performance_improvement_plans_school_id ON public.performance_improvement_plans (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ptm_bookings' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ptm_bookings_school_id ON public.ptm_bookings (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ptm_slots' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_ptm_slots_school_id ON public.ptm_slots (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'report_card_templates' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_report_card_templates_school_id ON public.report_card_templates (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'school_branding' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_school_branding_school_id ON public.school_branding (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'school_events' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_school_events_school_id ON public.school_events (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'school_feature_flags' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_school_feature_flags_school_id ON public.school_feature_flags (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'school_id_card_settings' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_school_id_card_settings_school_id ON public.school_id_card_settings (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'school_inquiry_settings' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_school_inquiry_settings_school_id ON public.school_inquiry_settings (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'staff_appraisals' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_staff_appraisals_school_id ON public.staff_appraisals (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'staff_kpi_scores' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_staff_kpi_scores_school_id ON public.staff_kpi_scores (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'stock_transactions' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_stock_transactions_school_id ON public.stock_transactions (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'strand_assessments' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_strand_assessments_school_id ON public.strand_assessments (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'student_documents' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_student_documents_school_id ON public.student_documents (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'student_guardians' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_student_guardians_school_id ON public.student_guardians (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'student_medical_records' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_student_medical_records_school_id ON public.student_medical_records (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'student_transport_assignments' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_student_transport_assignments_school_id ON public.student_transport_assignments (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'tax_certificates' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_tax_certificates_school_id ON public.tax_certificates (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'teacher_feedback_360' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_teacher_feedback_360_school_id ON public.teacher_feedback_360 (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'transport_event_logs' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_transport_event_logs_school_id ON public.transport_event_logs (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'vaccination_records' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_vaccination_records_school_id ON public.vaccination_records (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_vehicles_school_id ON public.vehicles (school_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'white_label_settings' AND column_name = 'school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_white_label_settings_school_id ON public.white_label_settings (school_id);
    END IF;
END $$;

-- ─── 2. Exact decimal for money, marks and percentages ──────────────────
--
-- USING ... ::numeric rounds the stored double to the target scale, which
-- is what the value was always meant to be. Amounts already drifted by
-- fractions of a paisa land on the correct figure.
--
-- Deliberately NOT converted:
--   latitude / longitude / altitude  (schools, bus_stops, vehicles,
--       hr_staff_attendance) -- no exact comparison, no fixed scale
--   school_branding accent_* and radius_scale -- HSL values for CSS
--   ai_* and staff_kpi_scores -- statistical estimates, never a balance

-- money: fee_escalations
DO $$
BEGIN
    IF to_regclass('public.fee_escalations') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_escalations'
                     AND column_name='overdue_amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_escalations
                ALTER COLUMN overdue_amount TYPE NUMERIC(14, 2)
                USING ROUND(overdue_amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: fee_invoices
DO $$
BEGIN
    IF to_regclass('public.fee_invoices') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_invoices'
                     AND column_name='subtotal' AND data_type='double precision') THEN
            ALTER TABLE public.fee_invoices
                ALTER COLUMN subtotal TYPE NUMERIC(14, 2)
                USING ROUND(subtotal::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_invoices'
                     AND column_name='discount_amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_invoices
                ALTER COLUMN discount_amount TYPE NUMERIC(14, 2)
                USING ROUND(discount_amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_invoices'
                     AND column_name='sibling_discount_amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_invoices
                ALTER COLUMN sibling_discount_amount TYPE NUMERIC(14, 2)
                USING ROUND(sibling_discount_amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_invoices'
                     AND column_name='late_fee' AND data_type='double precision') THEN
            ALTER TABLE public.fee_invoices
                ALTER COLUMN late_fee TYPE NUMERIC(14, 2)
                USING ROUND(late_fee::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_invoices'
                     AND column_name='total_amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_invoices
                ALTER COLUMN total_amount TYPE NUMERIC(14, 2)
                USING ROUND(total_amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_invoices'
                     AND column_name='paid_amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_invoices
                ALTER COLUMN paid_amount TYPE NUMERIC(14, 2)
                USING ROUND(paid_amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_invoices'
                     AND column_name='merit_discount_amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_invoices
                ALTER COLUMN merit_discount_amount TYPE NUMERIC(14, 2)
                USING ROUND(merit_discount_amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: fee_payments
DO $$
BEGIN
    IF to_regclass('public.fee_payments') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_payments'
                     AND column_name='amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_payments
                ALTER COLUMN amount TYPE NUMERIC(14, 2)
                USING ROUND(amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: fee_plan_items
DO $$
BEGIN
    IF to_regclass('public.fee_plan_items') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='fee_plan_items'
                     AND column_name='amount' AND data_type='double precision') THEN
            ALTER TABLE public.fee_plan_items
                ALTER COLUMN amount TYPE NUMERIC(14, 2)
                USING ROUND(amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: hr_salary_records
DO $$
BEGIN
    IF to_regclass('public.hr_salary_records') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='hr_salary_records'
                     AND column_name='base_salary' AND data_type='double precision') THEN
            ALTER TABLE public.hr_salary_records
                ALTER COLUMN base_salary TYPE NUMERIC(14, 2)
                USING ROUND(base_salary::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='hr_salary_records'
                     AND column_name='allowances' AND data_type='double precision') THEN
            ALTER TABLE public.hr_salary_records
                ALTER COLUMN allowances TYPE NUMERIC(14, 2)
                USING ROUND(allowances::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='hr_salary_records'
                     AND column_name='deductions' AND data_type='double precision') THEN
            ALTER TABLE public.hr_salary_records
                ALTER COLUMN deductions TYPE NUMERIC(14, 2)
                USING ROUND(deductions::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: installment_payments
DO $$
BEGIN
    IF to_regclass('public.installment_payments') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='installment_payments'
                     AND column_name='amount' AND data_type='double precision') THEN
            ALTER TABLE public.installment_payments
                ALTER COLUMN amount TYPE NUMERIC(14, 2)
                USING ROUND(amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='installment_payments'
                     AND column_name='paid_amount' AND data_type='double precision') THEN
            ALTER TABLE public.installment_payments
                ALTER COLUMN paid_amount TYPE NUMERIC(14, 2)
                USING ROUND(paid_amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: installment_plans
DO $$
BEGIN
    IF to_regclass('public.installment_plans') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='installment_plans'
                     AND column_name='total_amount' AND data_type='double precision') THEN
            ALTER TABLE public.installment_plans
                ALTER COLUMN total_amount TYPE NUMERIC(14, 2)
                USING ROUND(total_amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='installment_plans'
                     AND column_name='installment_amount' AND data_type='double precision') THEN
            ALTER TABLE public.installment_plans
                ALTER COLUMN installment_amount TYPE NUMERIC(14, 2)
                USING ROUND(installment_amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: jazzcash_transactions
DO $$
BEGIN
    IF to_regclass('public.jazzcash_transactions') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='jazzcash_transactions'
                     AND column_name='amount' AND data_type='double precision') THEN
            ALTER TABLE public.jazzcash_transactions
                ALTER COLUMN amount TYPE NUMERIC(14, 2)
                USING ROUND(amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: payment_gateway_configs
DO $$
BEGIN
    IF to_regclass('public.payment_gateway_configs') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='payment_gateway_configs'
                     AND column_name='min_amount' AND data_type='double precision') THEN
            ALTER TABLE public.payment_gateway_configs
                ALTER COLUMN min_amount TYPE NUMERIC(14, 2)
                USING ROUND(min_amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='payment_gateway_configs'
                     AND column_name='max_amount' AND data_type='double precision') THEN
            ALTER TABLE public.payment_gateway_configs
                ALTER COLUMN max_amount TYPE NUMERIC(14, 2)
                USING ROUND(max_amount::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='payment_gateway_configs'
                     AND column_name='processing_fee_value' AND data_type='double precision') THEN
            ALTER TABLE public.payment_gateway_configs
                ALTER COLUMN processing_fee_value TYPE NUMERIC(14, 2)
                USING ROUND(processing_fee_value::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: sibling_discounts
DO $$
BEGIN
    IF to_regclass('public.sibling_discounts') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='sibling_discounts'
                     AND column_name='discount_value' AND data_type='double precision') THEN
            ALTER TABLE public.sibling_discounts
                ALTER COLUMN discount_value TYPE NUMERIC(14, 2)
                USING ROUND(discount_value::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: student_fee_assignments
DO $$
BEGIN
    IF to_regclass('public.student_fee_assignments') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='student_fee_assignments'
                     AND column_name='scholarship_amount' AND data_type='double precision') THEN
            ALTER TABLE public.student_fee_assignments
                ALTER COLUMN scholarship_amount TYPE NUMERIC(14, 2)
                USING ROUND(scholarship_amount::numeric, 2);
        END IF;
    END IF;
END $$;

-- money: tax_certificates
DO $$
BEGIN
    IF to_regclass('public.tax_certificates') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='tax_certificates'
                     AND column_name='total_fees_paid' AND data_type='double precision') THEN
            ALTER TABLE public.tax_certificates
                ALTER COLUMN total_fees_paid TYPE NUMERIC(14, 2)
                USING ROUND(total_fees_paid::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='tax_certificates'
                     AND column_name='total_tuition' AND data_type='double precision') THEN
            ALTER TABLE public.tax_certificates
                ALTER COLUMN total_tuition TYPE NUMERIC(14, 2)
                USING ROUND(total_tuition::numeric, 2);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='tax_certificates'
                     AND column_name='total_other_charges' AND data_type='double precision') THEN
            ALTER TABLE public.tax_certificates
                ALTER COLUMN total_other_charges TYPE NUMERIC(14, 2)
                USING ROUND(total_other_charges::numeric, 2);
        END IF;
    END IF;
END $$;

-- marks / percentage: academic_assessments
DO $$
BEGIN
    IF to_regclass('public.academic_assessments') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='academic_assessments'
                     AND column_name='max_marks' AND data_type='double precision') THEN
            ALTER TABLE public.academic_assessments
                ALTER COLUMN max_marks TYPE NUMERIC(8, 3)
                USING ROUND(max_marks::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='academic_assessments'
                     AND column_name='passing_marks' AND data_type='double precision') THEN
            ALTER TABLE public.academic_assessments
                ALTER COLUMN passing_marks TYPE NUMERIC(8, 3)
                USING ROUND(passing_marks::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='academic_assessments'
                     AND column_name='weightage_percent' AND data_type='double precision') THEN
            ALTER TABLE public.academic_assessments
                ALTER COLUMN weightage_percent TYPE NUMERIC(8, 3)
                USING ROUND(weightage_percent::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: assessment_criteria
DO $$
BEGIN
    IF to_regclass('public.assessment_criteria') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assessment_criteria'
                     AND column_name='max_score' AND data_type='double precision') THEN
            ALTER TABLE public.assessment_criteria
                ALTER COLUMN max_score TYPE NUMERIC(8, 3)
                USING ROUND(max_score::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: assessment_lo_mappings
DO $$
BEGIN
    IF to_regclass('public.assessment_lo_mappings') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assessment_lo_mappings'
                     AND column_name='weightage' AND data_type='double precision') THEN
            ALTER TABLE public.assessment_lo_mappings
                ALTER COLUMN weightage TYPE NUMERIC(8, 3)
                USING ROUND(weightage::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: assessment_results
DO $$
BEGIN
    IF to_regclass('public.assessment_results') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assessment_results'
                     AND column_name='marks_obtained' AND data_type='double precision') THEN
            ALTER TABLE public.assessment_results
                ALTER COLUMN marks_obtained TYPE NUMERIC(8, 3)
                USING ROUND(marks_obtained::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: assignment_submissions
DO $$
BEGIN
    IF to_regclass('public.assignment_submissions') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assignment_submissions'
                     AND column_name='marks_obtained' AND data_type='double precision') THEN
            ALTER TABLE public.assignment_submissions
                ALTER COLUMN marks_obtained TYPE NUMERIC(8, 3)
                USING ROUND(marks_obtained::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assignment_submissions'
                     AND column_name='marks' AND data_type='double precision') THEN
            ALTER TABLE public.assignment_submissions
                ALTER COLUMN marks TYPE NUMERIC(8, 3)
                USING ROUND(marks::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assignment_submissions'
                     AND column_name='marks_before_penalty' AND data_type='double precision') THEN
            ALTER TABLE public.assignment_submissions
                ALTER COLUMN marks_before_penalty TYPE NUMERIC(8, 3)
                USING ROUND(marks_before_penalty::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assignment_submissions'
                     AND column_name='penalty_applied' AND data_type='double precision') THEN
            ALTER TABLE public.assignment_submissions
                ALTER COLUMN penalty_applied TYPE NUMERIC(8, 3)
                USING ROUND(penalty_applied::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: assignments
DO $$
BEGIN
    IF to_regclass('public.assignments') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='assignments'
                     AND column_name='max_marks' AND data_type='double precision') THEN
            ALTER TABLE public.assignments
                ALTER COLUMN max_marks TYPE NUMERIC(8, 3)
                USING ROUND(max_marks::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: co_curricular_grades
DO $$
BEGIN
    IF to_regclass('public.co_curricular_grades') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='co_curricular_grades'
                     AND column_name='score' AND data_type='double precision') THEN
            ALTER TABLE public.co_curricular_grades
                ALTER COLUMN score TYPE NUMERIC(8, 3)
                USING ROUND(score::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='co_curricular_grades'
                     AND column_name='max_score' AND data_type='double precision') THEN
            ALTER TABLE public.co_curricular_grades
                ALTER COLUMN max_score TYPE NUMERIC(8, 3)
                USING ROUND(max_score::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: criteria_scores
DO $$
BEGIN
    IF to_regclass('public.criteria_scores') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='criteria_scores'
                     AND column_name='score' AND data_type='double precision') THEN
            ALTER TABLE public.criteria_scores
                ALTER COLUMN score TYPE NUMERIC(8, 3)
                USING ROUND(score::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: exam_datesheets
DO $$
BEGIN
    IF to_regclass('public.exam_datesheets') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='exam_datesheets'
                     AND column_name='max_marks' AND data_type='double precision') THEN
            ALTER TABLE public.exam_datesheets
                ALTER COLUMN max_marks TYPE NUMERIC(8, 3)
                USING ROUND(max_marks::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='exam_datesheets'
                     AND column_name='passing_marks' AND data_type='double precision') THEN
            ALTER TABLE public.exam_datesheets
                ALTER COLUMN passing_marks TYPE NUMERIC(8, 3)
                USING ROUND(passing_marks::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: exam_results
DO $$
BEGIN
    IF to_regclass('public.exam_results') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='exam_results'
                     AND column_name='marks_obtained' AND data_type='double precision') THEN
            ALTER TABLE public.exam_results
                ALTER COLUMN marks_obtained TYPE NUMERIC(8, 3)
                USING ROUND(marks_obtained::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='exam_results'
                     AND column_name='max_marks' AND data_type='double precision') THEN
            ALTER TABLE public.exam_results
                ALTER COLUMN max_marks TYPE NUMERIC(8, 3)
                USING ROUND(max_marks::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: exams
DO $$
BEGIN
    IF to_regclass('public.exams') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='exams'
                     AND column_name='passing_percentage' AND data_type='double precision') THEN
            ALTER TABLE public.exams
                ALTER COLUMN passing_percentage TYPE NUMERIC(8, 3)
                USING ROUND(passing_percentage::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: grade_boundaries
DO $$
BEGIN
    IF to_regclass('public.grade_boundaries') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='grade_boundaries'
                     AND column_name='min_percentage' AND data_type='double precision') THEN
            ALTER TABLE public.grade_boundaries
                ALTER COLUMN min_percentage TYPE NUMERIC(8, 3)
                USING ROUND(min_percentage::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='grade_boundaries'
                     AND column_name='max_percentage' AND data_type='double precision') THEN
            ALTER TABLE public.grade_boundaries
                ALTER COLUMN max_percentage TYPE NUMERIC(8, 3)
                USING ROUND(max_percentage::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='grade_boundaries'
                     AND column_name='gpa_equivalent' AND data_type='double precision') THEN
            ALTER TABLE public.grade_boundaries
                ALTER COLUMN gpa_equivalent TYPE NUMERIC(8, 3)
                USING ROUND(gpa_equivalent::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: grade_scales
DO $$
BEGIN
    IF to_regclass('public.grade_scales') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='grade_scales'
                     AND column_name='min_percentage' AND data_type='double precision') THEN
            ALTER TABLE public.grade_scales
                ALTER COLUMN min_percentage TYPE NUMERIC(8, 3)
                USING ROUND(min_percentage::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='grade_scales'
                     AND column_name='max_percentage' AND data_type='double precision') THEN
            ALTER TABLE public.grade_scales
                ALTER COLUMN max_percentage TYPE NUMERIC(8, 3)
                USING ROUND(max_percentage::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='grade_scales'
                     AND column_name='gpa_points' AND data_type='double precision') THEN
            ALTER TABLE public.grade_scales
                ALTER COLUMN gpa_points TYPE NUMERIC(8, 3)
                USING ROUND(gpa_points::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: hr_leave_requests
DO $$
BEGIN
    IF to_regclass('public.hr_leave_requests') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='hr_leave_requests'
                     AND column_name='days_count' AND data_type='double precision') THEN
            ALTER TABLE public.hr_leave_requests
                ALTER COLUMN days_count TYPE NUMERIC(8, 3)
                USING ROUND(days_count::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: report_card_subject_entries
DO $$
BEGIN
    IF to_regclass('public.report_card_subject_entries') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_card_subject_entries'
                     AND column_name='marks_obtained' AND data_type='double precision') THEN
            ALTER TABLE public.report_card_subject_entries
                ALTER COLUMN marks_obtained TYPE NUMERIC(8, 3)
                USING ROUND(marks_obtained::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_card_subject_entries'
                     AND column_name='max_marks' AND data_type='double precision') THEN
            ALTER TABLE public.report_card_subject_entries
                ALTER COLUMN max_marks TYPE NUMERIC(8, 3)
                USING ROUND(max_marks::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_card_subject_entries'
                     AND column_name='percentage' AND data_type='double precision') THEN
            ALTER TABLE public.report_card_subject_entries
                ALTER COLUMN percentage TYPE NUMERIC(8, 3)
                USING ROUND(percentage::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_card_subject_entries'
                     AND column_name='gpa_points' AND data_type='double precision') THEN
            ALTER TABLE public.report_card_subject_entries
                ALTER COLUMN gpa_points TYPE NUMERIC(8, 3)
                USING ROUND(gpa_points::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_card_subject_entries'
                     AND column_name='class_average' AND data_type='double precision') THEN
            ALTER TABLE public.report_card_subject_entries
                ALTER COLUMN class_average TYPE NUMERIC(8, 3)
                USING ROUND(class_average::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_card_subject_entries'
                     AND column_name='highest_in_class' AND data_type='double precision') THEN
            ALTER TABLE public.report_card_subject_entries
                ALTER COLUMN highest_in_class TYPE NUMERIC(8, 3)
                USING ROUND(highest_in_class::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: report_cards
DO $$
BEGIN
    IF to_regclass('public.report_cards') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_cards'
                     AND column_name='total_marks' AND data_type='double precision') THEN
            ALTER TABLE public.report_cards
                ALTER COLUMN total_marks TYPE NUMERIC(8, 3)
                USING ROUND(total_marks::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_cards'
                     AND column_name='max_total_marks' AND data_type='double precision') THEN
            ALTER TABLE public.report_cards
                ALTER COLUMN max_total_marks TYPE NUMERIC(8, 3)
                USING ROUND(max_total_marks::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_cards'
                     AND column_name='percentage' AND data_type='double precision') THEN
            ALTER TABLE public.report_cards
                ALTER COLUMN percentage TYPE NUMERIC(8, 3)
                USING ROUND(percentage::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_cards'
                     AND column_name='gpa' AND data_type='double precision') THEN
            ALTER TABLE public.report_cards
                ALTER COLUMN gpa TYPE NUMERIC(8, 3)
                USING ROUND(gpa::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='report_cards'
                     AND column_name='attendance_percentage' AND data_type='double precision') THEN
            ALTER TABLE public.report_cards
                ALTER COLUMN attendance_percentage TYPE NUMERIC(8, 3)
                USING ROUND(attendance_percentage::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: staff_appraisals
DO $$
BEGIN
    IF to_regclass('public.staff_appraisals') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='staff_appraisals'
                     AND column_name='salary_increment_pct' AND data_type='double precision') THEN
            ALTER TABLE public.staff_appraisals
                ALTER COLUMN salary_increment_pct TYPE NUMERIC(8, 3)
                USING ROUND(salary_increment_pct::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: strand_assessments
DO $$
BEGIN
    IF to_regclass('public.strand_assessments') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='strand_assessments'
                     AND column_name='score' AND data_type='double precision') THEN
            ALTER TABLE public.strand_assessments
                ALTER COLUMN score TYPE NUMERIC(8, 3)
                USING ROUND(score::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='strand_assessments'
                     AND column_name='max_score' AND data_type='double precision') THEN
            ALTER TABLE public.strand_assessments
                ALTER COLUMN max_score TYPE NUMERIC(8, 3)
                USING ROUND(max_score::numeric, 3);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='strand_assessments'
                     AND column_name='percentage' AND data_type='double precision') THEN
            ALTER TABLE public.strand_assessments
                ALTER COLUMN percentage TYPE NUMERIC(8, 3)
                USING ROUND(percentage::numeric, 3);
        END IF;
    END IF;
END $$;

-- marks / percentage: student_fee_assignments
DO $$
BEGIN
    IF to_regclass('public.student_fee_assignments') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='student_fee_assignments'
                     AND column_name='discount_pct' AND data_type='double precision') THEN
            ALTER TABLE public.student_fee_assignments
                ALTER COLUMN discount_pct TYPE NUMERIC(8, 3)
                USING ROUND(discount_pct::numeric, 3);
        END IF;
    END IF;
END $$;

-- ─── 3. Integrity constraints ───────────────────────────────────────────

-- One attendance row per student per session.
--
-- Without this a double-submit, a retry, or the offline queue syncing
-- twice creates duplicates, and attendance feeds report cards and parent
-- notifications. Existing duplicates are collapsed to the newest row
-- first, otherwise the constraint cannot be created.
DO $$
BEGIN
    IF to_regclass('public.attendance_entries') IS NOT NULL THEN
        DELETE FROM public.attendance_entries a
        USING public.attendance_entries b
        WHERE a.session_id = b.session_id
          AND a.student_id = b.student_id
          AND a.ctid < b.ctid;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_session_student
            ON public.attendance_entries (session_id, student_id);
    END IF;
END $$;

-- Invoice numbers are unique per school, not globally.
--
-- A global constraint meant two schools could not both issue
-- INV-2026-001, and the random six-digit fallback has a 89% chance of
-- colliding by 2,000 invoices platform-wide - each collision surfacing to
-- an accountant as a failed invoice.
DO $$
DECLARE
    conname text;
BEGIN
    IF to_regclass('public.fee_invoices') IS NULL THEN RETURN; END IF;

    FOR conname IN
        SELECT c.conname FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'fee_invoices' AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) = 'UNIQUE (invoice_number)'
    LOOP
        EXECUTE format('ALTER TABLE public.fee_invoices DROP CONSTRAINT %I', conname);
    END LOOP;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_invoices_school_number
        ON public.fee_invoices (school_id, invoice_number);
END $$;

-- Per-school invoice sequence, so numbering is contiguous and collision
-- free instead of random. Used by the invoice creation path.
CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
    school_id   UUID    NOT NULL,
    year        INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (school_id, year)
);

CREATE OR REPLACE FUNCTION public.next_invoice_number(_school_id UUID)
RETURNS TEXT AS $$
DECLARE
    yr  INTEGER := EXTRACT(YEAR FROM NOW());
    nxt INTEGER;
BEGIN
    -- ON CONFLICT ... RETURNING makes this atomic: two concurrent invoice
    -- creations cannot receive the same number.
    INSERT INTO public.invoice_number_sequences (school_id, year, last_number)
    VALUES (_school_id, yr, 1)
    ON CONFLICT (school_id, year)
    DO UPDATE SET last_number = invoice_number_sequences.last_number + 1
    RETURNING last_number INTO nxt;

    RETURN 'INV-' || yr || '-' || LPAD(nxt::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

COMMIT;
