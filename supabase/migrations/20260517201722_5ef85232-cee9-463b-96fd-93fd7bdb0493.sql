
CREATE TABLE IF NOT EXISTS public.teacher_period_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_user_id uuid NOT NULL,
  timetable_entry_id uuid NOT NULL,
  period_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL CHECK (status IN ('in_class','left','late')),
  entered_at timestamptz,
  left_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_period_presence_unique
  ON public.teacher_period_presence (school_id, teacher_user_id, timetable_entry_id, period_date);

CREATE INDEX IF NOT EXISTS teacher_period_presence_school_date_idx
  ON public.teacher_period_presence (school_id, period_date DESC);

ALTER TABLE public.teacher_period_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their own presence"
  ON public.teacher_period_presence
  FOR ALL
  USING (
    teacher_user_id = auth.uid()
    AND public.is_school_member(auth.uid(), school_id)
  )
  WITH CHECK (
    teacher_user_id = auth.uid()
    AND public.is_school_member(auth.uid(), school_id)
  );

CREATE POLICY "Admins view all presence"
  ON public.teacher_period_presence
  FOR SELECT
  USING (
    public.has_role(auth.uid(), school_id, 'principal')
    OR public.has_role(auth.uid(), school_id, 'vice_principal')
    OR public.has_role(auth.uid(), school_id, 'school_owner')
    OR public.has_role(auth.uid(), school_id, 'super_admin')
    OR public.has_role(auth.uid(), school_id, 'academic_coordinator')
    OR public.is_platform_admin(auth.uid())
  );

CREATE TRIGGER trg_teacher_period_presence_updated_at
  BEFORE UPDATE ON public.teacher_period_presence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_period_presence;
ALTER TABLE public.teacher_period_presence REPLICA IDENTITY FULL;
