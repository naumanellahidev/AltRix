-- Give the report cards that already exist the subject lines they print.
--
-- report_card_subject_entries held no rows at all: the Report Cards screen
-- saved the card header and the exam results, but never the per-subject lines,
-- and the printed card reads exactly those lines. So every card came out of
-- the printer complete except for its marks, under the sentence "No subject
-- results have been recorded on this card".
--
-- The screen writes the lines from now on. This gives the cards already saved
-- the same lines, rebuilt from the exam results they were computed from, so
-- nobody has to open and re-save seven cards to print them.
--
-- Only exam cards can be rebuilt this way, and only where the card has no
-- lines at all: a card someone has since edited by hand is left exactly as it
-- is. Monthly and annual cards are computed from assessments rather than exam
-- results and are not touched — re-saving those writes their lines.
--
-- Idempotent: the insert is skipped for any card that already has entries, so
-- a re-run inserts nothing.

BEGIN;

-- The id column carries no default, which is why only the ORM (which makes
-- one in Python) could ever insert here. A plain SQL insert - this backfill,
-- or anything a DBA runs - failed on a not-null id, so the default is set
-- first and the column can stand on its own.
ALTER TABLE public.report_card_subject_entries
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

INSERT INTO public.report_card_subject_entries (
    id, report_card_id, subject_id, subject_name,
    marks_obtained, max_marks, percentage, grade, teacher_comment, sort_order
)
SELECT
    gen_random_uuid(),
    rc.id,
    er.subject_id,
    COALESCE(s.name, 'Subject'),
    er.marks_obtained,
    er.max_marks,
    CASE
        WHEN er.max_marks IS NOT NULL AND er.max_marks > 0 AND er.marks_obtained IS NOT NULL
        THEN ROUND((er.marks_obtained / er.max_marks) * 100, 2)
    END,
    er.grade,
    er.remarks,
    ROW_NUMBER() OVER (PARTITION BY rc.id ORDER BY COALESCE(s.name, 'Subject')) - 1
FROM public.report_cards rc
JOIN public.exam_results er
  ON er.exam_id = rc.exam_id
 AND er.student_id = rc.student_id
 AND er.school_id = rc.school_id
LEFT JOIN public.subjects s ON s.id = er.subject_id
WHERE rc.exam_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.report_card_subject_entries e
       WHERE e.report_card_id = rc.id
  );

COMMIT;
