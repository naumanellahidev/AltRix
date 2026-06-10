
-- Table for parent-uploaded manual payment proofs
CREATE TABLE IF NOT EXISTS public.fee_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.fee_invoices(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_at date,
  method text DEFAULT 'manual',
  note text,
  status text NOT NULL DEFAULT 'pending', -- pending | verified | rejected
  verified_by uuid,
  verified_at timestamptz,
  rejection_reason text,
  payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fpp_invoice_idx ON public.fee_payment_proofs(invoice_id);
CREATE INDEX IF NOT EXISTS fpp_school_status_idx ON public.fee_payment_proofs(school_id, status);
CREATE INDEX IF NOT EXISTS fpp_student_idx ON public.fee_payment_proofs(student_id);

ALTER TABLE public.fee_payment_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fpp_parent_select" ON public.fee_payment_proofs FOR SELECT
  USING (public.is_my_child(school_id, student_id));

CREATE POLICY "fpp_parent_insert" ON public.fee_payment_proofs FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.is_my_child(school_id, student_id)
    AND status = 'pending'
  );

CREATE POLICY "fpp_staff_select" ON public.fee_payment_proofs FOR SELECT
  USING (public.can_view_fees(school_id));

CREATE POLICY "fpp_staff_modify" ON public.fee_payment_proofs FOR UPDATE
  USING (public.can_manage_finance(school_id))
  WITH CHECK (public.can_manage_finance(school_id));

CREATE POLICY "fpp_staff_delete" ON public.fee_payment_proofs FOR DELETE
  USING (public.can_manage_finance(school_id));

CREATE TRIGGER fpp_updated_at BEFORE UPDATE ON public.fee_payment_proofs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('fee-payment-proofs','fee-payment-proofs', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS: path layout is {school_id}/{invoice_id}/{filename}
CREATE POLICY "fpp_storage_parent_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fee-payment-proofs'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "fpp_storage_parent_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fee-payment-proofs'
    AND EXISTS (
      SELECT 1 FROM public.fee_payment_proofs p
      WHERE p.file_path = name
        AND (public.is_my_child(p.school_id, p.student_id) OR public.can_view_fees(p.school_id))
    )
  );

CREATE POLICY "fpp_storage_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'fee-payment-proofs'
    AND EXISTS (
      SELECT 1 FROM public.fee_payment_proofs p
      WHERE p.file_path = name AND public.can_manage_finance(p.school_id)
    )
  );

-- Verification function
CREATE OR REPLACE FUNCTION public.verify_fee_payment_proof(
  _proof_id uuid, _approve boolean, _amount numeric DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.fee_payment_proofs%ROWTYPE; _pay_id uuid; _amt numeric(12,2);
BEGIN
  SELECT * INTO _p FROM public.fee_payment_proofs WHERE id = _proof_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'proof not found'; END IF;
  IF NOT public.can_manage_finance(_p.school_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _p.status <> 'pending' THEN RAISE EXCEPTION 'proof already %', _p.status; END IF;

  IF _approve THEN
    _amt := COALESCE(_amount, _p.amount);
    INSERT INTO public.fee_payments (
      school_id, student_id, invoice_id, amount, method, status, transaction_ref, notes
    ) VALUES (
      _p.school_id, _p.student_id, _p.invoice_id, _amt, COALESCE(_p.method,'manual'), 'success',
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
