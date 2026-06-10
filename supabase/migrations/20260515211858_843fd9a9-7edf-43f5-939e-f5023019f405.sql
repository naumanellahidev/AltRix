
-- =========================================================
-- Phase 3 Wave A: add campus_id columns + backfill
-- =========================================================

ALTER TABLE public.attendance_entries     ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.attendance_sessions    ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.fee_invoices           ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.fee_payments           ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.academic_assessments   ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.student_marks          ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.assignments            ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.behavior_notes         ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.complaints             ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.app_notifications      ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.admin_messages         ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.report_cards           ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_entries_campus    ON public.attendance_entries(campus_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_campus   ON public.attendance_sessions(campus_id);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_campus          ON public.fee_invoices(campus_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_campus          ON public.fee_payments(campus_id);
CREATE INDEX IF NOT EXISTS idx_academic_assessments_campus  ON public.academic_assessments(campus_id);
CREATE INDEX IF NOT EXISTS idx_student_marks_campus         ON public.student_marks(campus_id);
CREATE INDEX IF NOT EXISTS idx_assignments_campus           ON public.assignments(campus_id);
CREATE INDEX IF NOT EXISTS idx_behavior_notes_campus        ON public.behavior_notes(campus_id);
CREATE INDEX IF NOT EXISTS idx_complaints_campus            ON public.complaints(campus_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_campus     ON public.app_notifications(campus_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_campus        ON public.admin_messages(campus_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_campus          ON public.report_cards(campus_id);

-- Backfill from related rows
UPDATE public.attendance_entries e SET campus_id = s.campus_id
  FROM public.students s WHERE s.id = e.student_id AND e.campus_id IS NULL AND s.campus_id IS NOT NULL;
UPDATE public.attendance_sessions a SET campus_id = cs.campus_id
  FROM public.class_sections cs WHERE cs.id = a.class_section_id AND a.campus_id IS NULL AND cs.campus_id IS NOT NULL;
UPDATE public.fee_invoices i SET campus_id = s.campus_id
  FROM public.students s WHERE s.id = i.student_id AND i.campus_id IS NULL AND s.campus_id IS NOT NULL;
UPDATE public.fee_payments p SET campus_id = s.campus_id
  FROM public.students s WHERE s.id = p.student_id AND p.campus_id IS NULL AND s.campus_id IS NOT NULL;
UPDATE public.academic_assessments aa SET campus_id = cs.campus_id
  FROM public.class_sections cs WHERE cs.id = aa.class_section_id AND aa.campus_id IS NULL AND cs.campus_id IS NOT NULL;
UPDATE public.student_marks m SET campus_id = s.campus_id
  FROM public.students s WHERE s.id = m.student_id AND m.campus_id IS NULL AND s.campus_id IS NOT NULL;
UPDATE public.assignments a SET campus_id = cs.campus_id
  FROM public.class_sections cs WHERE cs.id = a.class_section_id AND a.campus_id IS NULL AND cs.campus_id IS NOT NULL;
UPDATE public.behavior_notes b SET campus_id = s.campus_id
  FROM public.students s WHERE s.id = b.student_id AND b.campus_id IS NULL AND s.campus_id IS NOT NULL;
UPDATE public.complaints c SET campus_id = s.campus_id
  FROM public.students s WHERE s.id = c.student_id AND c.campus_id IS NULL AND s.campus_id IS NOT NULL;
UPDATE public.report_cards r SET campus_id = s.campus_id
  FROM public.students s WHERE s.id = r.student_id AND r.campus_id IS NULL AND s.campus_id IS NOT NULL;

-- Auto-populate trigger functions
CREATE OR REPLACE FUNCTION public.set_campus_from_student()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.campus_id IS NULL AND NEW.student_id IS NOT NULL THEN
    SELECT campus_id INTO NEW.campus_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_campus_from_class_section()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.campus_id IS NULL AND NEW.class_section_id IS NOT NULL THEN
    SELECT campus_id INTO NEW.campus_id FROM public.class_sections WHERE id = NEW.class_section_id;
  END IF;
  RETURN NEW;
END $$;

-- Triggers (drop+create idempotent)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'attendance_entries','fee_invoices','fee_payments','student_marks','behavior_notes','complaints','report_cards'
  ]) AS t LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_campus ON public.%I', r.t, r.t);
    EXECUTE format('CREATE TRIGGER trg_%I_set_campus BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_campus_from_student()', r.t, r.t);
  END LOOP;

  FOR r IN SELECT unnest(ARRAY[
    'attendance_sessions','academic_assessments','assignments'
  ]) AS t LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_campus ON public.%I', r.t, r.t);
    EXECUTE format('CREATE TRIGGER trg_%I_set_campus BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_campus_from_class_section()', r.t, r.t);
  END LOOP;
END $$;

-- =========================================================
-- Phase 3 Wave B: restrictive per-campus read policies
-- (PERMISSIVE existing policies stay; RESTRICTIVE adds AND-gate)
-- =========================================================

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'attendance_entries','attendance_sessions','fee_invoices','fee_payments',
    'academic_assessments','student_marks','assignments','behavior_notes',
    'complaints','app_notifications','admin_messages','report_cards'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Campus scope read" ON public.%I', r);
    EXECUTE format($f$
      CREATE POLICY "Campus scope read" ON public.%I
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING (campus_id IS NULL OR public.is_campus_member(auth.uid(), campus_id))
    $f$, r);
  END LOOP;
END $$;
