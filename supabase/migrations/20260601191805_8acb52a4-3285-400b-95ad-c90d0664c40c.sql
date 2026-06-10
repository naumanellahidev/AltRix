-- ============================================================
-- HR Manager Shell — Phase 1: Additive HR schema
-- All new tables are additive; existing tables untouched.
-- Pattern per table: CREATE → GRANT → ENABLE RLS → POLICIES → updated_at trigger
-- ============================================================

-- ---------- RECRUITMENT ----------
CREATE TABLE IF NOT EXISTS public.hr_job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  campus_id uuid,
  title text NOT NULL,
  department text,
  location text,
  employment_type text NOT NULL DEFAULT 'full_time',
  status text NOT NULL DEFAULT 'open',
  openings int NOT NULL DEFAULT 1,
  description text,
  requirements text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_job_postings TO authenticated;
GRANT ALL ON public.hr_job_postings TO service_role;
ALTER TABLE public.hr_job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_job_postings_select" ON public.hr_job_postings FOR SELECT
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "hr_job_postings_write" ON public.hr_job_postings FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_job_postings_updated_at BEFORE UPDATE ON public.hr_job_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hr_job_postings_school ON public.hr_job_postings(school_id, status);

CREATE TABLE IF NOT EXISTS public.hr_applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  posting_id uuid REFERENCES public.hr_job_postings(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  resume_url text,
  source text,
  stage text NOT NULL DEFAULT 'applied',
  rating smallint,
  notes text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_applicants TO authenticated;
GRANT ALL ON public.hr_applicants TO service_role;
ALTER TABLE public.hr_applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_applicants_rw" ON public.hr_applicants FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_applicants_updated_at BEFORE UPDATE ON public.hr_applicants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hr_applicants_school ON public.hr_applicants(school_id, stage);
CREATE INDEX IF NOT EXISTS idx_hr_applicants_posting ON public.hr_applicants(posting_id);

CREATE TABLE IF NOT EXISTS public.hr_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  applicant_id uuid NOT NULL REFERENCES public.hr_applicants(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  mode text NOT NULL DEFAULT 'in_person',
  location_or_link text,
  interviewer_user_id uuid,
  status text NOT NULL DEFAULT 'scheduled',
  feedback text,
  score smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_interviews TO authenticated;
GRANT ALL ON public.hr_interviews TO service_role;
ALTER TABLE public.hr_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_interviews_rw" ON public.hr_interviews FOR ALL
  USING (public.can_manage_hr(school_id) OR interviewer_user_id = auth.uid())
  WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_interviews_updated_at BEFORE UPDATE ON public.hr_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hr_interviews_school ON public.hr_interviews(school_id, scheduled_at);

-- ---------- ONBOARDING / OFFBOARDING ----------
CREATE TABLE IF NOT EXISTS public.hr_onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'onboarding', -- 'onboarding' | 'offboarding'
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_onboarding_templates TO authenticated;
GRANT ALL ON public.hr_onboarding_templates TO service_role;
ALTER TABLE public.hr_onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_onb_templates_select" ON public.hr_onboarding_templates FOR SELECT
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "hr_onb_templates_write" ON public.hr_onboarding_templates FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_onb_templates_updated_at BEFORE UPDATE ON public.hr_onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.hr_onboarding_template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.hr_onboarding_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_offset_days int NOT NULL DEFAULT 0,
  owner_role text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_onboarding_template_tasks TO authenticated;
GRANT ALL ON public.hr_onboarding_template_tasks TO service_role;
ALTER TABLE public.hr_onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_onb_tt_select" ON public.hr_onboarding_template_tasks FOR SELECT
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "hr_onb_tt_write" ON public.hr_onboarding_template_tasks FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));

CREATE TABLE IF NOT EXISTS public.hr_onboarding_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  template_id uuid REFERENCES public.hr_onboarding_templates(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'onboarding',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'in_progress',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_onboarding_assignments TO authenticated;
GRANT ALL ON public.hr_onboarding_assignments TO service_role;
ALTER TABLE public.hr_onboarding_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_onb_assign_select" ON public.hr_onboarding_assignments FOR SELECT
  USING (public.can_manage_hr(school_id) OR employee_user_id = auth.uid());
CREATE POLICY "hr_onb_assign_write" ON public.hr_onboarding_assignments FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_onb_assign_updated_at BEFORE UPDATE ON public.hr_onboarding_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hr_onb_assign_school ON public.hr_onboarding_assignments(school_id, kind, status);

CREATE TABLE IF NOT EXISTS public.hr_onboarding_task_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assignment_id uuid NOT NULL REFERENCES public.hr_onboarding_assignments(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  owner_user_id uuid,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by uuid,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_onboarding_task_status TO authenticated;
GRANT ALL ON public.hr_onboarding_task_status TO service_role;
ALTER TABLE public.hr_onboarding_task_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_onb_ts_select" ON public.hr_onboarding_task_status FOR SELECT
  USING (public.can_manage_hr(school_id) OR owner_user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.hr_onboarding_assignments a
                    WHERE a.id = assignment_id AND a.employee_user_id = auth.uid()));
CREATE POLICY "hr_onb_ts_write" ON public.hr_onboarding_task_status FOR ALL
  USING (public.can_manage_hr(school_id) OR owner_user_id = auth.uid())
  WITH CHECK (public.can_manage_hr(school_id) OR owner_user_id = auth.uid());
CREATE TRIGGER trg_hr_onb_ts_updated_at BEFORE UPDATE ON public.hr_onboarding_task_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hr_onb_ts_assignment ON public.hr_onboarding_task_status(assignment_id);

-- ---------- ASSETS ----------
CREATE TABLE IF NOT EXISTS public.hr_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  asset_tag text,
  name text NOT NULL,
  category text,
  serial_number text,
  purchase_date date,
  purchase_cost numeric(12,2),
  status text NOT NULL DEFAULT 'available',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_assets TO authenticated;
GRANT ALL ON public.hr_assets TO service_role;
ALTER TABLE public.hr_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_assets_select" ON public.hr_assets FOR SELECT
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "hr_assets_write" ON public.hr_assets FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_assets_updated_at BEFORE UPDATE ON public.hr_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.hr_asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.hr_assets(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid,
  returned_at timestamptz,
  condition_on_return text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_asset_assignments TO authenticated;
GRANT ALL ON public.hr_asset_assignments TO service_role;
ALTER TABLE public.hr_asset_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_asset_assign_select" ON public.hr_asset_assignments FOR SELECT
  USING (public.can_manage_hr(school_id) OR employee_user_id = auth.uid());
CREATE POLICY "hr_asset_assign_write" ON public.hr_asset_assignments FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_asset_assign_updated_at BEFORE UPDATE ON public.hr_asset_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- SALARY COMPONENTS / STRUCTURE ----------
CREATE TABLE IF NOT EXISTS public.hr_salary_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  kind text NOT NULL DEFAULT 'earning', -- 'earning' | 'deduction'
  calc_type text NOT NULL DEFAULT 'fixed', -- 'fixed' | 'percent_of_basic'
  default_value numeric(12,2) NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_salary_components TO authenticated;
GRANT ALL ON public.hr_salary_components TO service_role;
ALTER TABLE public.hr_salary_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_sal_comp_select" ON public.hr_salary_components FOR SELECT
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "hr_sal_comp_write" ON public.hr_salary_components FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_sal_comp_updated_at BEFORE UPDATE ON public.hr_salary_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.hr_employee_salary_structure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  component_id uuid NOT NULL REFERENCES public.hr_salary_components(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employee_salary_structure TO authenticated;
GRANT ALL ON public.hr_employee_salary_structure TO service_role;
ALTER TABLE public.hr_employee_salary_structure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_emp_sal_select" ON public.hr_employee_salary_structure FOR SELECT
  USING (public.can_manage_hr(school_id) OR employee_user_id = auth.uid());
CREATE POLICY "hr_emp_sal_write" ON public.hr_employee_salary_structure FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_emp_sal_updated_at BEFORE UPDATE ON public.hr_employee_salary_structure
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hr_emp_sal_school_emp ON public.hr_employee_salary_structure(school_id, employee_user_id);

-- ---------- PAYROLL ----------
CREATE TABLE IF NOT EXISTS public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  label text,
  status text NOT NULL DEFAULT 'draft', -- draft | locked | paid
  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,
  generated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_runs TO authenticated;
GRANT ALL ON public.hr_payroll_runs TO service_role;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_payroll_runs_rw" ON public.hr_payroll_runs FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_payroll_runs_updated_at BEFORE UPDATE ON public.hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL,
  basic numeric(12,2) NOT NULL DEFAULT 0,
  earnings numeric(12,2) NOT NULL DEFAULT 0,
  deductions numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  bonus numeric(12,2) NOT NULL DEFAULT 0,
  gross numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payslips TO authenticated;
GRANT ALL ON public.hr_payslips TO service_role;
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_payslips_select" ON public.hr_payslips FOR SELECT
  USING (public.can_manage_hr(school_id) OR employee_user_id = auth.uid());
CREATE POLICY "hr_payslips_write" ON public.hr_payslips FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_payslips_updated_at BEFORE UPDATE ON public.hr_payslips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_hr_payslips_run ON public.hr_payslips(run_id);
CREATE INDEX IF NOT EXISTS idx_hr_payslips_emp ON public.hr_payslips(school_id, employee_user_id);

-- ---------- ATTENDANCE REGULARIZATION ----------
CREATE TABLE IF NOT EXISTS public.hr_attendance_regularizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  attendance_date date NOT NULL,
  requested_status text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_attendance_regularizations TO authenticated;
GRANT ALL ON public.hr_attendance_regularizations TO service_role;
ALTER TABLE public.hr_attendance_regularizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_attreg_select" ON public.hr_attendance_regularizations FOR SELECT
  USING (public.can_manage_hr(school_id) OR employee_user_id = auth.uid());
CREATE POLICY "hr_attreg_insert" ON public.hr_attendance_regularizations FOR INSERT
  WITH CHECK (employee_user_id = auth.uid() OR public.can_manage_hr(school_id));
CREATE POLICY "hr_attreg_update" ON public.hr_attendance_regularizations FOR UPDATE
  USING (public.can_manage_hr(school_id))
  WITH CHECK (public.can_manage_hr(school_id));
CREATE POLICY "hr_attreg_delete" ON public.hr_attendance_regularizations FOR DELETE
  USING (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_attreg_updated_at BEFORE UPDATE ON public.hr_attendance_regularizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- PERFORMANCE REVIEW CYCLES ----------
CREATE TABLE IF NOT EXISTS public.hr_performance_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_performance_cycles TO authenticated;
GRANT ALL ON public.hr_performance_cycles TO service_role;
ALTER TABLE public.hr_performance_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_perf_cycles_select" ON public.hr_performance_cycles FOR SELECT
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "hr_perf_cycles_write" ON public.hr_performance_cycles FOR ALL
  USING (public.can_manage_hr(school_id)) WITH CHECK (public.can_manage_hr(school_id));
CREATE TRIGGER trg_hr_perf_cycles_updated_at BEFORE UPDATE ON public.hr_performance_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
