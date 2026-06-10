-- Migration: Budget Scenarios for Principal Budget Forecast Simulator
CREATE TABLE public.budget_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  name text NOT NULL,
  data jsonb NOT NULL,   -- { lineItemId: number, amount: number }
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.budget_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "principal_read_scenario" ON public.budget_scenarios
  FOR SELECT USING (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "principal_insert_scenario" ON public.budget_scenarios
  FOR INSERT WITH CHECK (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "principal_update_scenario" ON public.budget_scenarios
  FOR UPDATE USING (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "principal_delete_scenario" ON public.budget_scenarios
  FOR DELETE USING (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()));
