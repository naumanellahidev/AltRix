-- ============================================================================
-- Platform billing that is real: where each school's billing stands, the
-- platform's invoices to schools, and the monthly run that raises them.
--
-- The platform billing page read `platform_invoices` and called
-- `cron_generate_platform_invoices`, and neither existed. When the read
-- failed, the page invented invoices in the browser ("PLAT-INV-202605-100",
-- one of them "Paid") and kept them in localStorage, so the owner was shown
-- money that was never billed. `schools` also lacked `next_billing_date` and
-- `billing_status`, so every school was shown "next bill in 30 days" whatever
-- the truth.
--
-- The invoices belong to the platform, not to the school: they are
-- reachable through the data proxy by the platform owner only (see
-- app/utils/db_proxy_policy.py PLATFORM_ONLY_TABLES).
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS next_billing_date date;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'Active';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_billing_status_check') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_billing_status_check
      CHECK (billing_status IN ('Active', 'Overdue', 'Suspended'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL UNIQUE,
  kind           text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'recurring')),
  amount         numeric(12, 2) NOT NULL CHECK (amount >= 0),
  billing_date   date NOT NULL DEFAULT current_date,
  due_date       date,
  status         text NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid', 'Overdue', 'Cancelled')),
  paid_at        timestamptz,
  notes          text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_school ON public.platform_invoices (school_id, billing_date DESC);
-- One recurring invoice per school per billing date, however often the run is pressed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_invoice_recurring
    ON public.platform_invoices (school_id, billing_date) WHERE kind = 'recurring';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'altrix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_invoices TO altrix_app;
  END IF;
END
$$;

-- ── The billing run ─────────────────────────────────────────────────────────
-- For every active school on a paid plan whose billing date has come: raise
-- one recurring invoice for its plan amount, due in ten days, and move its
-- next billing date on by its cycle. A school with no billing date yet is
-- given one (a cycle from today) rather than billed by surprise. Unpaid
-- invoices past their due date become Overdue, and so does their school.
-- Returns how many invoices were raised. Platform owner only.
CREATE OR REPLACE FUNCTION public.cron_generate_platform_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s record;
  raised integer := 0;
  step interval;
  inserted integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the platform owner may run billing.';
  END IF;

  FOR s IN
    SELECT id, slug, billing_amount, billing_cycle, next_billing_date
      FROM schools
     WHERE coalesce(billing_amount, 0) > 0
       AND coalesce(billing_status, 'Active') <> 'Suspended'
       AND coalesce(is_active, true)
     FOR UPDATE
  LOOP
    step := CASE WHEN lower(coalesce(s.billing_cycle, 'monthly')) IN ('yearly', 'annual') THEN interval '1 year'
                 ELSE interval '1 month' END;
    IF s.next_billing_date IS NULL THEN
      UPDATE schools SET next_billing_date = (current_date + step)::date WHERE id = s.id;
      CONTINUE;
    END IF;
    IF s.next_billing_date > current_date THEN
      CONTINUE;
    END IF;
    INSERT INTO platform_invoices (school_id, invoice_number, kind, amount, billing_date, due_date, status, notes)
    VALUES (s.id,
            'PLAT-' || to_char(s.next_billing_date, 'YYYYMMDD') || '-' || upper(coalesce(s.slug, left(s.id::text, 8))),
            'recurring', s.billing_amount, s.next_billing_date, s.next_billing_date + 10, 'Unpaid',
            'Plan charge, ' || lower(coalesce(s.billing_cycle, 'monthly')))
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    raised := raised + inserted;
    UPDATE schools SET next_billing_date = (s.next_billing_date + step)::date WHERE id = s.id;
  END LOOP;

  UPDATE platform_invoices SET status = 'Overdue'
   WHERE status = 'Unpaid' AND due_date < current_date;
  UPDATE schools sc SET billing_status = CASE
           WHEN EXISTS (SELECT 1 FROM platform_invoices pi WHERE pi.school_id = sc.id AND pi.status = 'Overdue')
           THEN 'Overdue' ELSE 'Active' END
   WHERE sc.billing_status <> 'Suspended';

  RETURN raised;
END
$$;

COMMIT;
