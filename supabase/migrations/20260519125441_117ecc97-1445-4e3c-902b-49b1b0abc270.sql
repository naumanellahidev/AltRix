
CREATE OR REPLACE FUNCTION public.verify_fee_payment_proof(_proof_id uuid, _approve boolean, _amount numeric DEFAULT NULL::numeric, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _p public.fee_payment_proofs%ROWTYPE;
  _pay_id uuid;
  _amt numeric(12,2);
  _method public.fee_payment_method;
BEGIN
  SELECT * INTO _p FROM public.fee_payment_proofs WHERE id = _proof_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'proof not found'; END IF;
  IF NOT public.can_manage_finance(_p.school_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _p.status <> 'pending' THEN RAISE EXCEPTION 'proof already %', _p.status; END IF;

  IF _approve THEN
    _amt := COALESCE(_amount, _p.amount);
    _method := CASE lower(COALESCE(_p.method,''))
                 WHEN 'cash' THEN 'cash'::public.fee_payment_method
                 WHEN 'bank_transfer' THEN 'bank_transfer'::public.fee_payment_method
                 WHEN 'bank' THEN 'bank_transfer'::public.fee_payment_method
                 WHEN 'transfer' THEN 'bank_transfer'::public.fee_payment_method
                 WHEN 'jazzcash' THEN 'jazzcash'::public.fee_payment_method
                 WHEN 'easypaisa' THEN 'easypaisa'::public.fee_payment_method
                 WHEN 'card' THEN 'card'::public.fee_payment_method
                 WHEN 'cheque' THEN 'cheque'::public.fee_payment_method
                 WHEN 'check' THEN 'cheque'::public.fee_payment_method
                 ELSE 'other'::public.fee_payment_method
               END;

    INSERT INTO public.fee_payments (
      school_id, student_id, invoice_id, amount, method, status, transaction_ref, notes
    ) VALUES (
      _p.school_id, _p.student_id, _p.invoice_id, _amt, _method, 'success',
      'PROOF-' || substr(_p.id::text, 1, 8),
      'Manual payment proof verified' || COALESCE(' — ' || _p.note, '')
    ) RETURNING id INTO _pay_id;

    UPDATE public.fee_payment_proofs
       SET status = 'verified', verified_by = auth.uid(), verified_at = now(),
           payment_id = _pay_id, amount = _amt
     WHERE id = _proof_id;
  ELSE
    UPDATE public.fee_payment_proofs
       SET status = 'rejected', verified_by = auth.uid(), verified_at = now(),
           rejection_reason = _reason
     WHERE id = _proof_id;
  END IF;
END $$;
