CREATE TABLE IF NOT EXISTS public.hr_staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'present',
  clock_in timestamptz,
  clock_out timestamptz,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_staff_attendance_unique UNIQUE (school_id, user_id, attendance_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_attendance TO authenticated;
GRANT ALL ON public.hr_staff_attendance TO service_role;

ALTER TABLE public.hr_staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_staff_att_select" ON public.hr_staff_attendance FOR SELECT
  USING (public.can_manage_hr(school_id) OR user_id = auth.uid());

CREATE POLICY "hr_staff_att_insert" ON public.hr_staff_attendance FOR INSERT
  WITH CHECK (public.can_manage_hr(school_id));

CREATE POLICY "hr_staff_att_update" ON public.hr_staff_attendance FOR UPDATE
  USING (public.can_manage_hr(school_id))
  WITH CHECK (public.can_manage_hr(school_id));

CREATE POLICY "hr_staff_att_delete" ON public.hr_staff_attendance FOR DELETE
  USING (public.can_manage_hr(school_id));

CREATE INDEX IF NOT EXISTS idx_hr_staff_att_school_date ON public.hr_staff_attendance(school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_hr_staff_att_user ON public.hr_staff_attendance(user_id);

CREATE TRIGGER trg_hr_staff_att_updated_at
  BEFORE UPDATE ON public.hr_staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();