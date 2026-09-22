-- Give the platform's billing page somewhere to save.
--
-- PlatformBillingPage writes plan_tier, billing_cycle, billing_amount and
-- billing_email onto `schools`. None of the four existed, so changing a
-- school's plan either failed outright or - when the page decided the schema
-- was "not applied" - was written to the browser's localStorage, which is not
-- a saved plan at all: it lives on one machine, in one browser, and no invoice
-- or renewal can ever see it.
--
-- The page already reads these names and its SchoolBillingData type already
-- declares them, so the columns are what was missing, not the feature.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, so a re-run changes nothing.

BEGIN;

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS plan_tier      text,
    ADD COLUMN IF NOT EXISTS billing_cycle  text,
    ADD COLUMN IF NOT EXISTS billing_amount numeric(12, 2),
    ADD COLUMN IF NOT EXISTS billing_email  text;

-- A school on no recorded plan is a school on the free tier, which is what the
-- page shows for a null today; making it explicit keeps the two in step.
UPDATE public.schools SET plan_tier = 'free' WHERE plan_tier IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'schools_billing_cycle_check'
    ) THEN
        ALTER TABLE public.schools
            ADD CONSTRAINT schools_billing_cycle_check
            CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'quarterly', 'yearly'));
    END IF;
END $$;

GRANT SELECT, UPDATE ON public.schools TO altrix_app;

COMMIT;
