-- ============================================================================
-- A hall ticket is valid only for an exam of the student's own school.
--
-- verify_exam_hall_ticket looked the student and the exam up separately and
-- never compared their schools, so a card combining a student with another
-- school's exam verified as genuine. Everything else is unchanged.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_exam_hall_ticket(_exam_id uuid, _student_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student record;
  v_school record;
  v_exam record;
  v_papers json;
BEGIN
  SELECT id, first_name, last_name, student_code, profile_image_url, school_id
    INTO v_student
    FROM public.students
   WHERE id = _student_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Student not found');
  END IF;

  SELECT id, name, logo_url, motto, address, phone, email
    INTO v_school
    FROM public.schools
   WHERE id = v_student.school_id;

  SELECT id, name, start_date, end_date
    INTO v_exam
    FROM public.exams
   WHERE id = _exam_id AND school_id = v_student.school_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'This exam does not belong to the student''s school');
  END IF;

  SELECT json_agg(json_build_object(
           'id', es.id,
           'exam_date', es.exam_date,
           'start_time', es.start_time,
           'duration_minutes', es.duration_minutes,
           'room', es.room,
           'subject_id', es.subject_id,
           'subject_name', s.name,
           'class_section_id', es.class_section_id,
           'section_name', cs.name,
           'class_name', ac.name))
    INTO v_papers
    FROM public.exam_subjects es
    JOIN public.student_enrollments se ON se.class_section_id = es.class_section_id
    JOIN public.subjects s ON s.id = es.subject_id
    JOIN public.class_sections cs ON cs.id = es.class_section_id
    JOIN public.academic_classes ac ON ac.id = cs.class_id
   WHERE se.student_id = _student_id
     AND es.exam_id = _exam_id
     AND se.end_date IS NULL;

  RETURN json_build_object(
    'success', true,
    'student', row_to_json(v_student),
    'school', row_to_json(v_school),
    'exam', row_to_json(v_exam),
    'papers', COALESCE(v_papers, '[]'::json)
  );
END;
$function$;

COMMIT;
