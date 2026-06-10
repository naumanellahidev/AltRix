
-- Per-student/section publish overrides for exam results
CREATE TABLE IF NOT EXISTS public.exam_result_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('exam','section','student')),
  class_section_id uuid REFERENCES public.class_sections(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  is_published boolean NOT NULL DEFAULT true,
  publish_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_exam ON public.exam_result_publications(exam_id);
CREATE INDEX IF NOT EXISTS idx_erp_section ON public.exam_result_publications(class_section_id);
CREATE INDEX IF NOT EXISTS idx_erp_student ON public.exam_result_publications(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_exam_scope ON public.exam_result_publications(exam_id) WHERE scope='exam';
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_exam_section ON public.exam_result_publications(exam_id, class_section_id) WHERE scope='section';
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_exam_student ON public.exam_result_publications(exam_id, student_id) WHERE scope='student';

ALTER TABLE public.exam_result_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Publications viewable by school members"
  ON public.exam_result_publications FOR SELECT
  USING (public.is_school_member(auth.uid(), school_id));

CREATE POLICY "Publications manageable by admins"
  ON public.exam_result_publications FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.school_id = exam_result_publications.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.school_id = exam_result_publications.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager')
  ));

CREATE TRIGGER trg_erp_updated_at
  BEFORE UPDATE ON public.exam_result_publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: can manage result publishing
CREATE OR REPLACE FUNCTION public.can_publish_results(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager')
  );
$$;
