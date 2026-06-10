-- Enhance exam & assessment system: additive only

-- 1) Assessment categorization & weightage
ALTER TABLE public.academic_assessments
  ADD COLUMN IF NOT EXISTS assessment_type text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS weightage_percent numeric,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS passing_marks numeric;

-- Validate assessment_type values (drop first if re-running)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_assessments_type_chk'
  ) THEN
    ALTER TABLE public.academic_assessments
      ADD CONSTRAINT academic_assessments_type_chk
      CHECK (assessment_type IN (
        'quiz','test','assignment','project','exam','classwork','homework',
        'midterm','final','practical','oral','presentation','lab'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_academic_assessments_type
  ON public.academic_assessments(school_id, assessment_type);

-- 2) Exam workflow + scheduling enhancements
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS result_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS result_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS passing_percentage numeric DEFAULT 40,
  ADD COLUMN IF NOT EXISTS academic_year text;

-- 3) Exam subjects: room/passing/instructions
ALTER TABLE public.exam_subjects
  ADD COLUMN IF NOT EXISTS passing_marks numeric DEFAULT 40,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS invigilator_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_exam_subjects_section
  ON public.exam_subjects(class_section_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_date
  ON public.exam_subjects(exam_date);

-- 4) Hall ticket / seating - lightweight table (optional usage)
CREATE TABLE IF NOT EXISTS public.exam_seat_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  roll_number text,
  room text,
  seat_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

ALTER TABLE public.exam_seat_allocations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='exam_seat_allocations' AND policyname='Members read seat allocations') THEN
    CREATE POLICY "Members read seat allocations"
      ON public.exam_seat_allocations FOR SELECT
      TO authenticated
      USING (is_school_member(auth.uid(), school_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='exam_seat_allocations' AND policyname='Staff manage seat allocations') THEN
    CREATE POLICY "Staff manage seat allocations"
      ON public.exam_seat_allocations FOR ALL
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.school_id = exam_seat_allocations.school_id
          AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.school_id = exam_seat_allocations.school_id
          AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher')
      ));
  END IF;
END $$;
