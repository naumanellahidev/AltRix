-- Drop old restrictive select policies
DROP POLICY IF EXISTS "Anyone can view branding" ON public.school_branding;
DROP POLICY IF EXISTS "Members can view branding" ON public.school_branding;

-- Create public select policy to avoid early-mount race conditions before session load
CREATE POLICY "Anyone can view branding" ON public.school_branding FOR SELECT TO public USING (true);

-- Drop old restrictive write policies
DROP POLICY IF EXISTS "Staff managers can update branding" ON public.school_branding;
DROP POLICY IF EXISTS "Staff managers can update branding (update)" ON public.school_branding;
DROP POLICY IF EXISTS "authenticated_insert_branding" ON public.school_branding;
DROP POLICY IF EXISTS "authenticated_update_branding" ON public.school_branding;

-- Create permissive write policies for authenticated users
CREATE POLICY "authenticated_insert_branding" ON public.school_branding FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_branding" ON public.school_branding FOR UPDATE TO authenticated USING (true);
