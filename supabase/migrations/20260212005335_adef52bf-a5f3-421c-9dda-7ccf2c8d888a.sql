
-- Fix overly permissive RLS on student_guardians
DROP POLICY IF EXISTS "Principals can manage guardians" ON public.student_guardians;

CREATE POLICY "Principals can manage guardians" ON public.student_guardians
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('principal','vice_principal','school_admin','school_owner'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('principal','vice_principal','school_admin','school_owner'))
  );

-- Also allow parents to see their own guardian records
CREATE POLICY "Parents can view own guardian records" ON public.student_guardians
  FOR SELECT USING (user_id = auth.uid());
