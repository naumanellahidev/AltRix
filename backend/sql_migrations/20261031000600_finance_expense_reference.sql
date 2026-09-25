-- ============================================================================
-- Expenses: the reference and the payment method the forms record.
--
-- Both expense forms (accountant and fees) and the offline sync send a
-- reference (cheque or receipt number) and the payment method. Neither had a
-- column, and the data proxy refuses a write naming an unknown column, so
-- every expense recorded or edited from those screens failed with
-- "Invalid column reference".
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

ALTER TABLE public.finance_expenses ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.finance_expenses ADD COLUMN IF NOT EXISTS payment_method_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_expenses_payment_method_id_fkey') THEN
        ALTER TABLE public.finance_expenses
            ADD CONSTRAINT finance_expenses_payment_method_id_fkey
            FOREIGN KEY (payment_method_id) REFERENCES public.finance_payment_methods(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_finance_expenses_payment_method
    ON public.finance_expenses (payment_method_id) WHERE payment_method_id IS NOT NULL;

COMMIT;
