-- SQL Migration to fix missing columns on admin_messages, fee_invoices, and student_certificates tables

-- 1. Alter admin_messages Table
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS attachment_urls text[] DEFAULT '{}'::text[];
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.admin_messages(id) ON DELETE SET NULL;
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS campus_id uuid;

-- 2. Drop legacy body/content trigger on admin_messages
DROP TRIGGER IF EXISTS trg_sync_admin_messages_body_content ON public.admin_messages;
DROP FUNCTION IF EXISTS public.sync_admin_messages_body_content();


-- 3. Alter fee_invoices Table
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS late_fee numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS merit_discount_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS merit_discount_reason text;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS period_end date;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS period_label text;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS sibling_discount_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS fee_plan_id uuid REFERENCES public.fee_plans(id) ON DELETE SET NULL;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS campus_id uuid;
ALTER TABLE public.fee_invoices ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 4. Trigger to Sync fee_invoices amount and total_amount
CREATE OR REPLACE FUNCTION public.sync_fee_invoices_amounts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_amount IS NOT NULL AND NEW.total_amount != 0 AND (NEW.amount IS NULL OR NEW.amount = 0) THEN
    NEW.amount := NEW.total_amount;
  ELSIF NEW.amount IS NOT NULL AND NEW.amount != 0 AND (NEW.total_amount IS NULL OR NEW.total_amount = 0) THEN
    NEW.total_amount := NEW.amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_fee_invoices_amounts ON public.fee_invoices;
CREATE TRIGGER trg_sync_fee_invoices_amounts
BEFORE INSERT OR UPDATE ON public.fee_invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_fee_invoices_amounts();


-- 5. Alter student_certificates Table
ALTER TABLE public.student_certificates ADD COLUMN IF NOT EXISTS issued_at date;

-- Populate issued_at from issued_date for existing rows
UPDATE public.student_certificates 
SET issued_at = issued_date 
WHERE issued_at IS NULL AND issued_date IS NOT NULL;


-- 6. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
