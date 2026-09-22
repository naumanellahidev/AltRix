-- How this school's report cards are printed.
--
-- A report card must come out on a single sheet. Most do; one with twenty
-- subjects, a photo, a term chart and two sets of remarks does not, and the
-- builder cannot decide on its own what should give way — that is the school's
-- call, and it must be the same call every time, for every child, or one class
-- goes home on one sheet and the next on two.
--
-- So the principal is asked once, the answer is kept here, and every later
-- card follows it without asking again. The Report Cards screen can change it.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS plus guarded ALTERs, so a re-run
-- leaves exactly the same table in place.

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_card_settings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,

    -- What to do when a card genuinely will not fit on one portrait sheet:
    --   compact    tighten type and spacing as far as the floor allows
    --   landscape  turn the sheet and set the subjects in two columns
    --   two_pages  keep the portrait layout and let it run to a second sheet
    fit_strategy        text NOT NULL DEFAULT 'compact',

    -- classic | modern | minimal
    template            text NOT NULL DEFAULT 'classic',

    show_photo          boolean NOT NULL DEFAULT true,
    show_attendance     boolean NOT NULL DEFAULT true,
    show_activities     boolean NOT NULL DEFAULT true,
    show_term_trend     boolean NOT NULL DEFAULT true,
    show_grade_key      boolean NOT NULL DEFAULT true,
    show_rank           boolean NOT NULL DEFAULT true,

    -- NULL means nobody has been asked yet, which is what makes the Report
    -- Cards screen offer the one-time setup.
    configured_at       timestamptz,
    configured_by       uuid,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_card_settings_school
    ON public.report_card_settings (school_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'report_card_settings_fit_strategy_check'
    ) THEN
        ALTER TABLE public.report_card_settings
            ADD CONSTRAINT report_card_settings_fit_strategy_check
            CHECK (fit_strategy IN ('compact', 'landscape', 'two_pages'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'report_card_settings_template_check'
    ) THEN
        ALTER TABLE public.report_card_settings
            ADD CONSTRAINT report_card_settings_template_check
            CHECK (template IN ('classic', 'modern', 'minimal'));
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column')
       AND NOT EXISTS (
           SELECT 1 FROM pg_trigger WHERE tgname = 'rcs_updated_at'
       ) THEN
        CREATE TRIGGER rcs_updated_at
            BEFORE UPDATE ON public.report_card_settings
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_card_settings TO altrix_app;

COMMIT;
