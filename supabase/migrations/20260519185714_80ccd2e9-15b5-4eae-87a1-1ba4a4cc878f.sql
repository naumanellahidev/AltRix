
-- Notify on publish/unpublish
CREATE OR REPLACE FUNCTION public.notify_exam_result_publish(
  _exam_id uuid,
  _scope text,
  _is_published boolean,
  _section_id uuid DEFAULT NULL,
  _student_id uuid DEFAULT NULL,
  _message text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _school_id uuid;
  _exam_name text;
  _title text;
  _body text;
  _count int := 0;
  _t text := CASE WHEN _is_published THEN 'exam_result_published' ELSE 'exam_result_unpublished' END;
BEGIN
  SELECT school_id, name INTO _school_id, _exam_name FROM public.exams WHERE id = _exam_id;
  IF _school_id IS NULL THEN RAISE EXCEPTION 'exam not found'; END IF;
  IF NOT public.can_publish_results(_school_id) THEN RAISE EXCEPTION 'not authorized'; END IF;

  _title := CASE WHEN _is_published THEN 'Results published: ' || _exam_name
                 ELSE 'Results withdrawn: ' || _exam_name END;
  _body := COALESCE(_message,
    CASE WHEN _is_published THEN 'Results for ' || _exam_name || ' are now available.'
         ELSE 'Results for ' || _exam_name || ' have been temporarily withdrawn.' END);

  -- Affected students (profile_id) + guardians
  WITH affected_students AS (
    SELECT DISTINCT s.id, s.profile_id
    FROM public.students s
    LEFT JOIN public.student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
    WHERE s.school_id = _school_id
      AND (
        _scope = 'exam'
        OR (_scope = 'section' AND se.class_section_id = _section_id)
        OR (_scope = 'student' AND s.id = _student_id)
      )
  ),
  recipients AS (
    SELECT profile_id AS uid FROM affected_students WHERE profile_id IS NOT NULL
    UNION
    SELECT sg.user_id FROM public.student_guardians sg
      JOIN affected_students a ON a.id = sg.student_id
      WHERE sg.user_id IS NOT NULL
    UNION
    -- staff
    SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.school_id = _school_id
        AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher')
  ),
  ins AS (
    INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id)
    SELECT _school_id, uid, _t, _title, _body, 'exam', _exam_id FROM recipients
    RETURNING 1
  )
  SELECT COUNT(*) INTO _count FROM ins;

  RETURN _count;
END $$;

-- Conflict checker for datesheet
CREATE OR REPLACE FUNCTION public.check_exam_subject_conflicts(_school_id uuid, _exam_id uuid)
RETURNS TABLE(
  a_id uuid, b_id uuid, conflict_type text,
  exam_date date, a_start time, a_end time, b_start time, b_end time,
  room text, invigilator_user_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH es AS (
    SELECT id, school_id, exam_date, start_time,
           (start_time + (COALESCE(duration_minutes,60) || ' minutes')::interval)::time AS end_time,
           room, invigilator_user_id
    FROM public.exam_subjects
    WHERE school_id = _school_id
      AND exam_date IS NOT NULL AND start_time IS NOT NULL
      AND (_exam_id IS NULL OR exam_id = _exam_id OR exam_id IN (
        SELECT id FROM public.exams WHERE school_id = _school_id
      ))
  )
  SELECT a.id, b.id, 'room',
         a.exam_date, a.start_time, a.end_time, b.start_time, b.end_time,
         a.room, NULL::uuid
  FROM es a JOIN es b ON a.id < b.id
  WHERE a.exam_date = b.exam_date
    AND a.room IS NOT NULL AND b.room IS NOT NULL
    AND lower(trim(a.room)) = lower(trim(b.room))
    AND a.start_time < b.end_time AND b.start_time < a.end_time
  UNION ALL
  SELECT a.id, b.id, 'invigilator',
         a.exam_date, a.start_time, a.end_time, b.start_time, b.end_time,
         NULL, a.invigilator_user_id
  FROM es a JOIN es b ON a.id < b.id
  WHERE a.exam_date = b.exam_date
    AND a.invigilator_user_id IS NOT NULL
    AND a.invigilator_user_id = b.invigilator_user_id
    AND a.start_time < b.end_time AND b.start_time < a.end_time;
$$;
