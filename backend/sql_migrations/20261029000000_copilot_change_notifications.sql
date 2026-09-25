-- ============================================================================
-- Tell the app when a school's records change, whoever changed them.
--
-- The Copilot reads its figures live and then watches the tables behind the
-- answer, so it can say "the figures have changed since — ask again". Change
-- events used to be published only by the generic data proxy, so a payment
-- recorded, attendance marked or an invoice raised through the app's own
-- endpoints never reached it, and a stale figure looked current.
--
-- Now the database announces every committed write on these tables with
-- NOTIFY on channel `altrix_changes`: the table, the school and the kind of
-- change — never row data. Postgres delivers one notification per identical
-- payload per transaction, so marking attendance for forty students is one
-- event, not forty. Each API worker LISTENs and passes it to that school's
-- open sessions (app/websocket_manager.py).
--
-- Idempotent: safe to run more than once. Tables that do not exist are skipped.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.altrix_notify_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    sid text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        sid := OLD.school_id::text;
    ELSE
        sid := NEW.school_id::text;
    END IF;
    IF sid IS NOT NULL THEN
        PERFORM pg_notify(
            'altrix_changes',
            json_build_object('t', TG_TABLE_NAME, 's', sid, 'a', lower(TG_OP))::text
        );
    END IF;
    RETURN NULL;
END
$$;

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'admission_applications', 'alumni_profiles', 'assignments', 'attendance_entries',
        'attendance_sessions', 'behavior_notes', 'book_issues', 'bus_routes', 'class_sections',
        'complaints', 'crm_leads', 'diary_entries', 'exam_results', 'exams', 'fee_invoices',
        'fee_payments', 'finance_expenses', 'first_aid_incidents', 'holidays', 'homework',
        'hostel_rooms', 'hr_applicants', 'hr_contracts', 'hr_job_postings', 'hr_leave_requests',
        'hr_payslips', 'hr_salary_records', 'hr_staff_attendance', 'hr_staff_directory',
        'inventory_items', 'issued_certificates', 'library_books', 'notices', 'ptm_bookings',
        'report_cards', 'school_events', 'staff_appraisals', 'student_enrollments',
        'student_medical_records', 'student_transport_assignments', 'students', 'subjects',
        'teacher_assignments', 'timetable_entries', 'vehicles', 'visitor_passes'
    ]
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = 'public' AND c.table_name = tbl
              AND c.column_name = 'school_id' AND t.table_type = 'BASE TABLE'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_altrix_notify_change ON public.%I', tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_altrix_notify_change AFTER INSERT OR UPDATE OR DELETE '
                'ON public.%I FOR EACH ROW EXECUTE FUNCTION public.altrix_notify_change()', tbl);
        END IF;
    END LOOP;
END
$$;

COMMIT;
