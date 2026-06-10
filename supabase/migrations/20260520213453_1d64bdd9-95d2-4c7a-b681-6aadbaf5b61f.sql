DROP FUNCTION IF EXISTS public.get_at_risk_students(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_at_risk_students(_school_id uuid, _class_section_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(student_id uuid, first_name text, last_name text, class_section_id uuid, class_name text, section_name text, attendance_rate numeric, avg_grade_percentage numeric, recent_grade_avg numeric, risk_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH enrolled AS (
    SELECT se.student_id, se.class_section_id, s.first_name, s.last_name,
           cs.name AS section_name, ac.name AS class_name
    FROM student_enrollments se
    JOIN students s ON s.id = se.student_id
    LEFT JOIN class_sections cs ON cs.id = se.class_section_id
    LEFT JOIN academic_classes ac ON ac.id = cs.class_id
    WHERE se.school_id = _school_id
      AND se.end_date IS NULL
      AND (_class_section_id IS NULL OR se.class_section_id = _class_section_id)
  ),
  att_stats AS (
    SELECT
      e.student_id,
      COUNT(ae.id) AS att_count,
      (COUNT(CASE WHEN ae.status = 'present' THEN 1 END)::numeric
        / NULLIF(COUNT(ae.id), 0)::numeric) * 100 AS attendance_rate
    FROM enrolled e
    LEFT JOIN attendance_entries ae ON ae.student_id = e.student_id AND ae.school_id = _school_id
    GROUP BY e.student_id
  ),
  grade_stats AS (
    SELECT
      e.student_id,
      COUNT(sm.id) FILTER (WHERE aa.max_marks > 0) AS grade_count,
      COUNT(sm.id) FILTER (WHERE aa.max_marks > 0 AND aa.created_at > (now() - interval '60 days')) AS recent_count,
      AVG(CASE WHEN aa.max_marks > 0 THEN (sm.marks::numeric / aa.max_marks::numeric) * 100 END) AS avg_grade_percentage,
      AVG(CASE WHEN aa.max_marks > 0 AND aa.created_at > (now() - interval '60 days')
            THEN (sm.marks::numeric / aa.max_marks::numeric) * 100 END) AS recent_grade_avg
    FROM enrolled e
    LEFT JOIN student_marks sm ON sm.student_id = e.student_id AND sm.school_id = _school_id
    LEFT JOIN academic_assessments aa ON aa.id = sm.assessment_id
    GROUP BY e.student_id
  ),
  computed AS (
    SELECT
      e.student_id, e.first_name, e.last_name, e.class_section_id,
      e.class_name, e.section_name,
      COALESCE(a.attendance_rate, 100) AS attendance_rate,
      COALESCE(g.avg_grade_percentage, 0) AS avg_grade_percentage,
      COALESCE(g.recent_grade_avg, 0) AS recent_grade_avg,
      COALESCE(a.att_count, 0) AS att_count,
      COALESCE(g.grade_count, 0) AS grade_count,
      COALESCE(g.recent_count, 0) AS recent_count
    FROM enrolled e
    LEFT JOIN att_stats a ON a.student_id = e.student_id
    LEFT JOIN grade_stats g ON g.student_id = e.student_id
  )
  SELECT
    c.student_id, c.first_name, c.last_name, c.class_section_id,
    c.class_name, c.section_name,
    c.attendance_rate, c.avg_grade_percentage, c.recent_grade_avg,
    CASE
      WHEN c.att_count >= 5 AND c.attendance_rate < 75 THEN 'Low Attendance'
      WHEN c.grade_count >= 2 AND c.avg_grade_percentage < 60 THEN 'Low Grades'
      WHEN c.grade_count >= 2 AND c.recent_count >= 2
           AND c.recent_grade_avg < c.avg_grade_percentage - 15 THEN 'Declining Grades'
      ELSE NULL
    END AS risk_reason
  FROM computed c
  WHERE
    (c.att_count >= 5 AND c.attendance_rate < 75)
    OR (c.grade_count >= 2 AND c.avg_grade_percentage < 60)
    OR (c.grade_count >= 2 AND c.recent_count >= 2
        AND c.recent_grade_avg < c.avg_grade_percentage - 15)
  ORDER BY c.attendance_rate ASC, c.avg_grade_percentage ASC;
END;
$function$;