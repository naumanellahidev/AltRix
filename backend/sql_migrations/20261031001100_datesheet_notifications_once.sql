-- ============================================================================
-- A datesheet is announced to each person once.
--
-- insert_exam_datesheet_notifications() inserted a fresh notification for
-- every parent, teacher and administrator each time a datesheet was sent, so
-- sending it again (or once per section) stacked identical "Datesheet ready"
-- notices: a school owner had four of the same one.
--
-- The function now skips anyone who still has the same notice unread. Notices
-- already duplicated are archived, not deleted: the earliest of each stays.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.insert_exam_datesheet_notifications(_exam_id uuid, _class_section_id uuid DEFAULT NULL::uuid)
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
  ),
  parent_notes AS (
    SELECT pr.user_id, pr.campus_id,
           'Download ' || COALESCE(NULLIF(pr.student_label,''),'your child') || '''s exam datesheet from the Datesheets section.' AS body
    FROM parent_rows pr
  )
  INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
  SELECT _school_id, pn.user_id, 'exam_datesheet',
         'Datesheet ready: ' || COALESCE(_exam_name,''),
         pn.body, 'exam', _exam_id, pn.campus_id
  FROM parent_notes pn
  WHERE NOT EXISTS (
    SELECT 1 FROM public.app_notifications x
    WHERE x.user_id = pn.user_id AND x.type = 'exam_datesheet' AND x.entity_id = _exam_id
      AND x.body = pn.body AND x.read_at IS NULL AND x.archived_at IS NULL
  );
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
  ),
  teacher_notes AS (
    SELECT d.user_id, d.campus_id,
           CASE WHEN _section_label IS NULL
             THEN 'Exam datesheets are ready for your assigned classes.'
             ELSE 'Exam datesheet is ready for ' || _section_label || '.'
           END AS body
    FROM dedup d
  )
  INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
  SELECT _school_id, tn.user_id, 'exam_datesheet',
         'Datesheet ready: ' || COALESCE(_exam_name,''),
         tn.body, 'exam', _exam_id, tn.campus_id
  FROM teacher_notes tn
  WHERE NOT EXISTS (
    SELECT 1 FROM public.app_notifications x
    WHERE x.user_id = tn.user_id AND x.type = 'exam_datesheet' AND x.entity_id = _exam_id
      AND x.body = tn.body AND x.read_at IS NULL AND x.archived_at IS NULL
  );
  GET DIAGNOSTICS _n = ROW_COUNT;
  _count := _count + _n;

  WITH admin_rows AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.school_id = _school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator')
  ),
  admin_notes AS (
    SELECT ar.user_id,
           CASE WHEN _section_label IS NULL
             THEN 'Exam datesheets have been sent to the concerned parents and teachers.'
             ELSE 'Exam datesheet for ' || _section_label || ' has been sent to the concerned parents and teachers.'
           END AS body
    FROM admin_rows ar
  )
  INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, campus_id)
  SELECT _school_id, an.user_id, 'exam_datesheet',
         'Datesheet ready: ' || COALESCE(_exam_name,''),
         an.body, 'exam', _exam_id, NULL
  FROM admin_notes an
  WHERE NOT EXISTS (
    SELECT 1 FROM public.app_notifications x
    WHERE x.user_id = an.user_id AND x.type = 'exam_datesheet' AND x.entity_id = _exam_id
      AND x.body = an.body AND x.read_at IS NULL AND x.archived_at IS NULL
  );
  GET DIAGNOSTICS _n = ROW_COUNT;
  _count := _count + _n;

  RETURN _count;
END;
$function$;

-- Duplicates already sent: keep the earliest unread one of each, archive the rest.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, type, entity_id, body ORDER BY created_at, id) AS rn
  FROM public.app_notifications
  WHERE type = 'exam_datesheet' AND read_at IS NULL AND archived_at IS NULL
)
UPDATE public.app_notifications n
SET archived_at = now()
FROM ranked r
WHERE n.id = r.id AND r.rn > 1;

COMMIT;
