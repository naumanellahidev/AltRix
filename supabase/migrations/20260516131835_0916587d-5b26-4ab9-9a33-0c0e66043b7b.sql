CREATE OR REPLACE FUNCTION public.list_existing_school_owners()
RETURNS TABLE(user_id uuid, email text, display_name text, school_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH owners AS (
    SELECT a.owner_user_id AS uid FROM public.school_owner_assignments a
    UNION
    SELECT r.user_id AS uid FROM public.user_roles r WHERE r.role = 'school_owner'
  ),
  counts AS (
    SELECT o.uid, COUNT(DISTINCT a.school_id)::int AS school_count
    FROM owners o
    LEFT JOIN public.school_owner_assignments a ON a.owner_user_id = o.uid
    GROUP BY o.uid
  )
  SELECT
    c.uid AS user_id,
    u.email::text AS email,
    COALESCE(p.display_name, u.email)::text AS display_name,
    c.school_count
  FROM counts c
  JOIN auth.users u ON u.id = c.uid
  LEFT JOIN public.profiles p ON p.id = c.uid
  ORDER BY display_name NULLS LAST;
END $$;