-- ============================================================================
-- Student wellbeing: the fields the screen records, and the two lists it
-- keeps, have somewhere to live.
--
-- The screen saved medications and health-insurance details, a vaccine's next
-- due date, a first-aid incident's date and who reported it, and a doctor's
-- note on an infirmary visit. None of these had a column, so each was
-- silently dropped. Its "emergency medical contacts" and "wellness check-in"
-- lists had no table at all, and every save failed.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

-- The ids were only ever filled in by the ORM; a plain INSERT needs a default.
ALTER TABLE public.student_medical_records ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.infirmary_visit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.vaccination_records ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.first_aid_incidents ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.student_medical_records ADD COLUMN IF NOT EXISTS medications text;
ALTER TABLE public.student_medical_records ADD COLUMN IF NOT EXISTS health_insurance_info text;
-- One medical profile per student (the screen edits "the" profile).
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_medical_record
    ON public.student_medical_records (school_id, student_id);

ALTER TABLE public.vaccination_records ADD COLUMN IF NOT EXISTS next_due_date date;
ALTER TABLE public.vaccination_records ADD COLUMN IF NOT EXISTS recorded_by uuid;

ALTER TABLE public.first_aid_incidents ADD COLUMN IF NOT EXISTS incident_date date;
ALTER TABLE public.first_aid_incidents ADD COLUMN IF NOT EXISTS reporter_user_id uuid;

ALTER TABLE public.infirmary_visit_logs ADD COLUMN IF NOT EXISTS doctor_notes text;

CREATE TABLE IF NOT EXISTS public.school_medical_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  contact_name  text NOT NULL,
  specialty     text,
  phone         text NOT NULL,
  hospital_name text,
  address       text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_medical_contacts_school ON public.school_medical_contacts (school_id);

CREATE TABLE IF NOT EXISTS public.wellbeing_surveys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submitted_by  uuid,
  mood_score    smallint NOT NULL CHECK (mood_score BETWEEN 1 AND 10),
  stress_level  smallint NOT NULL CHECK (stress_level BETWEEN 1 AND 10),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wellbeing_surveys_school ON public.wellbeing_surveys (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wellbeing_surveys_student ON public.wellbeing_surveys (student_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'altrix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_medical_contacts, public.wellbeing_surveys TO altrix_app;
  END IF;
END
$$;

COMMIT;
