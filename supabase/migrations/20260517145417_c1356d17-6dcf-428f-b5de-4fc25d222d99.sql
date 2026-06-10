-- Strict owner_schools that does NOT bypass for platform admins.
-- Used by the School Owner shell to ensure owners only see schools they actually own.
CREATE OR REPLACE FUNCTION public.owner_schools_strict()
RETURNS TABLE(id uuid, name text, slug text, logo_url text, is_active boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.slug, s.logo_url, s.is_active
  FROM public.schools s
  WHERE s.is_active = true
    AND (
      EXISTS (SELECT 1 FROM public.school_owner_assignments a
              WHERE a.owner_user_id = auth.uid() AND a.school_id = s.id)
      OR EXISTS (SELECT 1 FROM public.user_roles r
                 WHERE r.user_id = auth.uid() AND r.school_id = s.id AND r.role = 'school_owner')
    )
  ORDER BY s.name;
$function$;