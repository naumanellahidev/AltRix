-- ============================================================================
-- One word for an enrolled lead: 'won'.
--
-- The inquiries screen marked an enrolled lead 'converted'; the marketing and
-- owner reports count 'won', so those leads never showed as conversions.
-- The screen now writes 'won'; this carries earlier rows across.
--
-- Idempotent: safe to run more than once.
-- ============================================================================
BEGIN;
UPDATE public.crm_leads SET status = 'won' WHERE status = 'converted';
COMMIT;
