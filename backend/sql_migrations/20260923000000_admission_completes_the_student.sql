-- Admission: finish the job it starts.
--
-- Idempotent.
--
-- Approving an application called convert_admission_to_student, which created
-- the student row and stopped there. Three things it left undone, all of them
-- visible to the school:
--
--   1. No enrolment. The form asks which class and section the child is
--      applying for, the function read that only to pick a fee plan, and the
--      child was then in no class at all - not on a register, not in a
--      report card run, not on a seating plan. Production has one student in
--      exactly that state.
--
--   2. No documents. Birth certificate, previous report, photographs - all
--      uploaded during admission, all left attached to the application. The
--      student's own record had none of them.
--
--   3. Half the particulars. The students table holds a blood group, medical
--      notes, an emergency contact, a town and an area and the child's own
--      phone; the application had nowhere to put any of them, so a school
--      that collected them on paper had to type them in again afterwards.
--
-- This adds the missing columns to the application, and rewrites the
-- conversion to carry everything across in one transaction.

BEGIN;

-- ── The particulars the students table can already hold ─────────────────────
ALTER TABLE public.admission_applications
  ADD COLUMN IF NOT EXISTS student_phone      text,
  ADD COLUMN IF NOT EXISTS city               text,
  ADD COLUMN IF NOT EXISTS area               text,
  ADD COLUMN IF NOT EXISTS blood_group        text,
  ADD COLUMN IF NOT EXISTS medical_notes      text,
  ADD COLUMN IF NOT EXISTS emergency_contact  text,
  ADD COLUMN IF NOT EXISTS admission_date     date,
  -- A second guardian is the common case, not the exception.
  ADD COLUMN IF NOT EXISTS guardian2_name     text,
  ADD COLUMN IF NOT EXISTS guardian2_phone    text,
  ADD COLUMN IF NOT EXISTS guardian2_relation text;

-- Documents carried from an application keep a pointer back to it, so the
-- carry-over can be repeated without duplicating rows.
ALTER TABLE public.student_documents
  ADD COLUMN IF NOT EXISTS source_application_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS student_documents_from_application_unique
  ON public.student_documents (student_id, source_application_id, file_url)
  WHERE source_application_id IS NOT NULL;

-- ── The conversion ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convert_admission_to_student(_application_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _app public.admission_applications%ROWTYPE;
  _student_id uuid; _parent_user_id uuid; _plan_id uuid;
  _section_id uuid;
  _session_id uuid;
  _due date := (CURRENT_DATE + INTERVAL '15 days')::date;
BEGIN
  SELECT * INTO _app FROM public.admission_applications WHERE id = _application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application not found'; END IF;
  IF NOT public.can_manage_admissions(_app.school_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _app.converted_student_id IS NOT NULL THEN RETURN _app.converted_student_id; END IF;

  -- The section the child was admitted into. When only a class was chosen,
  -- the child is placed in that class's single section if it has exactly one;
  -- with a choice to make, the office makes it, and the student is left
  -- unplaced rather than put in an arbitrary section.
  _section_id := _app.applying_for_section_id;
  IF _section_id IS NULL AND _app.applying_for_class_id IS NOT NULL THEN
    SELECT cs.id INTO _section_id
      FROM public.class_sections cs
     WHERE cs.class_id = _app.applying_for_class_id
       AND cs.school_id = _app.school_id
     HAVING count(*) = 1;
  END IF;

  INSERT INTO public.students (
    school_id, campus_id, first_name, last_name, date_of_birth, gender,
    profile_image_url, roll_number, student_code, registration_number,
    parent_name, parent_phone, parent_email, address,
    phone, city, area, blood_group, medical_notes, emergency_contact,
    admission_date, class_section_id, status, notes
  ) VALUES (
    _app.school_id, _app.campus_id, _app.first_name, _app.last_name, _app.date_of_birth, _app.gender,
    _app.photo_url, _app.roll_number, _app.registration_number, _app.registration_number,
    _app.parent_name, _app.parent_phone, _app.parent_email, _app.parent_address,
    _app.student_phone, _app.city, _app.area, _app.blood_group, _app.medical_notes, _app.emergency_contact,
    COALESCE(_app.admission_date, CURRENT_DATE), _section_id, 'enrolled', _app.notes
  ) RETURNING id INTO _student_id;

  -- ── The enrolment, which is what puts the child on a register ────────────
  IF _section_id IS NOT NULL THEN
    SELECT id INTO _session_id
      FROM public.academic_sessions
     WHERE school_id = _app.school_id AND is_current = true
     LIMIT 1;

    INSERT INTO public.student_enrollments (school_id, campus_id, student_id, class_section_id, start_date, session_id)
    VALUES (_app.school_id, _app.campus_id, _student_id, _section_id,
            COALESCE(_app.admission_date, CURRENT_DATE), _session_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── The guardians ────────────────────────────────────────────────────────
  IF _app.parent_name IS NOT NULL OR _app.parent_email IS NOT NULL OR _app.parent_phone IS NOT NULL THEN
    IF _app.parent_email IS NOT NULL THEN
      SELECT public.find_parent_user_by_email(_app.school_id, _app.parent_email) INTO _parent_user_id;
    END IF;
    -- Recorded whether or not a matching login exists: a guardian the school
    -- can telephone is worth having even before the parent has an account.
    INSERT INTO public.student_guardians
      (student_id, user_id, relationship, school_id, campus_id, full_name, email, phone, is_primary, is_emergency_contact)
    VALUES
      (_student_id, _parent_user_id, 'parent', _app.school_id, _app.campus_id,
       _app.parent_name, _app.parent_email, _app.parent_phone, true, true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF _app.guardian2_name IS NOT NULL OR _app.guardian2_phone IS NOT NULL THEN
    INSERT INTO public.student_guardians
      (student_id, relationship, school_id, campus_id, full_name, phone, is_primary, is_emergency_contact)
    VALUES
      (_student_id, COALESCE(_app.guardian2_relation, 'guardian'), _app.school_id, _app.campus_id,
       _app.guardian2_name, _app.guardian2_phone, false, false)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── The documents the family handed in ───────────────────────────────────
  INSERT INTO public.student_documents
    (school_id, campus_id, student_id, document_name, category, file_url, uploaded_by, source_application_id)
  SELECT
    d.school_id, d.campus_id, _student_id,
    COALESCE(d.file_name, 'Admission document'), 'admission', d.file_path,
    _app.submitted_by_user_id, _application_id
  FROM public.admission_application_documents d
  WHERE d.application_id = _application_id
  ON CONFLICT DO NOTHING;

  -- ── Fees ─────────────────────────────────────────────────────────────────
  IF _app.applying_for_class_id IS NOT NULL THEN
    SELECT id INTO _plan_id FROM public.fee_plans
      WHERE school_id = _app.school_id AND class_id = _app.applying_for_class_id AND is_active = true
      ORDER BY created_at DESC LIMIT 1;
    IF _plan_id IS NOT NULL THEN
      INSERT INTO public.student_fee_assignments (school_id, student_id, fee_plan_id)
      VALUES (_app.school_id, _student_id, _plan_id) ON CONFLICT DO NOTHING;
      PERFORM public.generate_invoice_for_student(_app.school_id, _student_id, _plan_id, 'Admission & first period', _due);
    END IF;
  END IF;

  UPDATE public.admission_applications
     SET status = 'approved', converted_student_id = _student_id, converted_at = now(),
         reviewed_by_user_id = auth.uid(), reviewed_at = now()
   WHERE id = _application_id;

  RETURN _student_id;
END
$function$;

COMMIT;
