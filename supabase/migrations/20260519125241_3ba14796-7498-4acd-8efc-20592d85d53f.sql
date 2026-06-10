
-- Notify parent (uploader) when their fee payment proof status changes, and notify finance staff when a new proof is uploaded
CREATE OR REPLACE FUNCTION public.notify_fee_payment_proof_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv_no text;
  _student_first text;
  _student_last text;
  _staff RECORD;
BEGIN
  SELECT invoice_number INTO _inv_no FROM public.fee_invoices WHERE id = NEW.invoice_id;
  SELECT first_name, last_name INTO _student_first, _student_last FROM public.students WHERE id = NEW.student_id;

  IF TG_OP = 'INSERT' THEN
    -- Confirm to uploader (parent)
    IF NEW.uploaded_by IS NOT NULL THEN
      INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id)
      VALUES (
        NEW.school_id, NEW.uploaded_by, 'fee_proof_submitted',
        'Payment proof received',
        'We received your payment proof for invoice ' || COALESCE(_inv_no,'') || '. Awaiting verification.',
        'fee_invoice', NEW.invoice_id
      );
    END IF;
    -- Ping finance staff (principal/owner/super_admin/accountant)
    FOR _staff IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE school_id = NEW.school_id
        AND role IN ('super_admin','school_owner','principal','accountant')
    LOOP
      INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id)
      VALUES (
        NEW.school_id, _staff.user_id, 'fee_proof_pending',
        'New payment proof to verify',
        COALESCE(_student_first,'') || ' ' || COALESCE(_student_last,'') || ' uploaded a proof for ' || COALESCE(_inv_no,''),
        'fee_invoice', NEW.invoice_id
      );
    END LOOP;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.uploaded_by IS NOT NULL THEN
      IF NEW.status = 'verified' THEN
        INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id)
        VALUES (
          NEW.school_id, NEW.uploaded_by, 'fee_proof_verified',
          'Payment verified',
          'Your payment for invoice ' || COALESCE(_inv_no,'') || ' has been verified and applied.',
          'fee_invoice', NEW.invoice_id
        );
      ELSIF NEW.status = 'rejected' THEN
        INSERT INTO public.app_notifications (school_id, user_id, type, title, body, entity_type, entity_id)
        VALUES (
          NEW.school_id, NEW.uploaded_by, 'fee_proof_rejected',
          'Payment proof rejected',
          'Your proof for invoice ' || COALESCE(_inv_no,'') || ' was rejected' ||
            COALESCE('. Reason: ' || NEW.rejection_reason, '') || '. Please re-upload.',
          'fee_invoice', NEW.invoice_id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_fee_payment_proof_change ON public.fee_payment_proofs;
CREATE TRIGGER trg_notify_fee_payment_proof_change
AFTER INSERT OR UPDATE ON public.fee_payment_proofs
FOR EACH ROW EXECUTE FUNCTION public.notify_fee_payment_proof_change();
