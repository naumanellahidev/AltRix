-- ========================================
-- Parent–Student Management System: schema upgrade
-- ========================================

-- 1) Extend students with full professional fields
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS roll_number text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  ADD COLUMN IF NOT EXISTS medical_notes text,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Unique roll number per school (allows nulls)
CREATE UNIQUE INDEX IF NOT EXISTS students_school_roll_unique
  ON public.students (school_id, roll_number)
  WHERE roll_number IS NOT NULL;

-- Unique registration number per school (allows nulls)
CREATE UNIQUE INDEX IF NOT EXISTS students_school_regno_unique
  ON public.students (school_id, registration_number)
  WHERE registration_number IS NOT NULL;

-- 2) Storage bucket for student profile photos (public for read; writes restricted by policy)
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read of student photos
DROP POLICY IF EXISTS "Student photos are publicly readable" ON storage.objects;
CREATE POLICY "Student photos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-photos');

-- Authenticated school members can upload
DROP POLICY IF EXISTS "Authenticated can upload student photos" ON storage.objects;
CREATE POLICY "Authenticated can upload student photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'student-photos');

-- Authenticated can update / replace
DROP POLICY IF EXISTS "Authenticated can update student photos" ON storage.objects;
CREATE POLICY "Authenticated can update student photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'student-photos');

-- Authenticated can delete
DROP POLICY IF EXISTS "Authenticated can delete student photos" ON storage.objects;
CREATE POLICY "Authenticated can delete student photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'student-photos');

-- 3) Detailed children RPC for the parent dashboard (one round-trip)
CREATE OR REPLACE FUNCTION public.my_children_detailed(_school_id uuid)
RETURNS TABLE (
  student_id uuid,
  first_name text,
  last_name text,
  roll_number text,
  student_code text,
  profile_image_url text,
  date_of_birth date,
  gender text,
  class_section_id uuid,
  section_name text,
  class_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH my AS (
    SELECT sg.student_id
    FROM public.student_guardians sg
    JOIN public.students s ON s.id = sg.student_id AND s.school_id = _school_id
    WHERE sg.user_id = auth.uid()
  )
  SELECT
    s.id AS student_id,
    s.first_name,
    s.last_name,
    s.roll_number,
    s.student_code,
    s.profile_image_url,
    s.date_of_birth,
    s.gender,
    se.class_section_id,
    cs.name AS section_name,
    ac.name AS class_name
  FROM my
  JOIN public.students s ON s.id = my.student_id
  LEFT JOIN LATERAL (
    SELECT class_section_id
    FROM public.student_enrollments e
    WHERE e.student_id = s.id AND e.end_date IS NULL
    ORDER BY e.start_date DESC NULLS LAST
    LIMIT 1
  ) se ON true
  LEFT JOIN public.class_sections cs ON cs.id = se.class_section_id
  LEFT JOIN public.academic_classes ac ON ac.id = cs.class_id
  ORDER BY s.first_name;
$$;

-- 4) Helper to upsert/link guardian by email (parent profile lookup)
CREATE OR REPLACE FUNCTION public.find_parent_user_by_email(_school_id uuid, _email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM auth.users u
  JOIN public.school_memberships sm ON sm.user_id = u.id AND sm.school_id = _school_id
  WHERE lower(u.email) = lower(_email)
  LIMIT 1;
$$;