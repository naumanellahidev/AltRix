
-- Phase 1: Multi-school owner assignments + active context

-- 1. school_owner_assignments
CREATE TABLE IF NOT EXISTS public.school_owner_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_user_id, school_id)
);
CREATE INDEX IF NOT EXISTS idx_soa_owner ON public.school_owner_assignments(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_soa_school ON public.school_owner_assignments(school_id);

ALTER TABLE public.school_owner_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own assignments" ON public.school_owner_assignments;
CREATE POLICY "Owner reads own assignments" ON public.school_owner_assignments
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admin manages assignments" ON public.school_owner_assignments;
CREATE POLICY "Platform admin manages assignments" ON public.school_owner_assignments
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Backfill from existing user_roles where role = 'school_owner'
INSERT INTO public.school_owner_assignments (owner_user_id, school_id)
SELECT DISTINCT user_id, school_id
FROM public.user_roles
WHERE role = 'school_owner'
ON CONFLICT (owner_user_id, school_id) DO NOTHING;

-- 2. owner_active_context
CREATE TABLE IF NOT EXISTS public.owner_active_context (
  user_id uuid PRIMARY KEY,
  active_school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  active_campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_active_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User manages own context" ON public.owner_active_context;
CREATE POLICY "User manages own context" ON public.owner_active_context
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_owner_active_context()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_owner_active_context_touch ON public.owner_active_context;
CREATE TRIGGER trg_owner_active_context_touch BEFORE UPDATE ON public.owner_active_context
  FOR EACH ROW EXECUTE FUNCTION public.touch_owner_active_context();

-- 3. RPC: owner_schools()
CREATE OR REPLACE FUNCTION public.owner_schools()
RETURNS TABLE(id uuid, name text, slug text, logo_url text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.slug, s.logo_url, s.is_active
  FROM public.schools s
  WHERE s.is_active = true
    AND (
      public.is_platform_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.school_owner_assignments a
                 WHERE a.owner_user_id = auth.uid() AND a.school_id = s.id)
      OR EXISTS (SELECT 1 FROM public.user_roles r
                 WHERE r.user_id = auth.uid() AND r.school_id = s.id AND r.role = 'school_owner')
    )
  ORDER BY s.name;
$$;

-- 4. RPC: owner_campuses(_school_id)
CREATE OR REPLACE FUNCTION public.owner_campuses(_school_id uuid)
RETURNS TABLE(id uuid, school_id uuid, name text, code text, is_active boolean, principal_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.school_id, c.name, c.code, c.is_active, c.principal_user_id
  FROM public.campuses c
  WHERE c.school_id = _school_id
    AND (
      public.is_platform_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.school_owner_assignments a
                 WHERE a.owner_user_id = auth.uid() AND a.school_id = _school_id)
      OR public.is_school_member(auth.uid(), _school_id)
    )
  ORDER BY c.name;
$$;

-- 5. is_campus_member helper (used by Phase 3 RLS layering)
CREATE OR REPLACE FUNCTION public.is_campus_member(_user_id uuid, _campus_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _campus_id IS NULL OR EXISTS (
    SELECT 1 FROM public.campuses c
    WHERE c.id = _campus_id
      AND (
        public.is_platform_admin(_user_id)
        OR EXISTS (SELECT 1 FROM public.school_owner_assignments a
                   WHERE a.owner_user_id = _user_id AND a.school_id = c.school_id)
        OR EXISTS (SELECT 1 FROM public.user_roles r
                   WHERE r.user_id = _user_id AND r.school_id = c.school_id
                     AND r.role IN ('school_owner','super_admin','principal','vice_principal'))
        OR EXISTS (SELECT 1 FROM public.staff_campus_assignments sca
                   WHERE sca.user_id = _user_id AND sca.campus_id = _campus_id)
        OR EXISTS (SELECT 1 FROM public.students st
                   JOIN public.student_guardians sg ON sg.student_id = st.id
                   WHERE sg.user_id = _user_id AND st.campus_id = _campus_id)
      )
  );
$$;
