-- Seven report card designs, not three.
--
-- report_card_settings.template only permitted classic, modern and minimal, so
-- a school that picked any of the four new designs would have had its choice
-- rejected by the check constraint.
--
-- Idempotent: the constraint is dropped if present and recreated, so a re-run
-- leaves exactly the same rule in place.

BEGIN;

ALTER TABLE public.report_card_settings
    DROP CONSTRAINT IF EXISTS report_card_settings_template_check;

ALTER TABLE public.report_card_settings
    ADD CONSTRAINT report_card_settings_template_check
    CHECK (template IN ('classic', 'modern', 'minimal', 'crest', 'ledger', 'bulletin', 'heritage'));

COMMIT;
