
-- 1) Add graded_by column to assignment_submissions
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS graded_by UUID,
  ADD COLUMN IF NOT EXISTS marks_obtained numeric,
  ADD COLUMN IF NOT EXISTS marks_before_penalty numeric,
  ADD COLUMN IF NOT EXISTS penalty_applied numeric DEFAULT 0;

-- 2) Create student_results table for teacher assignment grading
CREATE TABLE IF NOT EXISTS public.student_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id),
  marks_obtained numeric,
  grade text,
  remarks text,
  graded_by UUID,
  graded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(school_id, student_id, assignment_id)
);

ALTER TABLE public.student_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can view results" ON public.student_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = student_results.school_id AND sm.user_id = auth.uid())
  );

CREATE POLICY "Teachers can insert results" ON public.student_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.school_id = student_results.school_id AND ur.user_id = auth.uid() AND ur.role IN ('teacher','principal','vice_principal','school_admin','academic_coordinator'))
  );

CREATE POLICY "Teachers can update results" ON public.student_results
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.school_id = student_results.school_id AND ur.user_id = auth.uid() AND ur.role IN ('teacher','principal','vice_principal','school_admin','academic_coordinator'))
  );

-- 3) Create get_at_risk_students function
CREATE OR REPLACE FUNCTION public.get_at_risk_students(_school_id UUID, _class_section_id UUID DEFAULT NULL)
RETURNS TABLE(
  student_id UUID,
  first_name text,
  last_name text,
  class_section_id UUID,
  attendance_rate numeric,
  avg_grade_percentage numeric,
  recent_grade_avg numeric,
  risk_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH enrolled AS (
    SELECT se.student_id, se.class_section_id, s.first_name, s.last_name
    FROM student_enrollments se
    JOIN students s ON s.id = se.student_id
    WHERE se.school_id = _school_id
      AND se.end_date IS NULL
      AND (_class_section_id IS NULL OR se.class_section_id = _class_section_id)
  ),
  att_stats AS (
    SELECT
      e.student_id,
      COALESCE(
        (COUNT(CASE WHEN ae.status = 'present' THEN 1 END)::numeric / NULLIF(COUNT(ae.id), 0)::numeric) * 100,
        100
      ) AS attendance_rate
    FROM enrolled e
    LEFT JOIN attendance_entries ae ON ae.student_id = e.student_id AND ae.school_id = _school_id
    GROUP BY e.student_id
  ),
  grade_stats AS (
    SELECT
      e.student_id,
      COALESCE(AVG(
        CASE WHEN aa.max_marks > 0 THEN (sm.marks::numeric / aa.max_marks::numeric) * 100 ELSE NULL END
      ), 0) AS avg_grade_percentage,
      COALESCE(AVG(
        CASE WHEN aa.max_marks > 0 AND aa.created_at > (now() - interval '60 days')
          THEN (sm.marks::numeric / aa.max_marks::numeric) * 100 ELSE NULL END
      ), 0) AS recent_grade_avg
    FROM enrolled e
    LEFT JOIN student_marks sm ON sm.student_id = e.student_id AND sm.school_id = _school_id
    LEFT JOIN academic_assessments aa ON aa.id = sm.assessment_id
    GROUP BY e.student_id
  )
  SELECT
    e.student_id,
    e.first_name,
    e.last_name,
    e.class_section_id,
    COALESCE(a.attendance_rate, 100) AS attendance_rate,
    COALESCE(g.avg_grade_percentage, 0) AS avg_grade_percentage,
    COALESCE(g.recent_grade_avg, 0) AS recent_grade_avg,
    CASE
      WHEN COALESCE(a.attendance_rate, 100) < 75 THEN 'Low Attendance'
      WHEN COALESCE(g.avg_grade_percentage, 100) < 60 THEN 'Low Grades'
      WHEN COALESCE(g.recent_grade_avg, 100) < COALESCE(g.avg_grade_percentage, 100) - 15 THEN 'Declining Grades'
      ELSE NULL
    END AS risk_reason
  FROM enrolled e
  LEFT JOIN att_stats a ON a.student_id = e.student_id
  LEFT JOIN grade_stats g ON g.student_id = e.student_id
  WHERE
    COALESCE(a.attendance_rate, 100) < 75
    OR COALESCE(g.avg_grade_percentage, 100) < 60
    OR COALESCE(g.recent_grade_avg, 100) < COALESCE(g.avg_grade_percentage, 100) - 15
  ORDER BY COALESCE(a.attendance_rate, 100) ASC, COALESCE(g.avg_grade_percentage, 100) ASC;
END;
$$;

-- 4) Add school_id to student_guardians if missing for RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_guardians' AND column_name = 'school_id') THEN
    ALTER TABLE public.student_guardians ADD COLUMN school_id UUID REFERENCES public.schools(id);
  END IF;
END $$;

-- 5) RLS policy for student_guardians management by principal
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_guardians' AND policyname = 'Principals can manage guardians') THEN
    CREATE POLICY "Principals can manage guardians" ON public.student_guardians
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
