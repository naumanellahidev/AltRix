-- =============================================================================
-- AltRix Security Tables Migration
-- Run once on first deployment. Safe to run multiple times (IF NOT EXISTS).
-- =============================================================================

-- Ensure token_blacklist is compatible with existing schema if any
CREATE TABLE IF NOT EXISTS public.token_blacklist (
    jti         VARCHAR PRIMARY KEY,
    user_id     UUID NOT NULL,
    blacklisted_at TIMESTAMPTZ DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);

-- Active sessions table
CREATE TABLE IF NOT EXISTS public.active_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    school_id     UUID,
    ip_address    VARCHAR(100),
    user_agent    TEXT,
    token_hash    VARCHAR(64),
    logged_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logged_out_at TIMESTAMPTZ,
    logout_reason VARCHAR(50),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON public.active_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_active ON public.active_sessions (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_active_sessions_school ON public.active_sessions (school_id);

-- Security events log
CREATE TABLE IF NOT EXISTS public.security_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    VARCHAR(100) NOT NULL,
    user_id       UUID,
    school_id     UUID,
    ip_address    VARCHAR(100),
    user_agent    TEXT,
    details       JSONB DEFAULT '{}',
    severity      VARCHAR(20) DEFAULT 'info',
    resolved      BOOLEAN DEFAULT FALSE,
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events (event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events (user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events (severity, created_at DESC);

-- Failed login attempts forensics table
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(320),
    ip_address    VARCHAR(100),
    user_agent    TEXT,
    failure_reason VARCHAR(200),
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_logins_email ON public.failed_login_attempts (email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_logins_ip ON public.failed_login_attempts (ip_address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_logins_time ON public.failed_login_attempts (attempted_at DESC);

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_security_tables()
RETURNS void AS $$
BEGIN
    DELETE FROM public.token_blacklist WHERE expires_at < NOW();
    DELETE FROM public.security_events WHERE created_at < NOW() - INTERVAL '90 days';
    DELETE FROM public.failed_login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days';
    UPDATE public.active_sessions
    SET is_active = FALSE, logout_reason = 'timeout'
    WHERE is_active = TRUE AND last_seen_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
