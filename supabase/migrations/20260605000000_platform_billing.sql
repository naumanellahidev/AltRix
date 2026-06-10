-- Migration: Platform Billing & Subscriptions for Schools
-- Add subscription/billing fields to schools table
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'Basic';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'monthly';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS billing_amount numeric DEFAULT 99.00;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS next_billing_date date DEFAULT (CURRENT_DATE + INTERVAL '1 month');
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS billing_status text DEFAULT 'Active';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS billing_email text;

-- Create platform_invoices table to record billing charges
CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_number text UNIQUE NOT NULL,
  amount numeric NOT NULL,
  billing_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Paid', 'Unpaid', 'Overdue')),
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on platform_invoices
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

-- Create policy for Platform Super Admins to manage all platform invoices
CREATE POLICY "Platform Super Admins can manage platform invoices"
ON public.platform_invoices
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.platform_super_admins
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.platform_super_admins
    WHERE user_id = auth.uid()
  )
);

-- Create policy for School Owners to read their own school's platform invoices
CREATE POLICY "School Owners can read own school platform invoices"
ON public.platform_invoices FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.school_owner_assignments
    WHERE school_id = platform_invoices.school_id AND owner_user_id = auth.uid()
  )
);

-- Helper function to generate platform invoice numbers
CREATE OR REPLACE FUNCTION public.generate_platform_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq integer;
  v_num text;
BEGIN
  v_seq := nextval('public.finance_invoice_seq'::regclass); -- Reuse existing invoice sequence if available, or generate one
  v_num := 'PLAT-INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');
  RETURN v_num;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback sequence generator in case finance_invoice_seq doesn't exist or seq is inaccessible
    v_num := 'PLAT-INV-' || to_char(now(), 'YYYYMM') || '-' || floor(random() * 9000 + 1000)::text;
    RETURN v_num;
END;
$$;

-- Function to handle school upgrade/downgrade plan change
CREATE OR REPLACE FUNCTION public.change_school_subscription_plan(
  _school_id uuid,
  _new_plan text,
  _new_amount numeric,
  _billing_cycle text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.schools
  SET plan_tier = _new_plan,
      billing_amount = _new_amount,
      billing_cycle = _billing_cycle,
      next_billing_date = CURRENT_DATE + CASE WHEN _billing_cycle = 'yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END
  WHERE id = _school_id;
END;
$$;

-- Function to automatically generate recurring monthly/yearly invoices
CREATE OR REPLACE FUNCTION public.cron_generate_platform_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_inv_num text;
  v_count integer := 0;
BEGIN
  FOR r IN 
    SELECT id, name, billing_amount, billing_cycle, billing_email, next_billing_date 
    FROM public.schools 
    WHERE is_active = true AND next_billing_date <= CURRENT_DATE
  LOOP
    v_inv_num := public.generate_platform_invoice_number();
    
    INSERT INTO public.platform_invoices (
      school_id,
      invoice_number,
      amount,
      billing_date,
      due_date,
      status
    ) VALUES (
      r.id,
      v_inv_num,
      r.billing_amount,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '10 days',
      'Unpaid'
    );

    -- Update next billing date
    UPDATE public.schools
    SET next_billing_date = CURRENT_DATE + CASE WHEN r.billing_cycle = 'yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END
    WHERE id = r.id;

    v_count := v_count + 1;
  END FOR;

  RETURN v_count;
END;
$$;
