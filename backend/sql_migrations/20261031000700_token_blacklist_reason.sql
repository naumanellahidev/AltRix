-- ============================================================================
-- Why a token was retired: 'rotated' (exchanged for a new one) or not.
--
-- A refresh retires the presented token at once. When the browser navigated
-- or reloaded while a refresh was in flight, the new cookie never arrived,
-- the browser presented the old token again, and the user was signed out
-- in the middle of their work. A token retired by rotation is now accepted
-- again for a short grace period; one retired by logout never is.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;
ALTER TABLE public.token_blacklist ADD COLUMN IF NOT EXISTS reason text;
COMMIT;
