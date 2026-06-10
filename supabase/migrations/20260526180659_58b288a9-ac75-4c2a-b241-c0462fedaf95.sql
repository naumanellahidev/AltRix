-- 1) Security-definer helper: who can edit attendance
CREATE OR REPLACE FUNCTION public.can_edit_attendance(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','teacher')
  )
  OR EXISTS (
    SELECT 1 FROM public.platform_super_admins
    WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_attendance(uuid) TO authenticated;

-- 2) attendance_sessions write policies
DROP POLICY IF EXISTS "Staff write attendance_sessions"  ON public.attendance_sessions;
DROP POLICY IF EXISTS "Staff update attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Staff delete attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "Editors write attendance_sessions"
ON public.attendance_sessions
FOR INSERT TO authenticated
WITH CHECK (public.can_edit_attendance(school_id));

CREATE POLICY "Editors update attendance_sessions"
ON public.attendance_sessions
FOR UPDATE TO authenticated
USING (public.can_edit_attendance(school_id))
WITH CHECK (public.can_edit_attendance(school_id));

CREATE POLICY "Editors delete attendance_sessions"
ON public.attendance_sessions
FOR DELETE TO authenticated
USING (public.can_edit_attendance(school_id));

-- 3) attendance_entries write policies
DROP POLICY IF EXISTS "Staff write attendance_entries"  ON public.attendance_entries;
DROP POLICY IF EXISTS "Staff update attendance_entries" ON public.attendance_entries;
DROP POLICY IF EXISTS "Staff delete attendance_entries" ON public.attendance_entries;

CREATE POLICY "Editors write attendance_entries"
ON public.attendance_entries
FOR INSERT TO authenticated
WITH CHECK (public.can_edit_attendance(school_id));

CREATE POLICY "Editors update attendance_entries"
ON public.attendance_entries
FOR UPDATE TO authenticated
USING (public.can_edit_attendance(school_id))
WITH CHECK (public.can_edit_attendance(school_id));

CREATE POLICY "Editors delete attendance_entries"
ON public.attendance_entries
FOR DELETE TO authenticated
USING (public.can_edit_attendance(school_id));