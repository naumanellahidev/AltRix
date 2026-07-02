-- AltRix: Create event_store, event_subscribers_log, and activity_timeline tables
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS.

-- 1. Create event_store table
CREATE TABLE IF NOT EXISTS public.event_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID,
    user_id UUID,
    entity_type VARCHAR,
    entity_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    correlation_id UUID NOT NULL,
    request_id VARCHAR,
    source VARCHAR DEFAULT 'system',
    status VARCHAR NOT NULL DEFAULT 'published',
    retry_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    version VARCHAR DEFAULT '1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes for event queries
CREATE INDEX IF NOT EXISTS idx_event_store_school_created ON public.event_store(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_store_correlation ON public.event_store(correlation_id);
CREATE INDEX IF NOT EXISTS idx_event_store_name ON public.event_store(event_name);
CREATE INDEX IF NOT EXISTS idx_event_store_category ON public.event_store(category);

-- 2. Create event_subscribers_log table
CREATE TABLE IF NOT EXISTS public.event_subscribers_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.event_store(id) ON DELETE CASCADE,
    subscriber_name VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_subscribers_event ON public.event_subscribers_log(event_id);
CREATE INDEX IF NOT EXISTS idx_event_subscribers_status ON public.event_subscribers_log(status);

-- 3. Create activity_timeline table
CREATE TABLE IF NOT EXISTS public.activity_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_name VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT,
    category VARCHAR NOT NULL,
    entity_type VARCHAR,
    entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_timeline_school ON public.activity_timeline(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_user ON public.activity_timeline(user_id);
