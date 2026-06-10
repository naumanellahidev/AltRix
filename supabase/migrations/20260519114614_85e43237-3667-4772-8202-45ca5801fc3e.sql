
-- Additive columns on fee_invoices for merit / extra discounts
ALTER TABLE public.fee_invoices
  ADD COLUMN IF NOT EXISTS merit_discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merit_discount_reason text;

-- Track bulk voucher generation runs
CREATE TABLE IF NOT EXISTS public.fee_voucher_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  scope text NOT NULL DEFAULT 'class', -- 'individual' | 'class' | 'section'
  class_id uuid REFERENCES public.academic_classes(id) ON DELETE SET NULL,
  class_section_id uuid REFERENCES public.class_sections(id) ON DELETE SET NULL,
  fee_plan_id uuid REFERENCES public.fee_plans(id) ON DELETE SET NULL,
  period_label text,
  due_date date NOT NULL,
  default_discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  grade_discount_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  total_students integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_voucher_batches_school ON public.fee_voucher_batches(school_id);

ALTER TABLE public.fee_voucher_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fvb_select" ON public.fee_voucher_batches;
CREATE POLICY "fvb_select" ON public.fee_voucher_batches
  FOR SELECT TO authenticated
  USING (public.can_view_fees(school_id));

DROP POLICY IF EXISTS "fvb_modify" ON public.fee_voucher_batches;
CREATE POLICY "fvb_modify" ON public.fee_voucher_batches
  FOR ALL TO authenticated
  USING (public.can_manage_finance(school_id))
  WITH CHECK (public.can_manage_finance(school_id));

-- RPC: generate a single voucher (invoice) and notify parents
CREATE OR REPLACE FUNCTION public.generate_fee_voucher(
  _school_id uuid,
  _student_id uuid,
  _fee_plan_id uuid,
  _period_label text,
  _due_date date,
  _extra_discount_pct numeric DEFAULT 0,
  _extra_discount_amount numeric DEFAULT 0,
  _extra_discount_reason text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _batch_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv_id uuid;
  _inv_no text;
  _subtotal numeric(12,2) := 0;
  _base_discount numeric(12,2) := 0;
  _merit_discount numeric(12,2) := 0;
  _sib_disc numeric(12,2) := 0;
  _disc_pct numeric(5,2) := 0;
  _scholar numeric(12,2) := 0;
  _settings public.fee_settings%ROWTYPE;
  _rank int := 1;
  _sib_pct numeric(5,2) := 0;
  _total numeric(12,2);
  _student_first text;
  _student_last text;
  _guardian RECORD;
BEGIN
  IF NOT public.can_manage_finance(_school_id) THEN
    RAISE EXCEPTION 'not authorized to generate vouchers';
  END IF;

  -- compute subtotal from fee plan items
  SELECT COALESCE(SUM(amount),0) INTO _subtotal
    FROM public.fee_plan_items WHERE fee_plan_id = _fee_plan_id;

  -- base discount from student fee assignment (existing logic)
  SELECT discount_pct, scholarship_amount INTO _disc_pct, _scholar
    FROM public.student_fee_assignments
    WHERE student_id = _student_id AND fee_plan_id = _fee_plan_id LIMIT 1;
  _disc_pct := COALESCE(_disc_pct, 0);
  _scholar  := COALESCE(_scholar, 0);
  _base_discount := ROUND(_subtotal * _disc_pct / 100.0, 2) + _scholar;

  -- merit / manual extra discount
  _merit_discount := COALESCE(_extra_discount_amount, 0)
                   + ROUND(_subtotal * COALESCE(_extra_discount_pct, 0) / 100.0, 2);

  -- sibling discount (existing settings)
  BEGIN
    SELECT * INTO _settings FROM public.fee_settings WHERE school_id = _school_id;
    IF FOUND THEN
      _rank := public.student_sibling_rank(_school_id, _student_id);
      IF _rank = 2 THEN _sib_pct := COALESCE(_settings.sibling_discount_2nd_pct, 0);
      ELSIF _rank >= 3 THEN _sib_pct := COALESCE(_settings.sibling_discount_3rd_plus_pct, 0);
      END IF;
      _sib_disc := ROUND(GREATEST(_subtotal - _base_discount - _merit_discount, 0) * _sib_pct / 100.0, 2);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    _sib_disc := 0;
  END;

  _total := GREATEST(_subtotal - _base_discount - _merit_discount - _sib_disc, 0);
  _inv_no := public.generate_invoice_number(_school_id);

  INSERT INTO public.fee_invoices (
    school_id, student_id, fee_plan_id, invoice_number, period_label, due_date,
    subtotal, discount_amount, sibling_discount_amount, merit_discount_amount,
    merit_discount_reason, total_amount, status, notes
  ) VALUES (
    _school_id, _student_id, _fee_plan_id, _inv_no, _period_label, _due_date,
    _subtotal, _base_discount, _sib_disc, _merit_discount,
    _extra_discount_reason, _total,
    CASE WHEN _due_date < CURRENT_DATE THEN 'overdue'::public.fee_invoice_status
         ELSE 'pending'::public.fee_invoice_status END,
    _notes
  ) RETURNING id INTO _inv_id;

  INSERT INTO public.fee_invoice_items (school_id, invoice_id, label, category, amount, sort_order)
  SELECT _school_id, _inv_id, label, category, amount, sort_order
    FROM public.fee_plan_items WHERE fee_plan_id = _fee_plan_id ORDER BY sort_order;

  -- get student name for notification
  SELECT first_name, last_name INTO _student_first, _student_last
    FROM public.students WHERE id = _student_id;

  -- notify every linked guardian
  FOR _guardian IN
    SELECT user_id FROM public.student_guardians
     WHERE student_id = _student_id AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.parent_notifications (
      school_id, student_id, parent_user_id, title, content, notification_type
    ) VALUES (
      _school_id, _student_id, _guardian.user_id,
      'New Fee Voucher: ' || _inv_no,
      'A new fee voucher has been issued for ' || COALESCE(_student_first,'') || ' ' || COALESCE(_student_last,'') ||
        '. Amount: ' || _total::text || '. Due: ' || _due_date::text || '.',
      'fee_voucher'
    );

    INSERT INTO public.app_notifications (
      school_id, user_id, type, title, body, entity_type, entity_id
    ) VALUES (
      _school_id, _guardian.user_id, 'fee_voucher',
      'New Fee Voucher: ' || _inv_no,
      'Amount due: ' || _total::text || ' by ' || _due_date::text,
      'fee_invoice', _inv_id
    );
  END LOOP;

  RETURN _inv_id;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_fee_voucher(uuid, uuid, uuid, text, date, numeric, numeric, text, text, uuid) TO authenticated;
