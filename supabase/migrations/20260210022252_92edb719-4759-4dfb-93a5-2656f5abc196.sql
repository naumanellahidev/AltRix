
-- 1. lesson_plans table
CREATE TABLE public.lesson_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  teacher_user_id UUID NOT NULL,
  class_section_id UUID NOT NULL REFERENCES public.class_sections(id),
  subject_id UUID REFERENCES public.subjects(id),
  plan_date DATE NOT NULL,
  period_label TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL,
  objectives TEXT,
  resources TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members can view lesson plans" ON public.lesson_plans FOR SELECT USING (is_school_member(auth.uid(), school_id));
CREATE POLICY "Teachers can insert own lesson plans" ON public.lesson_plans FOR INSERT WITH CHECK (auth.uid() = teacher_user_id AND is_school_member(auth.uid(), school_id));
CREATE POLICY "Teachers can update own lesson plans" ON public.lesson_plans FOR UPDATE USING (auth.uid() = teacher_user_id AND is_school_member(auth.uid(), school_id));
CREATE POLICY "Teachers can delete own lesson plans" ON public.lesson_plans FOR DELETE USING (auth.uid() = teacher_user_id AND is_school_member(auth.uid(), school_id));

-- 2. crm_lead_attributions table
CREATE TABLE public.crm_lead_attributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id),
  campaign_id UUID NOT NULL REFERENCES public.crm_campaigns(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, campaign_id)
);
ALTER TABLE public.crm_lead_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members can manage lead attributions" ON public.crm_lead_attributions FOR ALL USING (is_school_member(auth.uid(), school_id)) WITH CHECK (is_school_member(auth.uid(), school_id));

-- 3. admin_message_reactions table
CREATE TABLE public.admin_message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.admin_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE public.admin_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members can manage reactions" ON public.admin_message_reactions FOR ALL USING (is_school_member(auth.uid(), school_id)) WITH CHECK (is_school_member(auth.uid(), school_id));

-- 4. admin_message_pins table
CREATE TABLE public.admin_message_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.admin_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);
ALTER TABLE public.admin_message_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members can manage pins" ON public.admin_message_pins FOR ALL USING (is_school_member(auth.uid(), school_id)) WITH CHECK (is_school_member(auth.uid(), school_id));

-- 5. ai_career_suggestions table
CREATE TABLE public.ai_career_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  suggested_careers JSONB DEFAULT '[]'::jsonb,
  strengths TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  recommended_subjects TEXT[] DEFAULT '{}',
  confidence NUMERIC DEFAULT 0,
  analysis_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ai_career_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members can view career suggestions" ON public.ai_career_suggestions FOR SELECT USING (is_school_member(auth.uid(), school_id));
CREATE POLICY "School members can manage career suggestions" ON public.ai_career_suggestions FOR ALL USING (is_school_member(auth.uid(), school_id)) WITH CHECK (is_school_member(auth.uid(), school_id));

-- 6. teacher_subject_assignments table
CREATE TABLE public.teacher_subject_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  class_section_id UUID NOT NULL REFERENCES public.class_sections(id),
  subject_id UUID NOT NULL REFERENCES public.subjects(id),
  teacher_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, class_section_id, subject_id)
);
ALTER TABLE public.teacher_subject_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members can view teacher subject assignments" ON public.teacher_subject_assignments FOR SELECT USING (is_school_member(auth.uid(), school_id));
CREATE POLICY "School members can manage teacher subject assignments" ON public.teacher_subject_assignments FOR ALL USING (is_school_member(auth.uid(), school_id)) WITH CHECK (is_school_member(auth.uid(), school_id));

-- 7. Missing column: timetable_entries.published_at
ALTER TABLE public.timetable_entries ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 8. Missing column: academic_assessments.published_at
ALTER TABLE public.academic_assessments ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
