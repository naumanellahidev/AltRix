
-- Helper: do two users share at least one school?
CREATE OR REPLACE FUNCTION public.shares_school(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships ma
    JOIN public.school_memberships mb ON mb.school_id = ma.school_id
    WHERE ma.user_id = _a AND mb.user_id = _b
  );
$$;

-- profiles: replace "view all" with self / same-school / platform admin
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view permitted profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR public.shares_school(auth.uid(), id)
);

-- app_notifications: only recipient and school admins/owners can read
DROP POLICY IF EXISTS "Members read app_notifications" ON public.app_notifications;
CREATE POLICY "Recipient or admin reads app_notifications"
ON public.app_notifications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), school_id, 'school_owner')
  OR public.has_role(auth.uid(), school_id, 'super_admin')
  OR public.has_role(auth.uid(), school_id, 'principal')
  OR public.has_role(auth.uid(), school_id, 'vice_principal')
);
