-- ============================================================================
-- A school's tax settings, kept by the school rather than by one browser.
--
-- The tax centre saved its rate, withholding rate and fiscal-year start in the
-- accountant's browser (localStorage): another accountant, or the same one on
-- another computer, saw a different rate, a different fiscal year and so a
-- different tax liability for the same books.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_tax_settings (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id          uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
    rate_pct           numeric(6,3) NOT NULL DEFAULT 0 CHECK (rate_pct >= 0 AND rate_pct <= 100),
    withholding_pct    numeric(6,3) NOT NULL DEFAULT 0 CHECK (withholding_pct >= 0 AND withholding_pct <= 100),
    fiscal_start_month smallint NOT NULL DEFAULT 7 CHECK (fiscal_start_month BETWEEN 1 AND 12),
    updated_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'altrix_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_tax_settings TO altrix_app;
    END IF;
END $$;

COMMIT;
