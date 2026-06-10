-- ENUMS
DO $$ BEGIN CREATE TYPE public.fee_billing_frequency AS ENUM ('monthly','quarterly','yearly','one_time');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fee_item_category AS ENUM ('tuition','admission','exam','transport','hostel','library','lab','uniform','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fee_invoice_status AS ENUM ('draft','pending','partial','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fee_payment_method AS ENUM ('cash','bank_transfer','jazzcash','easypaisa','card','cheque','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fee_payment_status AS ENUM ('pending','success','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.admission_status AS ENUM ('submitted','under_review','approved','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.jazzcash_env AS ENUM ('sandbox','live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Role helper functions
CREATE OR REPLACE FUNCTION public.can_view_fees(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','accountant','academic_coordinator','hr_manager')
  );
$fn$;

CREATE OR REPLACE FUNCTION public.can_manage_admissions(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','academic_coordinator','hr_manager','teacher')
  );
$fn$;

CREATE OR REPLACE FUNCTION public.can_manage_jazzcash(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal')
  );
$fn$;