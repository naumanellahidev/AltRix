CREATE OR REPLACE FUNCTION public.is_campus_member(_user_id uuid, _campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _campus_id IS NULL OR EXISTS (
    SELECT 1 FROM public.campuses c
    WHERE c.id = _campus_id
      AND (
        public.is_platform_admin(_user_id)
        OR EXISTS (SELECT 1 FROM public.school_owner_assignments a
                   WHERE a.owner_user_id = _user_id AND a.school_id = c.school_id)
        OR EXISTS (SELECT 1 FROM public.user_roles r
                   WHERE r.user_id = _user_id AND r.school_id = c.school_id
                     AND r.role IN ('school_owner','super_admin','principal','vice_principal','academic_coordinator','hr_manager','school_admin','accountant','teacher'))
        OR EXISTS (SELECT 1 FROM public.staff_campus_assignments sca
                   WHERE sca.user_id = _user_id AND sca.campus_id = _campus_id)
        OR EXISTS (SELECT 1 FROM public.students st
                   JOIN public.student_guardians sg ON sg.student_id = st.id
                   WHERE sg.user_id = _user_id AND st.campus_id = _campus_id)
        OR EXISTS (
          SELECT 1 FROM public.section_subjects ss
          JOIN public.class_sections cs ON cs.id = ss.class_section_id
          WHERE ss.teacher_user_id = _user_id AND cs.campus_id = _campus_id
        )
        OR EXISTS (
          SELECT 1 FROM public.teacher_subject_assignments tsa
          JOIN public.class_sections cs ON cs.id = tsa.class_section_id
          WHERE tsa.teacher_user_id = _user_id AND cs.campus_id = _campus_id
        )
      )
  );
$function$;