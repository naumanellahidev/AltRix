-- AltRix: Extend app_notifications to support enterprise notification features
-- Safe to re-run: uses IF NOT EXISTS and checks column existence.

ALTER TABLE public.app_notifications
    ADD COLUMN IF NOT EXISTS icon VARCHAR,
    ADD COLUMN IF NOT EXISTS color VARCHAR,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- Performance indexes for filter/grouping queries
CREATE INDEX IF NOT EXISTS idx_notifications_archived_at ON public.app_notifications(user_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_favorite ON public.app_notifications(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_notifications_is_pinned ON public.app_notifications(user_id, is_pinned);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.app_notifications(user_id, priority);
