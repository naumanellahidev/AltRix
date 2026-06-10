-- Revert to safe view (no auth.users exposure)
DROP VIEW IF EXISTS public.school_user_directory;

CREATE VIEW public.school_user_directory
WITH (security_invoker=on) AS
SELECT
  sm.school_id,
  sm.user_id,
  COALESCE(p.display_name, '') AS display_name,
  ''::text AS email
FROM public.school_memberships sm
LEFT JOIN public.profiles p ON p.id = sm.user_id;

GRANT SELECT ON public.school_user_directory TO authenticated;