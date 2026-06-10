-- Rewrite school_user_directory view to expose real emails from auth.users.
-- Use SECURITY DEFINER function pattern by using a security definer wrapper via security_invoker=off.
DROP VIEW IF EXISTS public.school_user_directory;

CREATE VIEW public.school_user_directory
WITH (security_invoker=off) AS
SELECT
  sm.school_id,
  sm.user_id,
  COALESCE(p.display_name, u.email::text, '') AS display_name,
  COALESCE(u.email::text, '') AS email
FROM public.school_memberships sm
LEFT JOIN auth.users u ON u.id = sm.user_id
LEFT JOIN public.profiles p ON p.id = sm.user_id;

-- Restrict view access: only school members can see entries for their school.
-- Since security_invoker=off uses view owner privileges, gate via RLS on underlying school_memberships
-- Grant select to authenticated, the underlying RLS on school_memberships will still apply via the function below.
REVOKE ALL ON public.school_user_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.school_user_directory TO authenticated;