-- Policy to allow school principals and owners to update school configuration details (e.g. coordinates/geofence)
DROP POLICY IF EXISTS "Principal and owners can update school info" ON public.schools;
CREATE POLICY "Principal and owners can update school info"
ON public.schools FOR UPDATE
TO authenticated
USING (
  exists (
    select 1 from public.user_roles ur
    where ur.school_id = id
      and ur.user_id = auth.uid()
      and ur.role in ('super_admin', 'school_owner', 'principal')
  )
);
