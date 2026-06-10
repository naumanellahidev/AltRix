-- Record-only HR staff directory (employees without a user account)
CREATE TABLE IF NOT EXISTS public.hr_staff_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  cnic text,
  address text,
  position text,
  department text,
  employment_type text,
  joining_date date,
  date_of_birth date,
  gender text,
  emergency_contact text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  -- once linked to an auth user, this employee record is treated as account-linked staff
  linked_user_id uuid,
  linked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_directory TO authenticated;
GRANT ALL ON public.hr_staff_directory TO service_role;

ALTER TABLE public.hr_staff_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view directory entries"
ON public.hr_staff_directory FOR SELECT TO authenticated
USING (public.can_manage_hr(school_id) OR public.is_school_admin(school_id));

CREATE POLICY "HR can insert directory entries"
ON public.hr_staff_directory FOR INSERT TO authenticated
WITH CHECK (public.can_manage_hr(school_id));

CREATE POLICY "HR can update directory entries"
ON public.hr_staff_directory FOR UPDATE TO authenticated
USING (public.can_manage_hr(school_id));

CREATE POLICY "HR can delete directory entries"
ON public.hr_staff_directory FOR DELETE TO authenticated
USING (public.can_manage_hr(school_id));

CREATE INDEX IF NOT EXISTS idx_hr_staff_dir_school ON public.hr_staff_directory(school_id);
CREATE INDEX IF NOT EXISTS idx_hr_staff_dir_active ON public.hr_staff_directory(school_id, is_active);

CREATE TRIGGER trg_hr_staff_dir_updated
BEFORE UPDATE ON public.hr_staff_directory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();