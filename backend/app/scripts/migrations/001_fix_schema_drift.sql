-- AltRix Production: Schema Drift Fix Migration
-- Run ONCE against Supabase using the service role connection.
-- All statements use IF NOT EXISTS / DO NOTHING — safe to re-run.
-- Generated: 2026-06-15

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USER_ROLES — add campus_id column (currently stub in ORM)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE user_roles
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SCHOOLS — add missing columns (currently stubs in ORM)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS tagline TEXT,
    ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR,
    ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT 'trial',
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS owner_user_id UUID;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SALARY_BUDGET_TARGETS — referenced in finance router but may not exist
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_budget_targets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fiscal_year   INTEGER NOT NULL,
    department    VARCHAR,
    role          VARCHAR,
    budget_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HR_LEAVE_TYPES — referenced by hr_leave_requests FK
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_leave_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        VARCHAR NOT NULL,
    max_days    INTEGER DEFAULT 15,
    is_paid     BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. AUDIT_LOGS — ensure FK-less user_id & campus_id columns exist
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS campus_id UUID,
    ADD COLUMN IF NOT EXISTS user_role VARCHAR,
    ADD COLUMN IF NOT EXISTS session_id VARCHAR,
    ADD COLUMN IF NOT EXISTS extra_data JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. APP_NOTIFICATIONS — add missing columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app_notifications
    ADD COLUMN IF NOT EXISTS is_pushed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS priority VARCHAR DEFAULT 'normal';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ASSIGNMENT_SUBMISSIONS — mark duplicate marks columns safe
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE assignment_submissions
    ADD COLUMN IF NOT EXISTS marks_before_penalty NUMERIC,
    ADD COLUMN IF NOT EXISTS penalty_applied NUMERIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FEE_INVOICES — add merit discount fields if missing
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fee_invoices
    ADD COLUMN IF NOT EXISTS merit_discount_amount NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS merit_discount_reason TEXT,
    ADD COLUMN IF NOT EXISTS sibling_discount_amount NUMERIC(12,2) DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. TOKEN_BLACKLIST — for JWT invalidation on logout/refresh
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_blacklist (
    jti         VARCHAR PRIMARY KEY,
    user_id     UUID NOT NULL,
    blacklisted_at TIMESTAMPTZ DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RATE_LIMIT_LOG — optional persistent rate limit tracking
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_events (
    id          BIGSERIAL PRIMARY KEY,
    ip_address  VARCHAR NOT NULL,
    endpoint    VARCHAR NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE rate_limit_events IS 'Login/reset rate limit events for security auditing';
