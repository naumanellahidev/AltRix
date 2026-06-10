
-- ============================================================
-- NEW MODULES: Notices, Holidays, Diary, Exams, Result Cards,
-- Parent Behavior Notes
-- ============================================================

-- NOTICES
CREATE TABLE IF NOT EXISTS public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  audience TEXT NOT NULL DEFAULT 'all', -- all | teachers | students | parents | staff
  priority TEXT NOT NULL DEFAULT 'normal', -- low | normal | high | urgent
  pinned BOOLEAN NOT NULL DEFAULT false,
  publish_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notices_school ON public.notices(school_id, created_at DESC);
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notices viewable by school members" ON public.notices;
CREATE POLICY "Notices viewable by school members" ON public.notices
  FOR SELECT USING (public.is_school_member(auth.uid(), school_id));

DROP POLICY IF EXISTS "Notices manageable by staff" ON public.notices;
CREATE POLICY "Notices manageable by staff" ON public.notices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = notices.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = notices.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager','teacher'))
  );

-- HOLIDAYS
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  holiday_type TEXT DEFAULT 'public', -- public | school | exam_break | other
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holidays_school ON public.holidays(school_id, start_date);
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Holidays viewable by school members" ON public.holidays;
CREATE POLICY "Holidays viewable by school members" ON public.holidays
  FOR SELECT USING (public.is_school_member(auth.uid(), school_id));

DROP POLICY IF EXISTS "Holidays manageable by admins" ON public.holidays;
CREATE POLICY "Holidays manageable by admins" ON public.holidays
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = holidays.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = holidays.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','hr_manager'))
  );

-- DIARY ENTRIES (homework / class diary)
CREATE TABLE IF NOT EXISTS public.diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_section_id UUID REFERENCES public.class_sections(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_user_id UUID,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT DEFAULT 'homework', -- homework | announcement | reminder | activity
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diary_school_section ON public.diary_entries(school_id, class_section_id, entry_date DESC);
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Diary viewable by school members" ON public.diary_entries;
CREATE POLICY "Diary viewable by school members" ON public.diary_entries
  FOR SELECT USING (public.is_school_member(auth.uid(), school_id));

DROP POLICY IF EXISTS "Diary manageable by teachers and admins" ON public.diary_entries;
CREATE POLICY "Diary manageable by teachers and admins" ON public.diary_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = diary_entries.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = diary_entries.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  );

-- EXAMS
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  term_label TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | ongoing | completed
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exams_school ON public.exams(school_id, start_date);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exams viewable by school members" ON public.exams;
CREATE POLICY "Exams viewable by school members" ON public.exams
  FOR SELECT USING (public.is_school_member(auth.uid(), school_id));

DROP POLICY IF EXISTS "Exams manageable by academic staff" ON public.exams;
CREATE POLICY "Exams manageable by academic staff" ON public.exams
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = exams.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = exams.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  );

-- EXAM SUBJECT SCHEDULE (per-subject papers within an exam)
CREATE TABLE IF NOT EXISTS public.exam_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  class_section_id UUID REFERENCES public.class_sections(id) ON DELETE SET NULL,
  exam_date DATE,
  start_time TIME,
  duration_minutes INT DEFAULT 60,
  max_marks NUMERIC DEFAULT 100,
  room TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON public.exam_subjects(exam_id);
ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exam subjects viewable by school members" ON public.exam_subjects;
CREATE POLICY "Exam subjects viewable by school members" ON public.exam_subjects
  FOR SELECT USING (public.is_school_member(auth.uid(), school_id));

DROP POLICY IF EXISTS "Exam subjects manageable by academic staff" ON public.exam_subjects;
CREATE POLICY "Exam subjects manageable by academic staff" ON public.exam_subjects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = exam_subjects.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = exam_subjects.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  );

-- EXAM RESULTS / REPORT CARDS (per student per subject per exam)
CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  marks_obtained NUMERIC,
  max_marks NUMERIC DEFAULT 100,
  grade TEXT,
  remarks TEXT,
  graded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON public.exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON public.exam_results(student_id);
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Results viewable by staff" ON public.exam_results;
CREATE POLICY "Results viewable by staff" ON public.exam_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = exam_results.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher','counselor'))
  );

DROP POLICY IF EXISTS "Results viewable by own student" ON public.exam_results;
CREATE POLICY "Results viewable by own student" ON public.exam_results
  FOR SELECT USING (
    student_id = public.my_student_id(school_id)
  );

DROP POLICY IF EXISTS "Results viewable by parent" ON public.exam_results;
CREATE POLICY "Results viewable by parent" ON public.exam_results
  FOR SELECT USING (
    public.is_my_child(school_id, student_id)
  );

DROP POLICY IF EXISTS "Results manageable by teachers" ON public.exam_results;
CREATE POLICY "Results manageable by teachers" ON public.exam_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = exam_results.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = exam_results.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  );

-- REPORT CARD SUMMARY (overall remarks per exam)
CREATE TABLE IF NOT EXISTS public.report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  total_marks NUMERIC,
  max_total NUMERIC,
  percentage NUMERIC,
  gpa NUMERIC,
  overall_grade TEXT,
  teacher_remarks TEXT,
  principal_remarks TEXT,
  attendance_percentage NUMERIC,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id)
);
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Report cards viewable by staff" ON public.report_cards;
CREATE POLICY "Report cards viewable by staff" ON public.report_cards
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = report_cards.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher','counselor'))
  );

DROP POLICY IF EXISTS "Report cards viewable by own student" ON public.report_cards;
CREATE POLICY "Report cards viewable by own student" ON public.report_cards
  FOR SELECT USING (
    is_published = true AND student_id = public.my_student_id(school_id)
  );

DROP POLICY IF EXISTS "Report cards viewable by parent" ON public.report_cards;
CREATE POLICY "Report cards viewable by parent" ON public.report_cards
  FOR SELECT USING (
    is_published = true AND public.is_my_child(school_id, student_id)
  );

DROP POLICY IF EXISTS "Report cards manageable by teachers" ON public.report_cards;
CREATE POLICY "Report cards manageable by teachers" ON public.report_cards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = report_cards.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = report_cards.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher'))
  );

-- PARENT BEHAVIOR NOTES (parent logs child's home behavior/routine)
CREATE TABLE IF NOT EXISTS public.parent_behavior_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL,
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  behavior TEXT,
  routine TEXT,
  mood TEXT, -- happy | neutral | upset | tired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pbn_student_date ON public.parent_behavior_notes(student_id, note_date DESC);
ALTER TABLE public.parent_behavior_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PBN insertable by parent" ON public.parent_behavior_notes;
CREATE POLICY "PBN insertable by parent" ON public.parent_behavior_notes
  FOR INSERT WITH CHECK (
    parent_user_id = auth.uid() AND public.is_my_child(school_id, student_id)
  );

DROP POLICY IF EXISTS "PBN updatable by parent" ON public.parent_behavior_notes;
CREATE POLICY "PBN updatable by parent" ON public.parent_behavior_notes
  FOR UPDATE USING (parent_user_id = auth.uid());

DROP POLICY IF EXISTS "PBN deletable by parent" ON public.parent_behavior_notes;
CREATE POLICY "PBN deletable by parent" ON public.parent_behavior_notes
  FOR DELETE USING (parent_user_id = auth.uid());

DROP POLICY IF EXISTS "PBN viewable by parent" ON public.parent_behavior_notes;
CREATE POLICY "PBN viewable by parent" ON public.parent_behavior_notes
  FOR SELECT USING (parent_user_id = auth.uid() OR public.is_my_child(school_id, student_id));

DROP POLICY IF EXISTS "PBN viewable by own student" ON public.parent_behavior_notes;
CREATE POLICY "PBN viewable by own student" ON public.parent_behavior_notes
  FOR SELECT USING (student_id = public.my_student_id(school_id));

DROP POLICY IF EXISTS "PBN viewable by staff" ON public.parent_behavior_notes;
CREATE POLICY "PBN viewable by staff" ON public.parent_behavior_notes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = parent_behavior_notes.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','school_admin','academic_coordinator','teacher','counselor'))
  );

-- updated_at triggers
DROP TRIGGER IF EXISTS notices_updated_at ON public.notices;
CREATE TRIGGER notices_updated_at BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS diary_updated_at ON public.diary_entries;
CREATE TRIGGER diary_updated_at BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS exams_updated_at ON public.exams;
CREATE TRIGGER exams_updated_at BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS exam_results_updated_at ON public.exam_results;
CREATE TRIGGER exam_results_updated_at BEFORE UPDATE ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS report_cards_updated_at ON public.report_cards;
CREATE TRIGGER report_cards_updated_at BEFORE UPDATE ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS pbn_updated_at ON public.parent_behavior_notes;
CREATE TRIGGER pbn_updated_at BEFORE UPDATE ON public.parent_behavior_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
