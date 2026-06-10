-- Extend existing fee_plans (additive)
ALTER TABLE public.fee_plans ADD COLUMN IF NOT EXISTS class_id uuid;
ALTER TABLE public.fee_plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.fee_plans ADD COLUMN IF NOT EXISTS billing_frequency public.fee_billing_frequency NOT NULL DEFAULT 'monthly';
ALTER TABLE public.fee_plans ADD COLUMN IF NOT EXISTS school_year text;
CREATE INDEX IF NOT EXISTS fee_plans_class_idx ON public.fee_plans(class_id);

-- FEE SETTINGS
CREATE TABLE IF NOT EXISTS public.fee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'PKR',
  sibling_discount_2nd_pct numeric(5,2) NOT NULL DEFAULT 0,
  sibling_discount_3rd_plus_pct numeric(5,2) NOT NULL DEFAULT 0,
  late_fee_enabled boolean NOT NULL DEFAULT false,
  late_fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  late_fee_grace_days int NOT NULL DEFAULT 0,
  invoice_prefix text NOT NULL DEFAULT 'INV',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fee_settings_select" ON public.fee_settings;
DROP POLICY IF EXISTS "fee_settings_insert" ON public.fee_settings;
DROP POLICY IF EXISTS "fee_settings_update" ON public.fee_settings;
CREATE POLICY "fee_settings_select" ON public.fee_settings FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "fee_settings_insert" ON public.fee_settings FOR INSERT WITH CHECK (public.can_manage_finance(school_id));
CREATE POLICY "fee_settings_update" ON public.fee_settings FOR UPDATE USING (public.can_manage_finance(school_id));
DROP TRIGGER IF EXISTS fee_settings_updated_at ON public.fee_settings;
CREATE TRIGGER fee_settings_updated_at BEFORE UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add RLS to existing fee_plans (additive policies)
ALTER TABLE public.fee_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fee_plans_select_v2" ON public.fee_plans;
DROP POLICY IF EXISTS "fee_plans_modify_v2" ON public.fee_plans;
CREATE POLICY "fee_plans_select_v2" ON public.fee_plans FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "fee_plans_modify_v2" ON public.fee_plans FOR ALL USING (public.can_manage_finance(school_id)) WITH CHECK (public.can_manage_finance(school_id));

-- FEE PLAN ITEMS (recurring charges)
CREATE TABLE IF NOT EXISTS public.fee_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  fee_plan_id uuid NOT NULL REFERENCES public.fee_plans(id) ON DELETE CASCADE,
  label text NOT NULL,
  category public.fee_item_category NOT NULL DEFAULT 'tuition',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  is_recurring boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_plan_items_plan_idx ON public.fee_plan_items(fee_plan_id);
ALTER TABLE public.fee_plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fee_plan_items_select" ON public.fee_plan_items;
DROP POLICY IF EXISTS "fee_plan_items_modify" ON public.fee_plan_items;
CREATE POLICY "fee_plan_items_select" ON public.fee_plan_items FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "fee_plan_items_modify" ON public.fee_plan_items FOR ALL USING (public.can_manage_finance(school_id)) WITH CHECK (public.can_manage_finance(school_id));

-- STUDENT FEE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.student_fee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  fee_plan_id uuid NOT NULL REFERENCES public.fee_plans(id) ON DELETE RESTRICT,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  scholarship_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, fee_plan_id)
);
CREATE INDEX IF NOT EXISTS sfa_school_idx ON public.student_fee_assignments(school_id);
CREATE INDEX IF NOT EXISTS sfa_student_idx ON public.student_fee_assignments(student_id);
ALTER TABLE public.student_fee_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sfa_select_staff" ON public.student_fee_assignments;
DROP POLICY IF EXISTS "sfa_select_parent" ON public.student_fee_assignments;
DROP POLICY IF EXISTS "sfa_select_self" ON public.student_fee_assignments;
DROP POLICY IF EXISTS "sfa_modify" ON public.student_fee_assignments;
CREATE POLICY "sfa_select_staff" ON public.student_fee_assignments FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "sfa_select_parent" ON public.student_fee_assignments FOR SELECT USING (public.is_my_child(school_id, student_id));
CREATE POLICY "sfa_select_self" ON public.student_fee_assignments FOR SELECT USING (student_id = public.my_student_id(school_id));
CREATE POLICY "sfa_modify" ON public.student_fee_assignments FOR ALL USING (public.can_manage_finance(school_id)) WITH CHECK (public.can_manage_finance(school_id));
DROP TRIGGER IF EXISTS sfa_updated_at ON public.student_fee_assignments;
CREATE TRIGGER sfa_updated_at BEFORE UPDATE ON public.student_fee_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FEE INVOICES
CREATE TABLE IF NOT EXISTS public.fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  fee_plan_id uuid REFERENCES public.fee_plans(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  period_label text,
  period_start date,
  period_end date,
  due_date date NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  sibling_discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  late_fee numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  status public.fee_invoice_status NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS fi_school_idx ON public.fee_invoices(school_id);
CREATE INDEX IF NOT EXISTS fi_student_idx ON public.fee_invoices(student_id);
CREATE INDEX IF NOT EXISTS fi_status_idx ON public.fee_invoices(status);
ALTER TABLE public.fee_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fi_select_staff" ON public.fee_invoices;
DROP POLICY IF EXISTS "fi_select_parent" ON public.fee_invoices;
DROP POLICY IF EXISTS "fi_select_self" ON public.fee_invoices;
DROP POLICY IF EXISTS "fi_modify" ON public.fee_invoices;
CREATE POLICY "fi_select_staff" ON public.fee_invoices FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "fi_select_parent" ON public.fee_invoices FOR SELECT USING (public.is_my_child(school_id, student_id));
CREATE POLICY "fi_select_self" ON public.fee_invoices FOR SELECT USING (student_id = public.my_student_id(school_id));
CREATE POLICY "fi_modify" ON public.fee_invoices FOR ALL USING (public.can_manage_finance(school_id)) WITH CHECK (public.can_manage_finance(school_id));
DROP TRIGGER IF EXISTS fi_updated_at ON public.fee_invoices;
CREATE TRIGGER fi_updated_at BEFORE UPDATE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FEE INVOICE ITEMS
CREATE TABLE IF NOT EXISTS public.fee_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.fee_invoices(id) ON DELETE CASCADE,
  label text NOT NULL,
  category public.fee_item_category NOT NULL DEFAULT 'tuition',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS fii_invoice_idx ON public.fee_invoice_items(invoice_id);
ALTER TABLE public.fee_invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fii_select_staff" ON public.fee_invoice_items;
DROP POLICY IF EXISTS "fii_select_parent" ON public.fee_invoice_items;
DROP POLICY IF EXISTS "fii_select_self" ON public.fee_invoice_items;
DROP POLICY IF EXISTS "fii_modify" ON public.fee_invoice_items;
CREATE POLICY "fii_select_staff" ON public.fee_invoice_items FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "fii_select_parent" ON public.fee_invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.fee_invoices i WHERE i.id = invoice_id AND public.is_my_child(i.school_id, i.student_id))
);
CREATE POLICY "fii_select_self" ON public.fee_invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.fee_invoices i WHERE i.id = invoice_id AND i.student_id = public.my_student_id(i.school_id))
);
CREATE POLICY "fii_modify" ON public.fee_invoice_items FOR ALL USING (public.can_manage_finance(school_id)) WITH CHECK (public.can_manage_finance(school_id));

-- FEE PAYMENTS
CREATE TABLE IF NOT EXISTS public.fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.fee_invoices(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  method public.fee_payment_method NOT NULL DEFAULT 'cash',
  status public.fee_payment_status NOT NULL DEFAULT 'success',
  transaction_ref text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fp_school_idx ON public.fee_payments(school_id);
CREATE INDEX IF NOT EXISTS fp_invoice_idx ON public.fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS fp_student_idx ON public.fee_payments(student_id);
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fp_select_staff" ON public.fee_payments;
DROP POLICY IF EXISTS "fp_select_parent" ON public.fee_payments;
DROP POLICY IF EXISTS "fp_select_self" ON public.fee_payments;
DROP POLICY IF EXISTS "fp_insert" ON public.fee_payments;
DROP POLICY IF EXISTS "fp_update" ON public.fee_payments;
DROP POLICY IF EXISTS "fp_delete" ON public.fee_payments;
CREATE POLICY "fp_select_staff" ON public.fee_payments FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "fp_select_parent" ON public.fee_payments FOR SELECT USING (public.is_my_child(school_id, student_id));
CREATE POLICY "fp_select_self" ON public.fee_payments FOR SELECT USING (student_id = public.my_student_id(school_id));
CREATE POLICY "fp_insert" ON public.fee_payments FOR INSERT WITH CHECK (public.can_manage_finance(school_id));
CREATE POLICY "fp_update" ON public.fee_payments FOR UPDATE USING (public.can_manage_finance(school_id));
CREATE POLICY "fp_delete" ON public.fee_payments FOR DELETE USING (public.can_manage_finance(school_id));

-- Realtime
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.fee_invoices;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.fee_payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;