CREATE POLICY "fpp_parent_update_own_pending" ON public.fee_payment_proofs
  FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    AND status = 'pending'
    AND public.is_my_child(school_id, student_id)
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    AND status = 'pending'
    AND public.is_my_child(school_id, student_id)
  );

CREATE POLICY "fpp_parent_delete_own_pending" ON public.fee_payment_proofs
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    AND status = 'pending'
    AND public.is_my_child(school_id, student_id)
  );

CREATE POLICY "fpp_storage_parent_delete_own_pending" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fee-payment-proofs'
    AND EXISTS (
      SELECT 1 FROM public.fee_payment_proofs p
      WHERE p.file_path = name
        AND p.uploaded_by = auth.uid()
        AND p.status = 'pending'
    )
  );