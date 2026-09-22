-- A student is in one class at a time.
--
-- Nothing said so, and production has a student with two open enrolments. That
-- one row is enough to break several screens at once: the class lists show the
-- child twice, attendance can be taken for them in two sections, the report
-- card's class line depends on which enrolment happens to be read first, and
-- the promotion run would try to move them up out of two classes.
--
-- The older of each pair is closed - not deleted, because an enrolment is a
-- record of where a child actually sat - and a partial unique index stops it
-- happening again.
--
-- Idempotent: the update only touches rows that are still duplicated, and the
-- index is created IF NOT EXISTS.

BEGIN;

-- Close every open enrolment except the newest one for that student.
UPDATE public.student_enrollments e
   SET end_date = COALESCE(e.end_date, CURRENT_DATE)
  FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY student_id
                   ORDER BY start_date DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
               ) AS rank
          FROM public.student_enrollments
         WHERE end_date IS NULL
       ) AS ranked
 WHERE ranked.id = e.id
   AND ranked.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_enrollments_one_open
    ON public.student_enrollments (student_id)
    WHERE end_date IS NULL;

COMMIT;
