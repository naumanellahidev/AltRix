-- 1. Add slug column to campuses
ALTER TABLE public.campuses ADD COLUMN IF NOT EXISTS slug text;

-- Backfill existing rows with a unique slug derived from name (+ short id suffix if needed)
DO $$
DECLARE r record; base text; candidate text; n int;
BEGIN
  FOR r IN SELECT id, name, code FROM public.campuses WHERE slug IS NULL LOOP
    base := lower(regexp_replace(coalesce(r.code, r.name, 'campus'), '[^a-zA-Z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    IF base = '' THEN base := 'campus'; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.campuses WHERE slug = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n::text;
    END LOOP;
    UPDATE public.campuses SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.campuses ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campuses_slug_unique ON public.campuses (slug);

-- 2. Lock down campus creation to platform super admins only
DROP POLICY IF EXISTS "Staff write campuses" ON public.campuses;
CREATE POLICY "Platform admins create campuses"
ON public.campuses
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

-- 3. Admin-only RPC to create a campus with a unique global slug
CREATE OR REPLACE FUNCTION public.admin_create_campus(
  _school_id uuid,
  _name text,
  _slug text,
  _code text DEFAULT NULL,
  _address text DEFAULT NULL,
  _is_active boolean DEFAULT true
) RETURNS public.campuses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s text;
  row public.campuses;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: only platform super admins can create campuses';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN RAISE EXCEPTION 'name required'; END IF;
  IF _slug IS NULL OR length(trim(_slug)) = 0 THEN RAISE EXCEPTION 'slug required'; END IF;

  s := lower(regexp_replace(_slug, '[^a-zA-Z0-9-]+', '-', 'g'));
  s := trim(both '-' from s);
  IF s = '' THEN RAISE EXCEPTION 'invalid slug'; END IF;

  IF EXISTS (SELECT 1 FROM public.campuses WHERE slug = s) THEN
    RAISE EXCEPTION 'slug already taken by another campus: %', s;
  END IF;
  IF EXISTS (SELECT 1 FROM public.schools WHERE slug = s) THEN
    RAISE EXCEPTION 'slug already used by a school: %', s;
  END IF;

  INSERT INTO public.campuses (school_id, name, slug, code, address, is_active)
  VALUES (_school_id, trim(_name), s, NULLIF(trim(coalesce(_code,'')), ''), NULLIF(trim(coalesce(_address,'')), ''), coalesce(_is_active, true))
  RETURNING * INTO row;

  RETURN row;
END $$;

REVOKE ALL ON FUNCTION public.admin_create_campus(uuid, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_campus(uuid, text, text, text, text, boolean) TO authenticated;

-- 4. Admin-only helper to list schools for the platform picker
CREATE OR REPLACE FUNCTION public.admin_list_schools_basic()
RETURNS TABLE(id uuid, slug text, name text, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT s.id, s.slug, s.name, s.is_active FROM public.schools s ORDER BY s.name;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_schools_basic() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_schools_basic() TO authenticated;