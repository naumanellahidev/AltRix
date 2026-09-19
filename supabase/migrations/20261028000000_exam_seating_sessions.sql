-- ============================================================================
-- Exam seating plans that the app can actually create.
--
-- A seating plan had to point at a row of the legacy `exam_datesheets` table,
-- which the app no longer writes (the datesheet lives in `exam_subjects`), so
-- no real plan could be generated. The screen covered that by inventing rooms,
-- plans and "Grade 9-A Candidate #3" students, and the parent and student
-- screens showed every child the same made-up seat.
--
-- Now a plan belongs to an exam and a sitting — a date, a start time and an
-- optional label ("Paper 1 — Mathematics") — with the legacy datesheet link
-- kept but optional. One student per seat, one seat per student per sitting.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

ALTER TABLE public.exam_seating_plans ALTER COLUMN datesheet_id DROP NOT NULL;
ALTER TABLE public.exam_seating_plans ADD COLUMN IF NOT EXISTS exam_date DATE;
ALTER TABLE public.exam_seating_plans ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE public.exam_seating_plans ADD COLUMN IF NOT EXISTS session_label TEXT;
ALTER TABLE public.exam_seating_plans ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_seat_per_plan
    ON public.exam_seat_assignments (seating_plan_id, row_num, col_num);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_student_per_plan
    ON public.exam_seat_assignments (seating_plan_id, student_id);
CREATE INDEX IF NOT EXISTS idx_exam_seating_plans_exam
    ON public.exam_seating_plans (exam_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_invigilator_per_plan
    ON public.exam_invigilators (seating_plan_id, staff_user_id);

COMMIT;
