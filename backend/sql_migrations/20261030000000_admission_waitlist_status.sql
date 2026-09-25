-- ============================================================================
-- A waiting list for admissions.
--
-- The admissions screen has a "Waitlist" button, a waitlisted filter and a
-- waitlisted count, but `admission_status` had no such value. Every click
-- was refused by the database ("invalid input value for enum"), and the
-- count was always zero. The value is added, so the feature does what it
-- says.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

ALTER TYPE public.admission_status ADD VALUE IF NOT EXISTS 'waitlisted' AFTER 'under_review';
