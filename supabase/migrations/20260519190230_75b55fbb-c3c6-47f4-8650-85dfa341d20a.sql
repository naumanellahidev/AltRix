
CREATE TABLE IF NOT EXISTS public.exam_datesheet_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_section_id uuid REFERENCES public.class_sections(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_edd_exam ON public.exam_datesheet_distributions(exam_id);
CREATE INDEX IF NOT EXISTS idx_edd_student ON public.exam_datesheet_distributions(student_id);

ALTER TABLE public.exam_datesheet_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Distributions readable by school or guardian"
  ON public.exam_datesheet_distributions FOR SELECT
  USING (
    public.is_school_member(auth.uid(), school_id)
    OR public.is_my_child(school_id, student_id)
  );

CREATE POLICY "Distributions writable by staff"
  ON public.exam_datesheet_distributions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.school_id=exam_datesheet_distributions.school_id
    AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.school_id=exam_datesheet_distributions.school_id
    AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher')));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-datesheets','exam-datesheets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "datesheets read for members or guardian"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'exam-datesheets'
    AND EXISTS (
      SELECT 1 FROM public.exam_datesheet_distributions d
      WHERE d.file_path = name
        AND (public.is_school_member(auth.uid(), d.school_id) OR public.is_my_child(d.school_id, d.student_id))
    )
  );

CREATE POLICY "datesheets write by staff"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exam-datesheets'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher')
        AND (storage.foldername(name))[1] = ur.school_id::text
    )
  );

CREATE POLICY "datesheets update by staff"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'exam-datesheets'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher')
        AND (storage.foldername(name))[1] = ur.school_id::text
    )
  );

CREATE POLICY "datesheets delete by staff"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'exam-datesheets'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher')
        AND (storage.foldername(name))[1] = ur.school_id::text
    )
  );
