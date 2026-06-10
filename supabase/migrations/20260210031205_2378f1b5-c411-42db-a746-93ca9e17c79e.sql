ALTER TABLE public.finance_payment_methods ADD COLUMN IF NOT EXISTS instructions TEXT;
NOTIFY pgrst, 'reload schema';