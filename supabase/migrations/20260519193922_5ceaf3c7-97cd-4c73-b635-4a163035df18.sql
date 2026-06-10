
-- 1) Datesheet distribution: scheduling fields (additive)
ALTER TABLE public.exam_datesheet_distributions
  ADD COLUMN IF NOT EXISTS notify_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_edd_notify_pending
  ON public.exam_datesheet_distributions (notify_at)
  WHERE notified_at IS NULL AND notify_at IS NOT NULL;

-- 2) Processor: scheduled exam result publications
CREATE OR REPLACE FUNCTION public.process_scheduled_exam_publications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row record;
  _count int := 0;
  _title text;
  _body text;
  _t text;
BEGIN
  FOR _row IN
    SELECT erp.*, e.school_id AS exam_school, e.name AS exam_name
    FROM public.exam_result_publications erp
    JOIN public.exams e ON e.id = erp.exam_id
    WHERE erp.publish_at IS NOT NULL
      AND erp.publish_at <= now()
      AND COALESCE(erp.processed_at, 'epoch'::timestamptz) < erp.publish_at
  LOOP
    -- update the exam flag for exam-wide scope
    IF _row.scope = 'exam' THEN
      UPDATE public.exams
         SET result_published = _row.is_published,
             result_published_at = CASE WHEN _row.is_published THEN _row.publish_at ELSE NULL END
       WHERE id = _row.exam_id;
    END IF;

    _t := CASE WHEN _row.is_published THEN 'exam_result_published' ELSE 'exam_result_unpublished' END;
    _title := CASE WHEN _row.is_published THEN 'Results published: ' || _row.exam_name
                   ELSE 'Results withdrawn: ' || _row.exam_name END;
    _body := COALESCE(_row.notes,
      CASE WHEN _row.is_published THEN 'Results for ' || _row.exam_name || ' are now available.'
           ELSE 'Results for ' || _row.exam_name || ' have been temporarily withdrawn.' END);

    -- Notify affected recipients
    WITH affected AS (
      SELECT DISTINCT s.id, s.profile_id
      FROM public.students s
      LEFT JOIN public.student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
      WHERE s.school_id = _row.exam_school
        AND (
          _row.scope = 'exam'
          OR (_row.scope = 'section' AND se.class_section_id = _row.class_section_id)
          OR (_row.scope = 'student' AND s.id = _row.student_id)
        )
    ),
    recipients AS (
      SELECT profile_id AS uid FROM affected WHERE profile_id IS NOT NULL
      UNION
      SELECT sg.user_id FROM public.student_guardians sg
        JOIN affected a ON a.id = sg.student_id
        WHERE sg.user_id IS NOT NULL
      UNION
      SELECT ur.user_id FROM public.user_roles ur
        WHERE ur.school_id = _row.exam_school
          AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher')
    )
    INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id)
    SELECT _row.exam_school, uid, _t, _title, _body, 'exam', _row.exam_id FROM recipients;

    -- mark processed
    UPDATE public.exam_result_publications
       SET processed_at = now()
     WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;

-- Add processed_at if missing
ALTER TABLE public.exam_result_publications
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- 3) Processor: scheduled datesheet notifications
CREATE OR REPLACE FUNCTION public.process_scheduled_datesheet_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row record;
  _exam_name text;
  _student_label text;
  _count int := 0;
BEGIN
  FOR _row IN
    SELECT d.*
    FROM public.exam_datesheet_distributions d
    WHERE d.notified_at IS NULL
      AND d.notify_at IS NOT NULL
      AND d.notify_at <= now()
  LOOP
    SELECT name INTO _exam_name FROM public.exams WHERE id = _row.exam_id;
    SELECT (first_name || ' ' || last_name) INTO _student_label FROM public.students WHERE id = _row.student_id;

    INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id)
    SELECT _row.school_id, sg.user_id, 'exam_datesheet',
           'Datesheet ready: ' || COALESCE(_exam_name,''),
           'Download ' || COALESCE(_student_label,'your child') || '''s exam datesheet from the Datesheets section.',
           'exam', _row.exam_id
      FROM public.student_guardians sg
     WHERE sg.student_id = _row.student_id AND sg.user_id IS NOT NULL;

    UPDATE public.exam_datesheet_distributions SET notified_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;

-- 4) Schedule via pg_cron (every minute)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-exam-publications');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'process-scheduled-exam-publications', '* * * * *',
  $cron$ SELECT public.process_scheduled_exam_publications(); $cron$
);

DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-datesheet-notifications');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'process-scheduled-datesheet-notifications', '* * * * *',
  $cron$ SELECT public.process_scheduled_datesheet_notifications(); $cron$
);
