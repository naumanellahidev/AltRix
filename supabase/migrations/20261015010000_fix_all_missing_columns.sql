-- SQL Migration to fix all missing columns and tables across all AltRix ERP modules

-- 1. Create cleared_conversations table if not exists
CREATE TABLE IF NOT EXISTS public.cleared_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  partner_user_id uuid NOT NULL,
  cleared_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(school_id, user_id, partner_user_id)
);

-- 2. Create fee_reminders table if not exists
CREATE TABLE IF NOT EXISTS public.fee_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.finance_invoices(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Create ai_timetable_suggestions table if not exists
CREATE TABLE IF NOT EXISTS public.ai_timetable_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_section_id uuid NOT NULL,
  suggestion_data jsonb NOT NULL,
  optimization_score numeric(5,2),
  conflicts_found jsonb,
  status text NOT NULL DEFAULT 'draft',
  version_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  approved_by uuid
);

-- 4. Create parent_notification_preferences table if not exists
CREATE TABLE IF NOT EXISTS public.parent_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  notify_absent boolean NOT NULL DEFAULT true,
  notify_late boolean NOT NULL DEFAULT true,
  notify_grades boolean NOT NULL DEFAULT true,
  notify_homework boolean NOT NULL DEFAULT true,
  low_grade_threshold numeric(5,2) DEFAULT 50.00,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, student_id)
);

-- 5. Create timetable_period_logs table if not exists
CREATE TABLE IF NOT EXISTS public.timetable_period_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  timetable_entry_id uuid NOT NULL,
  teacher_user_id uuid NOT NULL,
  topic_covered text,
  notes text,
  logged_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 6. Create audit_logs table if not exists
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  entity_type text,
  resource_id text,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- 7. Create school_bootstrap table if not exists
CREATE TABLE IF NOT EXISTS public.school_bootstrap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid UNIQUE NOT NULL,
  locked boolean DEFAULT false,
  bootstrapped_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 8. Alter Students table columns
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_section_id uuid REFERENCES public.class_sections(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS created_by uuid;

-- 9. Alter User Roles table columns
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS end_date date;

-- 10. Alter Complaints table columns
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS rating integer;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS rating_comment text;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS attachments jsonb;

-- 11. Alter Student Marks table columns
ALTER TABLE public.student_marks ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.student_marks ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
ALTER TABLE public.student_marks ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;
ALTER TABLE public.student_marks ADD COLUMN IF NOT EXISTS assessment_date date;
ALTER TABLE public.student_marks ADD COLUMN IF NOT EXISTS max_marks numeric(10,2);
ALTER TABLE public.student_marks ADD COLUMN IF NOT EXISTS sender_user_id uuid;

-- 12. Alter Finance Invoices table columns
ALTER TABLE public.finance_invoices ADD COLUMN IF NOT EXISTS late_fee_total numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.finance_invoices ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.finance_invoices ADD COLUMN IF NOT EXISTS instructions text;

-- 13. Alter Timetable Entries and Teacher Assignments columns
ALTER TABLE public.timetable_entries ADD COLUMN IF NOT EXISTS teacher_id uuid;
ALTER TABLE public.teacher_subject_assignments ADD COLUMN IF NOT EXISTS teacher_id uuid;

-- 14. Alter HR Staff Attendance columns
ALTER TABLE public.hr_staff_attendance ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.hr_staff_attendance ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

-- 15. Alter HR Leave Requests columns
ALTER TABLE public.hr_leave_requests ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;
ALTER TABLE public.hr_leave_requests ADD COLUMN IF NOT EXISTS max_days integer;

-- 16. Alter HR Payslips columns
ALTER TABLE public.hr_payslips ADD COLUMN IF NOT EXISTS total_gross numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.hr_payslips ADD COLUMN IF NOT EXISTS generated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.hr_payslips ADD COLUMN IF NOT EXISTS total_deductions numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.hr_payslips ADD COLUMN IF NOT EXISTS total_net numeric(12,2) NOT NULL DEFAULT 0;

-- 17. Alter Fee Invoices columns
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS waiver numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS "Waiver" numeric(12,2) NOT NULL DEFAULT 0;

-- 18. Alter Fee Voucher Batches columns
ALTER TABLE public.fee_voucher_batches ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2);
ALTER TABLE public.fee_voucher_batches ADD COLUMN IF NOT EXISTS "sectionId" uuid;
ALTER TABLE public.fee_voucher_batches ADD COLUMN IF NOT EXISTS min_grade text;

-- 19. Alter School Branding columns
ALTER TABLE public.school_branding ADD COLUMN IF NOT EXISTS latitude numeric(10,8);
ALTER TABLE public.school_branding ADD COLUMN IF NOT EXISTS longitude numeric(11,8);
ALTER TABLE public.school_branding ADD COLUMN IF NOT EXISTS altitude numeric(10,2);

-- 20. Align Scheduled Messages Table (Rename and Add columns)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'scheduled_messages' 
      AND column_name = 'scheduled_for'
  ) AND NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'scheduled_messages' 
      AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE public.scheduled_messages RENAME COLUMN scheduled_for TO scheduled_at;
  END IF;
END $$;

ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'admin';
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS attachment_urls text[] DEFAULT '{}'::text[];
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS error_message text;

-- 21. Create Triggers for Timetable teacher_id <-> teacher_user_id sync
CREATE OR REPLACE FUNCTION public.sync_timetable_entries_teacher()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.teacher_id IS NULL AND NEW.teacher_user_id IS NOT NULL THEN
      NEW.teacher_id := NEW.teacher_user_id;
    ELSIF NEW.teacher_user_id IS NULL AND NEW.teacher_id IS NOT NULL THEN
      NEW.teacher_user_id := NEW.teacher_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
      NEW.teacher_user_id := NEW.teacher_id;
    ELSIF NEW.teacher_user_id IS DISTINCT FROM OLD.teacher_user_id THEN
      NEW.teacher_id := NEW.teacher_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_timetable_entries_teacher ON public.timetable_entries;
CREATE TRIGGER trg_sync_timetable_entries_teacher
BEFORE INSERT OR UPDATE ON public.timetable_entries
FOR EACH ROW
EXECUTE FUNCTION public.sync_timetable_entries_teacher();


CREATE OR REPLACE FUNCTION public.sync_teacher_subject_assignments_teacher()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.teacher_id IS NULL AND NEW.teacher_user_id IS NOT NULL THEN
      NEW.teacher_id := NEW.teacher_user_id;
    ELSIF NEW.teacher_user_id IS NULL AND NEW.teacher_id IS NOT NULL THEN
      NEW.teacher_user_id := NEW.teacher_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
      NEW.teacher_user_id := NEW.teacher_id;
    ELSIF NEW.teacher_user_id IS DISTINCT FROM OLD.teacher_user_id THEN
      NEW.teacher_id := NEW.teacher_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_teacher_subject_assignments_teacher ON public.teacher_subject_assignments;
CREATE TRIGGER trg_sync_teacher_subject_assignments_teacher
BEFORE INSERT OR UPDATE ON public.teacher_subject_assignments
FOR EACH ROW
EXECUTE FUNCTION public.sync_teacher_subject_assignments_teacher();

-- 22. Enable Row Level Security (RLS) on newly created tables
ALTER TABLE public.cleared_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_timetable_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_period_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_bootstrap ENABLE ROW LEVEL SECURITY;

-- 23. Create basic RLS Policies for new tables
DROP POLICY IF EXISTS "Users can view own cleared conversations" ON public.cleared_conversations;
CREATE POLICY "Users can view own cleared conversations" ON public.cleared_conversations 
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can clear conversations" ON public.cleared_conversations;
CREATE POLICY "Users can clear conversations" ON public.cleared_conversations 
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can undelete conversations" ON public.cleared_conversations;
CREATE POLICY "Users can undelete conversations" ON public.cleared_conversations 
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "School members can view fee reminders" ON public.fee_reminders;
CREATE POLICY "School members can view fee reminders" ON public.fee_reminders 
  FOR SELECT USING (true); -- Or check via is_school_member if function exists

DROP POLICY IF EXISTS "School members can manage fee reminders" ON public.fee_reminders;
CREATE POLICY "School members can manage fee reminders" ON public.fee_reminders 
  FOR ALL USING (true);

DROP POLICY IF EXISTS "School members can view AI timetable suggestions" ON public.ai_timetable_suggestions;
CREATE POLICY "School members can view AI timetable suggestions" ON public.ai_timetable_suggestions 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "School members can manage AI timetable suggestions" ON public.ai_timetable_suggestions;
CREATE POLICY "School members can manage AI timetable suggestions" ON public.ai_timetable_suggestions 
  FOR ALL USING (true);

DROP POLICY IF EXISTS "Users can manage own notification preferences" ON public.parent_notification_preferences;
CREATE POLICY "Users can manage own notification preferences" ON public.parent_notification_preferences 
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "School members can view timetable period logs" ON public.timetable_period_logs;
CREATE POLICY "School members can view timetable period logs" ON public.timetable_period_logs 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "School members can manage timetable period logs" ON public.timetable_period_logs;
CREATE POLICY "School members can manage timetable period logs" ON public.timetable_period_logs 
  FOR ALL USING (true);

DROP POLICY IF EXISTS "School members can view audit logs" ON public.audit_logs;
CREATE POLICY "School members can view audit logs" ON public.audit_logs 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "School members can manage audit logs" ON public.audit_logs;
CREATE POLICY "School members can manage audit logs" ON public.audit_logs 
  FOR ALL USING (true);

DROP POLICY IF EXISTS "School members can view school bootstrap" ON public.school_bootstrap;
CREATE POLICY "School members can view school bootstrap" ON public.school_bootstrap 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "School members can manage school bootstrap" ON public.school_bootstrap;
CREATE POLICY "School members can manage school bootstrap" ON public.school_bootstrap 
  FOR ALL USING (true);

-- 24. Recreate View public.student_fee_ledger
DROP VIEW IF EXISTS public.student_fee_ledger;
CREATE VIEW public.student_fee_ledger 
WITH (security_invoker = true) AS
SELECT 
  s.id AS student_id,
  s.school_id,
  s.first_name,
  s.last_name,
  s.student_code,
  COALESCE(inv.total_invoiced, 0) AS total_invoiced,
  COALESCE(pay.total_paid, 0) AS total_paid,
  COALESCE(inv.total_invoiced, 0) - COALESCE(pay.total_paid, 0) AS outstanding_balance,
  COALESCE(inv.invoice_count, 0) AS invoice_count,
  COALESCE(pay.payment_count, 0) AS payment_count,
  COALESCE(inv.overdue_amount, 0) AS overdue_amount,
  COALESCE(inv.overdue_count, 0) AS overdue_count
FROM public.students s
LEFT JOIN LATERAL (
  SELECT 
    SUM(fi.total) AS total_invoiced,
    COUNT(fi.id) AS invoice_count,
    SUM(CASE WHEN fi.status = 'overdue' OR (fi.status != 'paid' AND fi.due_date < CURRENT_DATE) THEN fi.total ELSE 0 END) AS overdue_amount,
    COUNT(CASE WHEN fi.status = 'overdue' OR (fi.status != 'paid' AND fi.due_date < CURRENT_DATE) THEN 1 END) AS overdue_count
  FROM public.finance_invoices fi
  WHERE fi.student_id = s.id AND fi.school_id = s.school_id
) inv ON true
LEFT JOIN LATERAL (
  SELECT 
    SUM(fp.amount) AS total_paid,
    COUNT(fp.id) AS payment_count
  FROM public.finance_payments fp
  JOIN public.finance_invoices fi ON fi.id = fp.invoice_id
  WHERE fi.student_id = s.id AND fp.school_id = s.school_id
) pay ON true;

-- 25. Grant Select access to the view
GRANT SELECT ON public.student_fee_ledger TO authenticated;

-- 26. Notify schema cache reload
NOTIFY pgrst, 'reload schema';
