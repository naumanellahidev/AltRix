-- Moving a school up a year.
--
-- There was no way to do it. `student_enrollments` holds a section and two
-- dates and nothing names the year, `academic_classes.grade_level` is null for
-- every class in production, and no table records that a child was promoted,
-- retained or graduated. So at the end of an annual session a school had to
-- re-enrol every student by hand, with no record of who decided what.
--
-- This adds the three things that were missing:
--
--   academic_sessions   the year itself ("2026-2027"), so an enrolment,
--                       a section and a promotion can all name it
--   promotion history   one row per child per year, with the outcome and who
--                       decided it, so a promotion can be explained and undone
--   class order         grade_level backfilled from the class name, plus an
--                       explicit next_class_id for schools whose progression
--                       is not simply "the next number"
--
-- Idempotent: every statement is guarded, so a re-run changes nothing.

BEGIN;

-- ── The academic year ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academic_sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    start_date  date,
    end_date    date,
    -- Exactly one session per school is the one in progress; the partial
    -- unique index below is what enforces it.
    is_current  boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_sessions_current
    ON public.academic_sessions (school_id)
    WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_academic_sessions_school
    ON public.academic_sessions (school_id);

-- ── Which year a section and an enrolment belong to ──────────────────────────

ALTER TABLE public.class_sections
    ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.academic_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.student_enrollments
    ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.academic_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_enrollments_session
    ON public.student_enrollments (session_id);

-- ── Where a class leads ──────────────────────────────────────────────────────

ALTER TABLE public.academic_classes
    ADD COLUMN IF NOT EXISTS next_class_id uuid REFERENCES public.academic_classes(id) ON DELETE SET NULL;

-- A class called "Class 7", "Grade 7" or "VII" is the seventh year. Only rows
-- with no grade_level at all are touched, so a school that has set its own
-- ordering keeps it.
UPDATE public.academic_classes
   SET grade_level = sub.level
  FROM (
        SELECT id,
               CASE
                   WHEN name ~* '(^|[^0-9])([0-9]{1,2})([^0-9]|$)'
                   THEN (regexp_match(name, '([0-9]{1,2})'))[1]::int
                   WHEN name ~* '\mnursery\M'     THEN 0
                   WHEN name ~* '\m(kg|k\.g)\M'   THEN 0
                   WHEN name ~* '\mprep\M'        THEN 0
               END AS level
          FROM public.academic_classes
         WHERE grade_level IS NULL
       ) AS sub
 WHERE public.academic_classes.id = sub.id
   AND sub.level IS NOT NULL;

-- ── What happened to each child at the end of a year ─────────────────────────

CREATE TABLE IF NOT EXISTS public.student_promotions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id              uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id             uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

    from_session_id        uuid REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
    to_session_id          uuid REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
    from_class_section_id  uuid REFERENCES public.class_sections(id) ON DELETE SET NULL,
    to_class_section_id    uuid REFERENCES public.class_sections(id) ON DELETE SET NULL,

    -- promoted   moved up a class
    -- retained   stays where they are
    -- graduated  left the school at the top of it
    outcome                text NOT NULL,
    -- The result the decision was based on, kept so the decision can be
    -- explained a year later even if the report card is edited afterwards.
    result_percentage      numeric(6, 2),
    note                   text,

    -- One run of the promotion screen, so a whole class can be undone together.
    batch_id               uuid NOT NULL,
    decided_by             uuid,
    decided_at             timestamptz NOT NULL DEFAULT now(),

    -- A child is promoted out of a given year once.
    UNIQUE (student_id, from_session_id)
);

CREATE INDEX IF NOT EXISTS idx_student_promotions_school ON public.student_promotions (school_id);
CREATE INDEX IF NOT EXISTS idx_student_promotions_batch  ON public.student_promotions (batch_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_promotions_outcome_check') THEN
        ALTER TABLE public.student_promotions
            ADD CONSTRAINT student_promotions_outcome_check
            CHECK (outcome IN ('promoted', 'retained', 'graduated'));
    END IF;
END $$;

-- ── Every school gets a session to stand in, so nothing starts undefined ─────

INSERT INTO public.academic_sessions (school_id, name, start_date, end_date, is_current)
SELECT s.id,
       CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
            THEN EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' || (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)
            ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::int
       END,
       NULL, NULL, true
  FROM public.schools s
 WHERE NOT EXISTS (SELECT 1 FROM public.academic_sessions a WHERE a.school_id = s.id);

-- Existing sections and open enrolments belong to that current session.
UPDATE public.class_sections cs
   SET session_id = a.id
  FROM public.academic_sessions a
 WHERE a.school_id = cs.school_id AND a.is_current AND cs.session_id IS NULL;

UPDATE public.student_enrollments se
   SET session_id = a.id
  FROM public.academic_sessions a
 WHERE a.school_id = se.school_id AND a.is_current
   AND se.session_id IS NULL AND se.end_date IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_sessions TO altrix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_promotions TO altrix_app;

COMMIT;
