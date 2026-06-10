
-- 1. Remove sensitive tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.jazzcash_settings;
ALTER PUBLICATION supabase_realtime DROP TABLE public.admission_applications;

-- 2. Tighten student-photos storage policies (path = {school_id}/{uuid}.ext)
DROP POLICY IF EXISTS "Authenticated can upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete student photos" ON storage.objects;

CREATE POLICY "Staff can upload student photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'student-photos'
  AND public.can_manage_students(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Staff can update student photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'student-photos'
  AND public.can_manage_students(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Staff can delete student photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'student-photos'
  AND public.can_manage_students(((storage.foldername(name))[1])::uuid)
);

-- 3. Scope "Principals can manage guardians" by school_id
DROP POLICY IF EXISTS "Principals can manage guardians" ON public.student_guardians;

CREATE POLICY "Principals can manage guardians"
ON public.student_guardians
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.user_roles ur
      ON ur.school_id = s.school_id AND ur.user_id = auth.uid()
    WHERE s.id = student_guardians.student_id
      AND ur.role = ANY (ARRAY['principal','vice_principal','school_admin','school_owner'])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.user_roles ur
      ON ur.school_id = s.school_id AND ur.user_id = auth.uid()
    WHERE s.id = student_guardians.student_id
      AND ur.role = ANY (ARRAY['principal','vice_principal','school_admin','school_owner'])
  )
);

-- 4. Allow uploaders to read their own admission documents
CREATE POLICY "Uploader can read own admission documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'admission-documents'
  AND owner = auth.uid()
);
