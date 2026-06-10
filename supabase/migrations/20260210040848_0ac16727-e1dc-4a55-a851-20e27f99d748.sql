
-- Create the my_student_id function that returns the student ID linked to the current user
CREATE OR REPLACE FUNCTION public.my_student_id(_school_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM students s
  WHERE s.school_id = _school_id
    AND s.profile_id = auth.uid()
  LIMIT 1;
$$;

NOTIFY pgrst, 'reload schema';
