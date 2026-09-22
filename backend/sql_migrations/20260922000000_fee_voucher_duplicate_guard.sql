-- Fee vouchers: stop billing the same child twice for the same period.
--
-- generate_fee_voucher had no duplicate check, so re-running a class billing
-- created a second full invoice for every student in it. Production showed
-- three June invoices for one student and two "Voucher August 2026" invoices
-- for another; both copies were counted as money owed, so the defaulters list
-- and every total built on it were wrong.
--
-- The old 10-argument function is dropped and recreated with an eleventh
-- argument, _allow_duplicate (default false). Existing 10-argument callers
-- keep working and now get the guard; a deliberate re-bill passes true.
--
-- Invoices that already exist are left exactly as they are. Cancelling one of
-- a pair is an accounting decision for the school, and the Billing Run screen
-- lists the duplicates so the office can do it with a reason on the record.

-- Idempotent: DROP FUNCTION IF EXISTS followed by CREATE OR REPLACE, so a
-- re-run leaves exactly the same function in place.

BEGIN;

DROP FUNCTION IF EXISTS public.generate_fee_voucher(uuid, uuid, uuid, text, date, numeric, numeric, text, text, uuid);

CREATE OR REPLACE FUNCTION public.generate_fee_voucher(_school_id uuid, _student_id uuid, _fee_plan_id uuid, _period_label text, _due_date date, _extra_discount_pct numeric DEFAULT 0, _extra_discount_amount numeric DEFAULT 0, _extra_discount_reason text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _batch_id uuid DEFAULT NULL::uuid, _allow_duplicate boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inv_id uuid; _inv_no text;
  _subtotal numeric(12,2) := 0; _base_discount numeric(12,2) := 0;
  _merit_discount numeric(12,2) := 0; _sib_disc numeric(12,2) := 0;
  _disc_pct numeric(5,2) := 0; _scholar numeric(12,2) := 0;
  _settings public.fee_settings%ROWTYPE; _rank int := 1; _sib_pct numeric(5,2) := 0;
  _total numeric(12,2);
  _student_first text; _student_last text;
  _guardian RECORD; _pn_id uuid; _an_id uuid;
  _dup_id uuid; _dup_no text;
BEGIN
  IF NOT public.can_manage_finance(_school_id) THEN
    RAISE EXCEPTION 'not authorized to generate vouchers';
  END IF;

  -- One voucher per student, per plan, per period.
  --
  -- Running a class billing twice used to bill every child again: production
  -- carried three June invoices for one student and a second "Voucher August
  -- 2026" for another, and both copies counted towards what the family owed.
  -- A deliberate re-bill is still possible - the caller passes
  -- _allow_duplicate - but it can no longer happen by accident.
  IF NOT COALESCE(_allow_duplicate, false) THEN
    SELECT id, invoice_number INTO _dup_id, _dup_no
      FROM public.fee_invoices
     WHERE school_id = _school_id
       AND student_id = _student_id
       AND fee_plan_id IS NOT DISTINCT FROM _fee_plan_id
       AND COALESCE(period_label, '') = COALESCE(_period_label, '')
       AND status <> 'cancelled'
     ORDER BY created_at
     LIMIT 1;
    IF _dup_id IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_voucher: % already covers % for this student', _dup_no, COALESCE(_period_label, 'this period')
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO _subtotal
    FROM public.fee_plan_items WHERE fee_plan_id = _fee_plan_id;

  SELECT discount_pct, scholarship_amount INTO _disc_pct, _scholar
    FROM public.student_fee_assignments
    WHERE student_id = _student_id AND fee_plan_id = _fee_plan_id LIMIT 1;
  _disc_pct := COALESCE(_disc_pct,0); _scholar := COALESCE(_scholar,0);
  _base_discount := ROUND(_subtotal * _disc_pct / 100.0, 2) + _scholar;

  _merit_discount := COALESCE(_extra_discount_amount,0)
                   + ROUND(_subtotal * COALESCE(_extra_discount_pct,0) / 100.0, 2);

  BEGIN
    SELECT * INTO _settings FROM public.fee_settings WHERE school_id = _school_id;
    IF FOUND THEN
      _rank := public.student_sibling_rank(_school_id, _student_id);
      IF _rank = 2 THEN _sib_pct := COALESCE(_settings.sibling_discount_2nd_pct,0);
      ELSIF _rank >= 3 THEN _sib_pct := COALESCE(_settings.sibling_discount_3rd_plus_pct,0);
      END IF;
      _sib_disc := ROUND(GREATEST(_subtotal - _base_discount - _merit_discount, 0) * _sib_pct / 100.0, 2);
    END IF;
  EXCEPTION WHEN OTHERS THEN _sib_disc := 0; END;

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

  SELECT first_name, last_name INTO _student_first, _student_last
    FROM public.students WHERE id = _student_id;

  FOR _guardian IN
    SELECT sg.user_id, sg.full_name, sg.email, sg.phone
      FROM public.student_guardians sg
     WHERE sg.student_id = _student_id
  LOOP
    _pn_id := NULL; _an_id := NULL;
    IF _guardian.user_id IS NOT NULL THEN
      INSERT INTO public.parent_notifications (
        school_id, student_id, parent_user_id, title, content, notification_type
      ) VALUES (
        _school_id, _student_id, _guardian.user_id,
        'New Fee Voucher: ' || _inv_no,
        'A new fee voucher has been issued for ' || COALESCE(_student_first,'') || ' ' || COALESCE(_student_last,'') ||
          '. Amount: ' || _total::text || '. Due: ' || _due_date::text || '.',
        'fee_voucher'
      ) RETURNING id INTO _pn_id;

      INSERT INTO public.app_notifications (
        school_id, user_id, type, title, body, entity_type, entity_id
      ) VALUES (
        _school_id, _guardian.user_id, 'fee_voucher',
        'New Fee Voucher: ' || _inv_no,
        'Amount due: ' || _total::text || ' by ' || _due_date::text,
        'fee_invoice', _inv_id
      ) RETURNING id INTO _an_id;
    END IF;

    INSERT INTO public.fee_voucher_deliveries (
      school_id, invoice_id, batch_id, student_id,
      guardian_user_id, guardian_name, guardian_email, guardian_phone,
      parent_notification_id, app_notification_id,
      channel, status
    ) VALUES (
      _school_id, _inv_id, _batch_id, _student_id,
      _guardian.user_id, _guardian.full_name, _guardian.email, _guardian.phone,
      _pn_id, _an_id,
      CASE WHEN _guardian.user_id IS NOT NULL THEN 'in_app' ELSE 'none' END,
      CASE WHEN _guardian.user_id IS NOT NULL THEN 'sent' ELSE 'no_account' END
    );
  END LOOP;

  RETURN _inv_id;
END $function$;

COMMIT;
