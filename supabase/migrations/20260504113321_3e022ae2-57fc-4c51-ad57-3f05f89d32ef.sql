
DO $$ BEGIN CREATE TYPE public.easypaisa_env AS ENUM ('sandbox','live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.can_manage_easypaisa(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal')
  );
$fn$;

CREATE TABLE IF NOT EXISTS public.easypaisa_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE,
  store_id text,
  hash_key text,
  account_number text,
  environment public.easypaisa_env NOT NULL DEFAULT 'sandbox',
  return_url text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.easypaisa_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ep_settings_select" ON public.easypaisa_settings;
DROP POLICY IF EXISTS "ep_settings_modify" ON public.easypaisa_settings;
CREATE POLICY "ep_settings_select" ON public.easypaisa_settings FOR SELECT USING (public.can_manage_easypaisa(school_id));
CREATE POLICY "ep_settings_modify" ON public.easypaisa_settings FOR ALL USING (public.can_manage_easypaisa(school_id)) WITH CHECK (public.can_manage_easypaisa(school_id));
DROP TRIGGER IF EXISTS ep_settings_updated_at ON public.easypaisa_settings;
CREATE TRIGGER ep_settings_updated_at BEFORE UPDATE ON public.easypaisa_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_easypaisa_enabled(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT is_enabled FROM public.easypaisa_settings WHERE school_id = _school_id), false);
$fn$;

CREATE TABLE IF NOT EXISTS public.easypaisa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.fee_invoices(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  initiator_user_id uuid,
  order_ref_no text NOT NULL,
  amount numeric(12,2) NOT NULL,
  status public.fee_payment_status NOT NULL DEFAULT 'pending',
  raw_request jsonb,
  raw_response jsonb,
  ep_response_code text,
  ep_response_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ept_invoice_idx ON public.easypaisa_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS ept_ref_idx ON public.easypaisa_transactions(order_ref_no);
ALTER TABLE public.easypaisa_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ept_select_staff" ON public.easypaisa_transactions;
DROP POLICY IF EXISTS "ept_select_parent" ON public.easypaisa_transactions;
DROP POLICY IF EXISTS "ept_select_self" ON public.easypaisa_transactions;
CREATE POLICY "ept_select_staff" ON public.easypaisa_transactions FOR SELECT USING (public.can_view_fees(school_id));
CREATE POLICY "ept_select_parent" ON public.easypaisa_transactions FOR SELECT USING (public.is_my_child(school_id, student_id));
CREATE POLICY "ept_select_self" ON public.easypaisa_transactions FOR SELECT USING (student_id = public.my_student_id(school_id));
DROP TRIGGER IF EXISTS ept_updated_at ON public.easypaisa_transactions;
CREATE TRIGGER ept_updated_at BEFORE UPDATE ON public.easypaisa_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
