CREATE OR REPLACE FUNCTION public.get_school_staff_directory(_school_id uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, school_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sm.user_id, u.email::TEXT, COALESCE(p.display_name, u.email)::TEXT, sm.school_id
  FROM public.school_memberships sm
  JOIN auth.users u ON u.id = sm.user_id
  LEFT JOIN public.profiles p ON p.id = sm.user_id
  WHERE sm.school_id = _school_id
    AND is_school_member(auth.uid(), _school_id)
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = sm.user_id
        AND ur.school_id = _school_id
        AND ur.role NOT IN ('parent','student')
    )
  ORDER BY COALESCE(p.display_name, u.email) NULLS LAST;
$$;