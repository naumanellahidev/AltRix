"""
Schema bootstrap.

Everything in here used to run inside the FastAPI lifespan, on every boot of
every container: ``Base.metadata.create_all`` plus 19 CREATE TABLE, 8 ALTER
TABLE, 26 CREATE INDEX, two functions and two seed inserts.

Three reasons that had to move:

* **Concurrency.** The API, the Celery worker and the Celery beat container all
  start at once and all ran this. Concurrent CREATE INDEX and ALTER TABLE on the
  same objects take conflicting locks; at best they serialise and slow every
  deploy, at worst they deadlock during startup.
* **Least privilege.** The API cannot stop connecting as a database superuser
  while it needs DDL rights on boot — and connecting as a superuser is what
  makes all ~604 row-level security policies inert. Moving DDL out is the
  prerequisite for that cutover.
* **Visibility.** Schema changes applied implicitly by whichever container
  happened to boot first are invisible in review and impossible to roll back.

The statements are unchanged and remain idempotent (IF NOT EXISTS throughout).
They now run as an explicit deploy step:

    python -m app.db_bootstrap

In development, where there is one process and no deploy pipeline, the app still
applies them on boot unless told otherwise — see ``should_run_on_startup``.
"""
import asyncio
import logging

from sqlalchemy import text

from app.config import settings
from app.database import engine

logger = logging.getLogger("app.db_bootstrap")


async def _execute_script(conn, sql: str) -> None:
    """
    Run several ;-separated statements one at a time.

    asyncpg sends each execute as a prepared statement, which may hold only one
    command; a block of several failed with "cannot insert multiple commands
    into a prepared statement" and took the rest of its try block with it -
    which is how the token-invalidation table was never created.
    """
    for statement in (part.strip() for part in sql.split(";")):
        if statement:
            await conn.execute(text(statement))


def should_run_on_startup() -> bool:
    """
    Whether the app should apply the schema itself when it boots.

    Off in production: several containers start together and would race each
    other for locks on the same tables. Overridable with RUN_STARTUP_DDL for a
    deployment that has no separate migration step yet.
    """
    override = (getattr(settings, "run_startup_ddl", "") or "").strip().lower()
    if override in ("1", "true", "yes"):
        return True
    if override in ("0", "false", "no"):
        return False
    return not settings.is_production


async def apply_schema_bootstrap() -> None:
    """Apply the idempotent schema bootstrap. Safe to run repeatedly."""
    # 1. Verify Database Connection & Initialize Settings
    try:
        from app.database import Base
        import app.models  # Register all ORM models
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database connection ping: SUCCESS (All ORM tables verified/created)")

            # Auto-align report_cards table columns if missing
            await conn.execute(text("""
                ALTER TABLE public.report_cards
                    ADD COLUMN IF NOT EXISTS template_id UUID,
                    ADD COLUMN IF NOT EXISTS max_total_marks DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS position_in_class INTEGER,
                    ADD COLUMN IF NOT EXISTS total_students_in_class INTEGER,
                    ADD COLUMN IF NOT EXISTS total_present_days INTEGER,
                    ADD COLUMN IF NOT EXISTS total_school_days INTEGER,
                    ADD COLUMN IF NOT EXISTS qr_verification_token VARCHAR,
                    ADD COLUMN IF NOT EXISTS signed_by_name VARCHAR,
                    ADD COLUMN IF NOT EXISTS signed_by_title VARCHAR,
                    ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS trend_data JSONB DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS generated_by UUID;
            """))
            logger.info("Report cards schema columns aligned successfully")

            # Auto-align book_issues & library_books table columns
            await _execute_script(conn, """
                ALTER TABLE public.book_issues
                    ADD COLUMN IF NOT EXISTS campus_id UUID,
                    ADD COLUMN IF NOT EXISTS fine_per_day NUMERIC(10, 2) DEFAULT 20.00;
                
                ALTER TABLE public.library_books
                    ADD COLUMN IF NOT EXISTS campus_id UUID,
                    ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS publisher VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS publication_year INTEGER;

                CREATE TABLE IF NOT EXISTS public.book_reservations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    school_id UUID NOT NULL,
                    campus_id UUID,
                    book_id UUID NOT NULL,
                    student_id UUID NOT NULL,
                    reserved_at TIMESTAMPTZ DEFAULT now(),
                    status VARCHAR(50) DEFAULT 'active'
                );

                ALTER TABLE public.school_events
                    ADD COLUMN IF NOT EXISTS campus_id UUID,
                    ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT 'all',
                    ADD COLUMN IF NOT EXISTS rsvp_enabled BOOLEAN DEFAULT false,
                    ADD COLUMN IF NOT EXISTS rsvp_count INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS max_attendees INTEGER;
            """)
            logger.info("Library & School Events schema aligned successfully")
            
            # Create system_settings table if it doesn't exist and ensure schema alignment
            await _execute_script(conn, """
                CREATE TABLE IF NOT EXISTS public.system_settings (
                    key VARCHAR PRIMARY KEY,
                    value JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
                );
                ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
                ALTER TABLE public.system_settings DISABLE ROW LEVEL SECURITY;
            """)
            # Seed default AI status & platform branding
            await conn.execute(text("""
                INSERT INTO public.system_settings (key, value)
                VALUES 
                    ('global_ai_control', '{"enabled": true}'),
                    ('platform_layout_branding', '{"footer_text": "AltRix Core — The AI-Powered Institute Operating System", "footer_url": "https://altrixcore.com"}')
                ON CONFLICT (key) DO NOTHING;
            """))
            logger.info("System settings database table initialized successfully")

            # Initialize security tables
            try:
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.token_blacklist (
                        jti         VARCHAR PRIMARY KEY,
                        user_id     UUID NOT NULL,
                        blacklisted_at TIMESTAMPTZ DEFAULT now(),
                        expires_at  TIMESTAMPTZ NOT NULL
                    );
                """))
                await conn.execute(text("""
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
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON public.active_sessions (user_id);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_active_sessions_active ON public.active_sessions (user_id, is_active);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_active_sessions_school ON public.active_sessions (school_id);"))
                
                await conn.execute(text("""
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
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events (event_type);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events (user_id);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events (created_at DESC);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events (severity, created_at DESC);"))

                # Bulk token revocation: any token issued before the recorded
                # instant is rejected. Needed because per-token blacklisting
                # cannot revoke tokens the server has never seen.
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.user_token_invalidation (
                        user_id            UUID PRIMARY KEY,
                        invalidated_before TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        reason             VARCHAR(50)
                    );
                """))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
                        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email         VARCHAR(320),
                        ip_address    VARCHAR(100),
                        user_agent    TEXT,
                        failure_reason VARCHAR(200),
                        attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_failed_logins_email ON public.failed_login_attempts (email, attempted_at DESC);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_failed_logins_ip ON public.failed_login_attempts (ip_address, attempted_at DESC);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_failed_logins_time ON public.failed_login_attempts (attempted_at DESC);"))

                await conn.execute(text("""
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
                """))
                logger.info("Security tables initialized successfully")
            except Exception as se_err:
                logger.error(f"Failed to initialize security tables: {se_err}")

            # ── AI Semantic Cache Tables ──────────────────────────────────────
            try:
                # Enable pg_trgm (built-in Postgres extension, no cost, no new infra)
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.ai_semantic_cache (
                        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        school_id        UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
                        cache_type       VARCHAR(30)  NOT NULL DEFAULT 'live_erp',
                        query_text       TEXT         NOT NULL,
                        query_normalized TEXT         NOT NULL,
                        query_embedding  JSONB,
                        role_key         VARCHAR(200) NOT NULL,
                        module_context   VARCHAR(100),
                        screen_context   VARCHAR(200),
                        campus_id        UUID,
                        response_text    TEXT         NOT NULL,
                        data_deps        TEXT[]       DEFAULT '{}',
                        hit_count        INTEGER      DEFAULT 0,
                        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        expires_at       TIMESTAMPTZ  NOT NULL,
                        last_used_at     TIMESTAMPTZ  DEFAULT NOW(),
                        is_valid         BOOLEAN      DEFAULT TRUE
                    );
                """))
                # Indexes for fast lookup and invalidation
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_sem_cache_school "
                    "ON public.ai_semantic_cache (school_id, is_valid, expires_at);"
                ))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_sem_cache_type "
                    "ON public.ai_semantic_cache (school_id, cache_type, is_valid);"
                ))
                # GIN index for trigram similarity search on normalized query
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_sem_cache_trgm "
                    "ON public.ai_semantic_cache USING gin(query_normalized gin_trgm_ops);"
                ))
                # GIN index for array-based dependency invalidation
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_sem_cache_deps "
                    "ON public.ai_semantic_cache USING gin(data_deps);"
                ))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.ai_cache_stats (
                        id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
                        school_id      UUID    NOT NULL REFERENCES public.schools(id),
                        stat_date      DATE    NOT NULL DEFAULT CURRENT_DATE,
                        cache_hits     INTEGER DEFAULT 0,
                        cache_misses   INTEGER DEFAULT 0,
                        ai_calls_saved INTEGER DEFAULT 0,
                        top_queries    JSONB   DEFAULT '[]',
                        created_at     TIMESTAMPTZ DEFAULT NOW(),
                        updated_at     TIMESTAMPTZ DEFAULT NOW(),
                        UNIQUE (school_id, stat_date)
                    );
                """))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_cache_stats_school "
                    "ON public.ai_cache_stats (school_id, stat_date DESC);"
                ))

                # Cleanup function: purge expired and old invalid entries
                await conn.execute(text("""
                    CREATE OR REPLACE FUNCTION public.cleanup_ai_semantic_cache()
                    RETURNS void AS $$
                    BEGIN
                        DELETE FROM public.ai_semantic_cache
                        WHERE expires_at < NOW()
                           OR (is_valid = FALSE AND created_at < NOW() - INTERVAL '7 days');
                        DELETE FROM public.ai_cache_stats
                        WHERE stat_date < CURRENT_DATE - INTERVAL '90 days';
                    END;
                    $$ LANGUAGE plpgsql;
                """))
                logger.info("AI Semantic Cache tables initialized successfully")
            except Exception as ai_cache_err:
                logger.error(f"Failed to initialize AI semantic cache tables: {ai_cache_err}")
    except Exception as e:
        logger.critical(f"Database initialization: FAILED (continuing startup for health endpoint) — {e}")

    # 1.1 Extend notifications table with missing columns if needed
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                ALTER TABLE public.app_notifications
                    ADD COLUMN IF NOT EXISTS icon VARCHAR,
                    ADD COLUMN IF NOT EXISTS color VARCHAR,
                    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_archived_at ON public.app_notifications(user_id, archived_at);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_is_favorite ON public.app_notifications(user_id, is_favorite);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_is_pinned ON public.app_notifications(user_id, is_pinned);"))
            logger.info("Notifications tables verified & extended successfully")
    except Exception as notif_err:
        logger.error(f"Failed to extend notifications table at startup: {notif_err}")

    # ── Event Bus Tables Initialization ──────────────────────────────────────────
    try:
        async with engine.begin() as conn:
            # 1. event_store table
            await conn.execute(text("""
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
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_event_store_school_created ON public.event_store(school_id, created_at DESC);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_event_store_correlation ON public.event_store(correlation_id);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_event_store_name ON public.event_store(event_name);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_event_store_category ON public.event_store(category);"))

            # 2. event_subscribers_log table
            await conn.execute(text("""
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
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_event_subscribers_event ON public.event_subscribers_log(event_id);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_event_subscribers_status ON public.event_subscribers_log(status);"))

            # 3. activity_timeline table
            await conn.execute(text("""
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
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_timeline_school ON public.activity_timeline(school_id, created_at DESC);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_timeline_user ON public.activity_timeline(user_id);"))
            logger.info("Event Bus tables verified & created successfully")

            # 4. Email Branding & Template Management System Schema & Seeds
            try:
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.email_branding_config (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        brand_name VARCHAR(128) NOT NULL DEFAULT 'AltRix',
                        primary_logo_url VARCHAR(512) NOT NULL DEFAULT 'https://altrixcore.com/altrix-logo.png',
                        secondary_logo_url VARCHAR(512),
                        brand_icon_url VARCHAR(512) NOT NULL DEFAULT 'https://altrixcore.com/altrix-icon.png',
                        header_logo_type VARCHAR(32) NOT NULL DEFAULT 'primary',
                        primary_color VARCHAR(32) NOT NULL DEFAULT '#0f172a',
                        accent_color VARCHAR(32) NOT NULL DEFAULT '#2563eb',
                        secondary_color VARCHAR(32) NOT NULL DEFAULT '#64748b',
                        support_email VARCHAR(255) NOT NULL DEFAULT 'support@altrixcore.com',
                        contact_email VARCHAR(255) NOT NULL DEFAULT 'contact@altrixcore.com',
                        website_url VARCHAR(512) NOT NULL DEFAULT 'https://altrixcore.com',
                        footer_text TEXT NOT NULL DEFAULT 'Enterprise Identity & Cloud Core Platform',
                        legal_disclaimer TEXT DEFAULT 'This email was generated by AltRix Cloud OS on behalf of the registered institution. If you received this in error, please contact security immediately.',
                        social_links JSONB DEFAULT '{"twitter": "https://twitter.com/altrixcore", "linkedin": "https://linkedin.com/company/altrixcore"}'::jsonb,
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.email_assets (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(128) NOT NULL,
                        asset_type VARCHAR(64) NOT NULL,
                        url VARCHAR(512) NOT NULL,
                        filename VARCHAR(255) NOT NULL,
                        mime_type VARCHAR(64) DEFAULT 'image/png',
                        file_size_bytes INT DEFAULT 0,
                        dimensions VARCHAR(64),
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.email_sender_identities (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        key VARCHAR(64) UNIQUE NOT NULL,
                        name VARCHAR(128) NOT NULL,
                        email VARCHAR(255) NOT NULL,
                        reply_to VARCHAR(255),
                        is_default BOOLEAN NOT NULL DEFAULT FALSE,
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """))

                await _execute_script(conn, """
                    CREATE TABLE IF NOT EXISTS public.email_templates (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        key VARCHAR(64) UNIQUE NOT NULL,
                        name VARCHAR(128) NOT NULL,
                        category VARCHAR(64) NOT NULL,
                        subject VARCHAR(255) NOT NULL,
                        sender_identity_key VARCHAR(64),
                        html_content TEXT NOT NULL,
                        text_content TEXT,
                        cta_text VARCHAR(128),
                        cta_url_variable VARCHAR(128),
                        available_variables JSONB DEFAULT '[]'::jsonb,
                        version INT NOT NULL DEFAULT 1,
                        is_system BOOLEAN NOT NULL DEFAULT TRUE,
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );

                    ALTER TABLE public.email_templates
                        ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
                        ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT TRUE;
                """)

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.email_template_versions (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        template_key VARCHAR(64) NOT NULL,
                        version INT NOT NULL,
                        subject VARCHAR(255) NOT NULL,
                        html_content TEXT NOT NULL,
                        text_content TEXT,
                        created_by_user_id UUID,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.email_event_mappings (
                        event_name VARCHAR(64) PRIMARY KEY,
                        sender_identity_key VARCHAR(64) NOT NULL,
                        template_key VARCHAR(64) NOT NULL,
                        description VARCHAR(255),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.email_logs (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        recipient_email VARCHAR(255) NOT NULL,
                        sender_email VARCHAR(255) NOT NULL,
                        sender_name VARCHAR(128),
                        event_name VARCHAR(64) NOT NULL,
                        template_key VARCHAR(64),
                        subject VARCHAR(255) NOT NULL,
                        status VARCHAR(30) NOT NULL,
                        error_details TEXT,
                        message_id VARCHAR(255),
                        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        metadata JSONB DEFAULT '{}'::jsonb
                    );
                """))

                await conn.execute(text("""
                    INSERT INTO public.email_sender_identities (key, name, email, reply_to, is_default, is_active)
                    VALUES
                        ('security', 'AltRix Security HQ', 'security@altrixcore.com', 'security@altrixcore.com', FALSE, TRUE),
                        ('no_reply', 'AltRix Platform System', 'no-reply@altrixcore.com', NULL, TRUE, TRUE),
                        ('support', 'AltRix Customer Support', 'support@altrixcore.com', 'support@altrixcore.com', FALSE, TRUE),
                        ('info', 'AltRix Information Desk', 'info@altrixcore.com', 'info@altrixcore.com', FALSE, TRUE),
                        ('ceo', 'AltRix Executive Office', 'ceo@altrixcore.com', 'ceo@altrixcore.com', FALSE, TRUE),
                        ('notifications', 'AltRix Cloud Notifications', 'notifications@altrixcore.com', 'no-reply@altrixcore.com', FALSE, TRUE),
                        ('contact', 'AltRix Direct Contact', 'contact@altrixcore.com', 'contact@altrixcore.com', FALSE, TRUE),
                        ('billing', 'AltRix Billing & Finance', 'billing@altrixcore.com', 'billing@altrixcore.com', FALSE, TRUE),
                        ('system', 'AltRix System Engine', 'system@altrixcore.com', NULL, FALSE, TRUE)
                    ON CONFLICT (key) DO NOTHING;
                """))
                logger.info("Email Branding & Template schema initialized successfully")
            except Exception as email_init_err:
                logger.error(f"Failed to initialize email branding tables: {email_init_err}")
    except Exception as eb_err:
        logger.error(f"Failed to initialize Event Bus tables at startup: {eb_err}")

    # Seed Email Templates in background session
    try:
        from app.database import AsyncSessionLocal
        from app.services.email_template_seeds import seed_all_email_templates
        async with AsyncSessionLocal() as seed_session:
            await seed_all_email_templates(seed_session)
    except Exception as seed_err:
        logger.warning(f"Template seeder notice: {seed_err}")


def main() -> int:
    """Entry point for the deploy-time migration step."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("Applying schema bootstrap...")
    asyncio.run(apply_schema_bootstrap())
    logger.info("Schema bootstrap complete")
    # Versioned SQL migrations. A failure raises and stops the deploy.
    from app.sql_migrations import apply_sql_migrations

    asyncio.run(apply_sql_migrations())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
