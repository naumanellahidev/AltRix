ALTER TABLE public.schools 
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS altitude numeric;

DROP POLICY IF EXISTS "hr_staff_att_insert_self" ON public.hr_staff_attendance;
CREATE POLICY "hr_staff_att_insert_self" ON public.hr_staff_attendance FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "hr_staff_att_update_self" ON public.hr_staff_attendance;
CREATE POLICY "hr_staff_att_update_self" ON public.hr_staff_attendance FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());