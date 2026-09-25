-- ============================================================================
-- The platform owner is never listed inside a school.
--
-- The platform's own administrator (platform_super_admins) can open any
-- school to support it, but is not one of its people. The owner asked that
-- nobody but them ever sees that account. The Users and Directory screens hid
-- it by a hard-coded email in the browser; every people list the database
-- hands out now leaves it out at the source, by role rather than by address,
-- and it stays out even if the account is ever given a role in a school.
--
-- The functions keep their signatures and their existing logic; each gains
-- one condition. Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_super_admins p WHERE p.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_school_user_directory(_school_id uuid)
 RETURNS TABLE(user_id uuid, email text, display_name text, school_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sm.user_id, u.email::TEXT, COALESCE(p.display_name, u.email)::TEXT, sm.school_id
  FROM public.school_memberships sm
  JOIN auth.users u ON u.id = sm.user_id
  LEFT JOIN public.profiles p ON p.id = sm.user_id
  WHERE sm.school_id = _school_id
    AND is_school_member(auth.uid(), _school_id)
    AND NOT public.is_platform_owner(sm.user_id);
$function$;

CREATE OR REPLACE FUNCTION public.list_school_user_profiles(_school_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sm.user_id, COALESCE(p.display_name, u.email), u.email
  FROM public.school_memberships sm
  JOIN auth.users u ON u.id = sm.user_id
  LEFT JOIN public.profiles p ON p.id = sm.user_id
  WHERE sm.school_id = _school_id
    AND NOT public.is_platform_owner(sm.user_id);
$function$;

CREATE OR REPLACE FUNCTION public.get_school_staff_directory(_school_id uuid)
 RETURNS TABLE(user_id uuid, email text, display_name text, school_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sm.user_id, u.email::TEXT, COALESCE(p.display_name, u.email)::TEXT, sm.school_id
  FROM public.school_memberships sm
  JOIN auth.users u ON u.id = sm.user_id
  LEFT JOIN public.profiles p ON p.id = sm.user_id
  WHERE sm.school_id = _school_id
    AND is_school_member(auth.uid(), _school_id)
    AND NOT public.is_platform_owner(sm.user_id)
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = sm.user_id
        AND ur.school_id = _school_id
        AND ur.role NOT IN ('parent','student')
    )
  ORDER BY COALESCE(p.display_name, u.email) NULLS LAST;
$function$;

CREATE OR REPLACE VIEW public.school_user_directory AS
  SELECT sm.school_id,
         sm.user_id,
         COALESCE(p.display_name, ''::text) AS display_name,
         ''::text AS email
    FROM school_memberships sm
    LEFT JOIN profiles p ON p.id = sm.user_id
   WHERE NOT EXISTS (SELECT 1 FROM platform_super_admins psa WHERE psa.user_id = sm.user_id);

COMMIT;
