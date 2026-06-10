CREATE OR REPLACE FUNCTION public.can_manage_exam_datesheet(_school_id uuid, _class_section_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = _school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = _school_id
      AND ur.role = 'teacher'
      AND _class_section_id IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.section_subjects ss
    WHERE ss.school_id = _school_id
      AND ss.teacher_user_id = auth.uid()
      AND (_class_section_id IS NULL OR ss.class_section_id = _class_section_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.teacher_subject_assignments tsa
    WHERE tsa.school_id = _school_id
      AND tsa.teacher_user_id = auth.uid()
      AND (_class_section_id IS NULL OR tsa.class_section_id = _class_section_id)
  );
$function$;

CREATE POLICY "Datesheet distributions insert by academic staff"
  ON public.exam_datesheet_distributions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_exam_datesheet(school_id, class_section_id));

CREATE POLICY "Datesheet distributions update by academic staff"
  ON public.exam_datesheet_distributions
  FOR UPDATE TO authenticated
  USING (public.can_manage_exam_datesheet(school_id, class_section_id))
  WITH CHECK (public.can_manage_exam_datesheet(school_id, class_section_id));

CREATE POLICY "datesheets insert by academic staff"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exam-datesheets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_manage_exam_datesheet(((storage.foldername(name))[1])::uuid, NULL)
  );

CREATE POLICY "datesheets update by academic staff"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'exam-datesheets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_manage_exam_datesheet(((storage.foldername(name))[1])::uuid, NULL)
  )
  WITH CHECK (
    bucket_id = 'exam-datesheets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_manage_exam_datesheet(((storage.foldername(name))[1])::uuid, NULL)
  );

CREATE OR REPLACE FUNCTION public.insert_exam_datesheet_notifications(_exam_id uuid, _class_section_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _school_id uuid;
  _exam_name text;
  _section_label text;
  _count integer := 0;
  _n integer := 0;
BEGIN
  SELECT e.school_id, e.name INTO _school_id, _exam_name
  FROM public.exams e
  WHERE e.id = _exam_id;

  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'exam not found';
  END IF;

  IF _class_section_id IS NOT NULL THEN
    SELECT concat_ws(' — ', ac.name, cs.name) INTO _section_label
    FROM public.class_sections cs
    LEFT JOIN public.academic_classes ac ON ac.id = cs.class_id
    WHERE cs.id = _class_section_id;
  END IF;

  WITH parent_rows AS (
    SELECT DISTINCT
      sg.user_id,
      st.campus_id,
      st.id AS student_id,
      trim(concat_ws(' ', st.first_name, st.last_name)) AS student_label
    FROM public.exam_datesheet_distributions d
    JOIN public.students st ON st.id = d.student_id
    JOIN public.student_guardians sg ON sg.student_id = d.student_id
    WHERE d.exam_id = _exam_id
      AND (_class_section_id IS NULL OR d.class_section_id = _class_section_id)
      AND sg.user_id IS NOT NULL
  )
  INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
  SELECT _school_id, pr.user_id, 'exam_datesheet',
         'Datesheet ready: ' || COALESCE(_exam_name,''),
         'Download ' || COALESCE(NULLIF(pr.student_label,''),'your child') || '''s exam datesheet from the Datesheets section.',
         'exam', _exam_id, pr.campus_id
  FROM parent_rows pr;
  GET DIAGNOSTICS _n = ROW_COUNT;
  _count := _count + _n;

  WITH scope_sections AS (
    SELECT DISTINCT d.class_section_id
    FROM public.exam_datesheet_distributions d
    WHERE d.exam_id = _exam_id
      AND d.class_section_id IS NOT NULL
      AND (_class_section_id IS NULL OR d.class_section_id = _class_section_id)
  ),
  teacher_rows AS (
    SELECT ss.teacher_user_id AS user_id, cs.campus_id, ss.class_section_id
    FROM public.section_subjects ss
    JOIN scope_sections sc ON sc.class_section_id = ss.class_section_id
    JOIN public.class_sections cs ON cs.id = ss.class_section_id
    WHERE ss.teacher_user_id IS NOT NULL
    UNION
    SELECT tsa.teacher_user_id AS user_id, cs.campus_id, tsa.class_section_id
    FROM public.teacher_subject_assignments tsa
    JOIN scope_sections sc ON sc.class_section_id = tsa.class_section_id
    JOIN public.class_sections cs ON cs.id = tsa.class_section_id
    WHERE tsa.teacher_user_id IS NOT NULL
    UNION
    SELECT es.invigilator_user_id AS user_id, cs.campus_id, es.class_section_id
    FROM public.exam_subjects es
    JOIN scope_sections sc ON sc.class_section_id = es.class_section_id
    JOIN public.class_sections cs ON cs.id = es.class_section_id
    WHERE es.exam_id = _exam_id AND es.invigilator_user_id IS NOT NULL
  ),
  dedup AS (
    SELECT DISTINCT ON (user_id) user_id, campus_id
    FROM teacher_rows
    WHERE user_id IS NOT NULL
    ORDER BY user_id, campus_id NULLS FIRST
  )
  INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
  SELECT _school_id, d.user_id, 'exam_datesheet',
         'Datesheet ready: ' || COALESCE(_exam_name,''),
         CASE WHEN _section_label IS NULL
           THEN 'Exam datesheets are ready for your assigned classes.'
           ELSE 'Exam datesheet is ready for ' || _section_label || '.'
         END,
         'exam', _exam_id, d.campus_id
  FROM dedup d;
  GET DIAGNOSTICS _n = ROW_COUNT;
  _count := _count + _n;

  WITH admin_rows AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.school_id = _school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator')
  )
  INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
  SELECT _school_id, ar.user_id, 'exam_datesheet',
         'Datesheet ready: ' || COALESCE(_exam_name,''),
         CASE WHEN _section_label IS NULL
           THEN 'Exam datesheets have been sent to the concerned parents and teachers.'
           ELSE 'Exam datesheet for ' || _section_label || ' has been sent to the concerned parents and teachers.'
         END,
         'exam', _exam_id, NULL
  FROM admin_rows ar;
  GET DIAGNOSTICS _n = ROW_COUNT;
  _count := _count + _n;

  RETURN _count;
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_exam_datesheet_notifications(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_exam_datesheet_notifications(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.insert_exam_datesheet_notifications(uuid, uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.notify_exam_datesheet_ready(_exam_id uuid, _class_section_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _school_id uuid;
BEGIN
  SELECT school_id INTO _school_id FROM public.exams WHERE id = _exam_id;
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'exam not found';
  END IF;
  IF NOT public.can_manage_exam_datesheet(_school_id, _class_section_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN public.insert_exam_datesheet_notifications(_exam_id, _class_section_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_exam_datesheet_ready(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_exam_result_publish(_exam_id uuid, _scope text, _is_published boolean, _section_id uuid DEFAULT NULL::uuid, _student_id uuid DEFAULT NULL::uuid, _message text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  WITH affected_students AS (
    SELECT DISTINCT s.id, s.campus_id, se.class_section_id
    FROM public.students s
    LEFT JOIN public.student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
    WHERE s.school_id = _school_id
      AND (
        _scope = 'exam'
        OR (_scope = 'section' AND se.class_section_id = _section_id)
        OR (_scope = 'student' AND s.id = _student_id)
      )
  ),
  affected_sections AS (
    SELECT DISTINCT class_section_id FROM affected_students WHERE class_section_id IS NOT NULL
  ),
  recipients AS (
    SELECT sg.user_id AS uid, a.campus_id
    FROM public.student_guardians sg
    JOIN affected_students a ON a.id = sg.student_id
    WHERE sg.user_id IS NOT NULL
    UNION
    SELECT ss.teacher_user_id AS uid, cs.campus_id
    FROM public.section_subjects ss
    JOIN affected_sections asec ON asec.class_section_id = ss.class_section_id
    JOIN public.class_sections cs ON cs.id = ss.class_section_id
    WHERE ss.teacher_user_id IS NOT NULL
    UNION
    SELECT tsa.teacher_user_id AS uid, cs.campus_id
    FROM public.teacher_subject_assignments tsa
    JOIN affected_sections asec ON asec.class_section_id = tsa.class_section_id
    JOIN public.class_sections cs ON cs.id = tsa.class_section_id
    WHERE tsa.teacher_user_id IS NOT NULL
    UNION
    SELECT ur.user_id AS uid, NULL::uuid AS campus_id
    FROM public.user_roles ur
    WHERE ur.school_id = _school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator')
  ),
  dedup AS (
    SELECT DISTINCT ON (uid) uid, campus_id
    FROM recipients
    WHERE uid IS NOT NULL
    ORDER BY uid, campus_id NULLS FIRST
  ),
  ins AS (
    INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
    SELECT _school_id, uid, _t, _title, _body, 'exam', _exam_id, campus_id FROM dedup
    RETURNING 1
  )
  SELECT COUNT(*) INTO _count FROM ins;

  RETURN _count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_scheduled_exam_publications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    WITH affected_students AS (
      SELECT DISTINCT s.id, s.campus_id, se.class_section_id
      FROM public.students s
      LEFT JOIN public.student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
      WHERE s.school_id = _row.exam_school
        AND (
          _row.scope = 'exam'
          OR (_row.scope = 'section' AND se.class_section_id = _row.class_section_id)
          OR (_row.scope = 'student' AND s.id = _row.student_id)
        )
    ),
    affected_sections AS (
      SELECT DISTINCT class_section_id FROM affected_students WHERE class_section_id IS NOT NULL
    ),
    recipients AS (
      SELECT sg.user_id AS uid, a.campus_id
      FROM public.student_guardians sg
      JOIN affected_students a ON a.id = sg.student_id
      WHERE sg.user_id IS NOT NULL
      UNION
      SELECT ss.teacher_user_id AS uid, cs.campus_id
      FROM public.section_subjects ss
      JOIN affected_sections asec ON asec.class_section_id = ss.class_section_id
      JOIN public.class_sections cs ON cs.id = ss.class_section_id
      WHERE ss.teacher_user_id IS NOT NULL
      UNION
      SELECT tsa.teacher_user_id AS uid, cs.campus_id
      FROM public.teacher_subject_assignments tsa
      JOIN affected_sections asec ON asec.class_section_id = tsa.class_section_id
      JOIN public.class_sections cs ON cs.id = tsa.class_section_id
      WHERE tsa.teacher_user_id IS NOT NULL
      UNION
      SELECT ur.user_id AS uid, NULL::uuid AS campus_id
      FROM public.user_roles ur
      WHERE ur.school_id = _row.exam_school
        AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator')
    ),
    dedup AS (
      SELECT DISTINCT ON (uid) uid, campus_id
      FROM recipients
      WHERE uid IS NOT NULL
      ORDER BY uid, campus_id NULLS FIRST
    )
    INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
    SELECT _row.exam_school, uid, _t, _title, _body, 'exam', _row.exam_id, campus_id FROM dedup;

    UPDATE public.exam_result_publications
       SET processed_at = now()
     WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_scheduled_datesheet_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _count int := 0;
BEGIN
  FOR _row IN
    SELECT d.exam_id, d.class_section_id, COUNT(*)::int AS row_count
    FROM public.exam_datesheet_distributions d
    WHERE d.notified_at IS NULL
      AND d.notify_at IS NOT NULL
      AND d.notify_at <= now()
    GROUP BY d.exam_id, d.class_section_id
  LOOP
    PERFORM public.insert_exam_datesheet_notifications(_row.exam_id, _row.class_section_id);

    UPDATE public.exam_datesheet_distributions d
       SET notified_at = now()
     WHERE d.exam_id = _row.exam_id
       AND d.notified_at IS NULL
       AND d.notify_at IS NOT NULL
       AND d.notify_at <= now()
       AND (d.class_section_id IS NOT DISTINCT FROM _row.class_section_id);

    _count := _count + _row.row_count;
  END LOOP;
  RETURN _count;
END;
$function$;