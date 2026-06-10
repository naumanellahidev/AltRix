-- JAZZCASH SETTINGS
CREATE TABLE IF NOT EXISTS public.jazzcash_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE,
  merchant_id text,
  merchant_password text,
  integrity_salt text,
  environment public.jazzcash_env NOT NULL DEFAULT 'sandbox',
  return_url text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.jazzcash_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jc_settings_select" ON public.jazzcash_settings;
DROP POLICY IF EXISTS "jc_settings_modify" ON public.jazzcash_settings;
CREATE POLICY "jc_settings_select" ON public.jazzcash_settings FOR SELECT USING (public.can_manage_jazzcash(school_id));
CREATE POLICY "jc_settings_modify" ON public.jazzcash_settings FOR ALL USING (public.can_manage_jazzcash(school_id)) WITH CHECK (public.can_manage_jazzcash(school_id));
DROP TRIGGER IF EXISTS jc_settings_updated_at ON public.jazzcash_settings;
CREATE TRIGGER jc_settings_updated_at BEFORE UPDATE ON public.jazzcash_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_jazzcash_enabled(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT is_enabled FROM public.jazzcash_settings WHERE school_id = _school_id), false);
$fn$;

-- JAZZCASH TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.jazzcash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.fee_invoices(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  initiator_user_id uuid,
  txn_ref_no text NOT NULL,
  amount numeric(12,2) NOT NULL,
  status public.fee_payment_status NOT NULL DEFAULT 'pending',
  raw_request jsonb,
  raw_response jsonb,
  jc_response_code text,
  jc_response_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jct_invoice_idx ON public.jazzcash_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS jct_ref_idx ON public.jazzcash_transactions(txn_ref_no);
ALTER TABLE public.jazzcash_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jct_select_staff" ON public.jazzcash_transactions;
DROP POLICY IF EXISTS "jct_select_parent" ON public.jazzcash_transactions;
DROP POLICY IF EXISTS "jct_select_self" ON public.jazzcash_transactions;
CREATE POLICY "jct_select_staff" ON public.jazzcash_transactions FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "jct_select_parent" ON public.jazzcash_transactions FOR SELECT USING (public.is_my_child(school_id, student_id));
CREATE POLICY "jct_select_self" ON public.jazzcash_transactions FOR SELECT USING (student_id = public.my_student_id(school_id));
DROP TRIGGER IF EXISTS jct_updated_at ON public.jazzcash_transactions;
CREATE TRIGGER jct_updated_at BEFORE UPDATE ON public.jazzcash_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ADMISSION APPLICATIONS
CREATE TABLE IF NOT EXISTS public.admission_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date,
  gender text,
  photo_url text,
  registration_number text,
  roll_number text,
  previous_school text,
  applying_for_class_id uuid,
  applying_for_section_id uuid,
  desired_subjects text[],
  parent_name text,
  parent_phone text,
  parent_email text,
  parent_address text,
  status public.admission_status NOT NULL DEFAULT 'submitted',
  submitted_by_user_id uuid,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  decision_notes text,
  notes text,
  converted_student_id uuid,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aa_school_idx ON public.admission_applications(school_id);
CREATE INDEX IF NOT EXISTS aa_status_idx ON public.admission_applications(status);
ALTER TABLE public.admission_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aa_select_staff" ON public.admission_applications;
DROP POLICY IF EXISTS "aa_modify_staff" ON public.admission_applications;
CREATE POLICY "aa_select_staff" ON public.admission_applications FOR SELECT USING (public.can_manage_admissions(school_id));
CREATE POLICY "aa_modify_staff" ON public.admission_applications FOR ALL USING (public.can_manage_admissions(school_id)) WITH CHECK (public.can_manage_admissions(school_id));
DROP TRIGGER IF EXISTS aa_updated_at ON public.admission_applications;
CREATE TRIGGER aa_updated_at BEFORE UPDATE ON public.admission_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ADMISSION DOCS
CREATE TABLE IF NOT EXISTS public.admission_application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  application_id uuid NOT NULL REFERENCES public.admission_applications(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  uploaded_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aad_app_idx ON public.admission_application_documents(application_id);
ALTER TABLE public.admission_application_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aad_select_staff" ON public.admission_application_documents;
DROP POLICY IF EXISTS "aad_modify_staff" ON public.admission_application_documents;
CREATE POLICY "aad_select_staff" ON public.admission_application_documents FOR SELECT USING (public.can_manage_admissions(school_id));
CREATE POLICY "aad_modify_staff" ON public.admission_application_documents FOR ALL USING (public.can_manage_admissions(school_id)) WITH CHECK (public.can_manage_admissions(school_id));

-- STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) VALUES ('admission-documents','admission-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admission_docs_read" ON storage.objects;
DROP POLICY IF EXISTS "admission_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "admission_docs_delete" ON storage.objects;
CREATE POLICY "admission_docs_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'admission-documents' AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','academic_coordinator','hr_manager','teacher')
  )
);
CREATE POLICY "admission_docs_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'admission-documents' AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','academic_coordinator','hr_manager','teacher')
  )
);
CREATE POLICY "admission_docs_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'admission-documents' AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','academic_coordinator','hr_manager')
  )
);

-- HELPER: invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number(_school_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _prefix text; _yr text := to_char(now(),'YYYY'); _next int;
BEGIN
  SELECT COALESCE(invoice_prefix,'INV') INTO _prefix FROM public.fee_settings WHERE school_id = _school_id;
  IF _prefix IS NULL THEN _prefix := 'INV'; END IF;
  SELECT COALESCE(MAX(
    CASE WHEN invoice_number ~ ('^' || _prefix || '-' || _yr || '-[0-9]+$')
      THEN (regexp_replace(invoice_number, '^' || _prefix || '-' || _yr || '-', ''))::int
      ELSE 0 END
  ),0)+1 INTO _next FROM public.fee_invoices WHERE school_id = _school_id;
  RETURN _prefix || '-' || _yr || '-' || lpad(_next::text, 6, '0');
END $fn$;

-- HELPER: recalc invoice totals
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _paid numeric(12,2); _total numeric(12,2); _due date; _new_status public.fee_invoice_status;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.fee_payments WHERE invoice_id = _invoice_id AND status = 'success';
  SELECT total_amount, due_date INTO _total, _due FROM public.fee_invoices WHERE id = _invoice_id;
  IF _paid <= 0 THEN
    _new_status := CASE WHEN _due < CURRENT_DATE THEN 'overdue'::public.fee_invoice_status ELSE 'pending'::public.fee_invoice_status END;
  ELSIF _paid >= _total THEN _new_status := 'paid';
  ELSE _new_status := 'partial';
  END IF;
  UPDATE public.fee_invoices SET paid_amount = _paid, status = _new_status, updated_at = now() WHERE id = _invoice_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.fee_payments_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.recalc_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END $fn$;
DROP TRIGGER IF EXISTS fee_payments_recalc_trg ON public.fee_payments;
CREATE TRIGGER fee_payments_recalc_trg
AFTER INSERT OR UPDATE OR DELETE ON public.fee_payments
FOR EACH ROW EXECUTE FUNCTION public.fee_payments_after_change();

-- HELPER: sibling rank
CREATE OR REPLACE FUNCTION public.student_sibling_rank(_school_id uuid, _student_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH guardians AS (SELECT user_id FROM public.student_guardians WHERE student_id = _student_id),
  siblings AS (
    SELECT DISTINCT sg.student_id, s.created_at
    FROM public.student_guardians sg
    JOIN public.students s ON s.id = sg.student_id AND s.school_id = _school_id
    WHERE sg.user_id IN (SELECT user_id FROM guardians)
  )
  SELECT COALESCE((
    SELECT rnk FROM (
      SELECT student_id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rnk FROM siblings
    ) ranked WHERE student_id = _student_id
  ), 1);
$fn$;

-- HELPER: generate invoice
CREATE OR REPLACE FUNCTION public.generate_invoice_for_student(
  _school_id uuid, _student_id uuid, _fee_plan_id uuid, _period_label text, _due_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _inv_id uuid; _inv_no text;
  _subtotal numeric(12,2) := 0; _discount numeric(12,2) := 0; _sib_disc numeric(12,2) := 0;
  _disc_pct numeric(5,2) := 0; _scholar numeric(12,2) := 0;
  _settings public.fee_settings%ROWTYPE; _rank int; _sib_pct numeric(5,2) := 0;
  _total numeric(12,2);
BEGIN
  IF NOT public.can_manage_finance(_school_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO _subtotal FROM public.fee_plan_items WHERE fee_plan_id = _fee_plan_id;
  SELECT discount_pct, scholarship_amount INTO _disc_pct, _scholar
    FROM public.student_fee_assignments WHERE student_id = _student_id AND fee_plan_id = _fee_plan_id LIMIT 1;
  _disc_pct := COALESCE(_disc_pct,0); _scholar := COALESCE(_scholar,0);
  _discount := ROUND(_subtotal * _disc_pct / 100.0, 2) + _scholar;
  SELECT * INTO _settings FROM public.fee_settings WHERE school_id = _school_id;
  IF FOUND THEN
    _rank := public.student_sibling_rank(_school_id, _student_id);
    IF _rank = 2 THEN _sib_pct := COALESCE(_settings.sibling_discount_2nd_pct,0);
    ELSIF _rank >= 3 THEN _sib_pct := COALESCE(_settings.sibling_discount_3rd_plus_pct,0);
    END IF;
    _sib_disc := ROUND((_subtotal - _discount) * _sib_pct / 100.0, 2);
  END IF;
  _total := GREATEST(_subtotal - _discount - _sib_disc, 0);
  _inv_no := public.generate_invoice_number(_school_id);
  INSERT INTO public.fee_invoices (
    school_id, student_id, fee_plan_id, invoice_number, period_label, due_date,
    subtotal, discount_amount, sibling_discount_amount, total_amount, status
  ) VALUES (
    _school_id, _student_id, _fee_plan_id, _inv_no, _period_label, _due_date,
    _subtotal, _discount, _sib_disc, _total,
    CASE WHEN _due_date < CURRENT_DATE THEN 'overdue'::public.fee_invoice_status ELSE 'pending'::public.fee_invoice_status END
  ) RETURNING id INTO _inv_id;
  INSERT INTO public.fee_invoice_items (school_id, invoice_id, label, category, amount, sort_order)
  SELECT _school_id, _inv_id, label, category, amount, sort_order
    FROM public.fee_plan_items WHERE fee_plan_id = _fee_plan_id ORDER BY sort_order;
  RETURN _inv_id;
END $fn$;

-- HELPER: convert admission to student
CREATE OR REPLACE FUNCTION public.convert_admission_to_student(_application_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _app public.admission_applications%ROWTYPE;
  _student_id uuid; _parent_user_id uuid; _plan_id uuid;
  _due date := (CURRENT_DATE + INTERVAL '15 days')::date;
BEGIN
  SELECT * INTO _app FROM public.admission_applications WHERE id = _application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'application not found'; END IF;
  IF NOT public.can_manage_admissions(_app.school_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _app.converted_student_id IS NOT NULL THEN RETURN _app.converted_student_id; END IF;

  INSERT INTO public.students (
    school_id, first_name, last_name, date_of_birth, gender,
    profile_image_url, roll_number, student_code, registration_number,
    parent_name, parent_phone, parent_email, address
  ) VALUES (
    _app.school_id, _app.first_name, _app.last_name, _app.date_of_birth, _app.gender,
    _app.photo_url, _app.roll_number, _app.registration_number, _app.registration_number,
    _app.parent_name, _app.parent_phone, _app.parent_email, _app.parent_address
  ) RETURNING id INTO _student_id;

  IF _app.parent_email IS NOT NULL THEN
    SELECT public.find_parent_user_by_email(_app.school_id, _app.parent_email) INTO _parent_user_id;
    IF _parent_user_id IS NOT NULL THEN
      INSERT INTO public.student_guardians (student_id, user_id, relationship, school_id, full_name, email, phone)
      VALUES (_student_id, _parent_user_id, 'parent', _app.school_id, _app.parent_name, _app.parent_email, _app.parent_phone)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF _app.applying_for_class_id IS NOT NULL THEN
    SELECT id INTO _plan_id FROM public.fee_plans
      WHERE school_id = _app.school_id AND class_id = _app.applying_for_class_id AND is_active = true
      ORDER BY created_at DESC LIMIT 1;
    IF _plan_id IS NOT NULL THEN
      INSERT INTO public.student_fee_assignments (school_id, student_id, fee_plan_id)
      VALUES (_app.school_id, _student_id, _plan_id) ON CONFLICT DO NOTHING;
      PERFORM public.generate_invoice_for_student(_app.school_id, _student_id, _plan_id, 'Admission & first period', _due);
    END IF;
  END IF;

  UPDATE public.admission_applications
     SET status = 'approved', converted_student_id = _student_id, converted_at = now(),
         reviewed_by_user_id = auth.uid(), reviewed_at = now()
   WHERE id = _application_id;
  RETURN _student_id;
END $fn$;

-- Realtime
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.admission_applications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;