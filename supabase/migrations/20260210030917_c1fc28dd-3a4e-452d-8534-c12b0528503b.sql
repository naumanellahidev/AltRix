-- can_manage_students: principal, vice_principal, super_admin, school_owner, academic_coordinator
CREATE OR REPLACE FUNCTION public.can_manage_students(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','academic_coordinator')
  );
$$;

-- can_manage_staff: principal, vice_principal, super_admin, school_owner, hr_manager
CREATE OR REPLACE FUNCTION public.can_manage_staff(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','hr_manager')
  );
$$;

-- can_work_crm: marketing_staff, principal, super_admin, school_owner
CREATE OR REPLACE FUNCTION public.can_work_crm(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','marketing_staff')
  );
$$;

-- can_manage_finance: accountant, principal, super_admin, school_owner
CREATE OR REPLACE FUNCTION public.can_manage_finance(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','accountant')
  );
$$;

NOTIFY pgrst, 'reload schema';