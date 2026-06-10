
ALTER TABLE public.teacher_period_presence
  ADD COLUMN IF NOT EXISTS reason text;

CREATE TABLE IF NOT EXISTS public.teacher_presence_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_user_id uuid NOT NULL,
  timetable_entry_id uuid NOT NULL,
  period_date date NOT NULL,
  changed_by_user_id uuid,
  old_status text,
  new_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_presence_audit_school_date_idx
  ON public.teacher_presence_audit (school_id, period_date DESC, created_at DESC);

ALTER TABLE public.teacher_presence_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members insert their own audit rows"
  ON public.teacher_presence_audit
  FOR INSERT
  WITH CHECK (
    public.is_school_member(auth.uid(), school_id)
  );

CREATE POLICY "Admins view audit"
  ON public.teacher_presence_audit
  FOR SELECT
  USING (
    public.has_role(auth.uid(), school_id, 'principal')
    OR public.has_role(auth.uid(), school_id, 'vice_principal')
    OR public.has_role(auth.uid(), school_id, 'school_owner')
    OR public.has_role(auth.uid(), school_id, 'super_admin')
    OR public.has_role(auth.uid(), school_id, 'academic_coordinator')
    OR public.is_platform_admin(auth.uid())
    OR teacher_user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.log_teacher_presence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.reason IS NOT DISTINCT FROM NEW.reason THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.teacher_presence_audit (
    school_id, teacher_user_id, timetable_entry_id, period_date,
    changed_by_user_id, old_status, new_status, reason
  ) VALUES (
    NEW.school_id, NEW.teacher_user_id, NEW.timetable_entry_id, NEW.period_date,
    auth.uid(),
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    NEW.reason
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_teacher_presence_audit ON public.teacher_period_presence;
CREATE TRIGGER trg_teacher_presence_audit
  AFTER INSERT OR UPDATE ON public.teacher_period_presence
  FOR EACH ROW EXECUTE FUNCTION public.log_teacher_presence_change();

ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_presence_audit;
ALTER TABLE public.teacher_presence_audit REPLICA IDENTITY FULL;
