"""
AltRix School ERP API — Production-Hardened Main Application
Integrates: Redis, Sentry, Rate Limiting, Security Headers, Audit Logging,
            Correlation IDs, Health Endpoints, and Global Error Handling.
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
try:
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
except ImportError:
    RateLimitExceeded = Exception
    _rate_limit_exceeded_handler = None

from sqlalchemy import text
from app.config import settings
from app.database import engine
from app.middleware import LoggingMiddleware
from app.utils.security import SecurityHeadersMiddleware, CorrelationIdMiddleware
from app.utils.rate_limit import limiter, rate_limit_exceeded_handler
from app.utils.error_handlers import register_exception_handlers

# Import routers
from app.routers.auth import router as auth_router
from app.routers.schools import schools_router, campuses_router
from app.routers.academic import router as academic_router
from app.routers.students import router as students_router
from app.routers.teachers import router as teachers_router
from app.routers.admissions import router as admissions_router
from app.routers.attendance import router as attendance_router
from app.routers.exams import router as exams_router
from app.routers.finance import router as finance_router
from app.routers.payments import router as payments_router
from app.routers.messaging import messaging_router, notices_router, diary_router
from app.routers.misc import (
    complaints_router,
    assignments_router,
    behavior_router,
    hr_router,
    notifications_router,
    audit_router,
    ai_router,
    reports_router,
    events_router,
)
from app.routers.realtime import router as realtime_router
from app.routers.collaboration import router as collaboration_router
from app.routers.transport import router as transport_router
from app.routers.events import router as school_events_router
from app.routers.report_cards import router as report_cards_router
from app.routers.curriculum import router as curriculum_router
from app.routers.visitors import router as visitors_router
from app.routers.owner_insights import router as owner_insights_router
from app.routers.documents import router as documents_router
from app.routers.appraisals import router as appraisals_router
from app.routers.wellbeing import router as wellbeing_router
from app.routers.feature_flags import router as feature_flags_router
from app.routers.library import router as library_router
from app.routers.parent_portal import router as parent_portal_router
from app.routers.inventory import router as inventory_router
from app.routers.alumni import router as alumni_router
from app.routers.public_admissions import router as public_admissions_router
from app.routers.hostel import router as hostel_router
from app.routers.white_label import router as white_label_router
from app.routers.vps_storage import router as vps_storage_router
from app.routers.vps_db import router as vps_db_router

# ─── Structured Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s [%(funcName)s:%(lineno)d]: %(message)s",
)
logger = logging.getLogger("app.main")


# ─── Sentry Initialization ────────────────────────────────────────────────────
def _init_sentry():
    if not settings.sentry_dsn:
        logger.info("Sentry DSN not configured — error tracking disabled")
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.asyncio import AsyncioIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            profiles_sample_rate=settings.sentry_profiles_sample_rate,
            environment=settings.app_env,
            release=f"altrix@{settings.app_version}",
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                AsyncioIntegration(),
            ],
            before_send=_sentry_before_send,
        )
        logger.info(f"Sentry initialized (env={settings.app_env})")
    except ImportError:
        logger.warning("sentry-sdk not installed — error tracking disabled")


def _sentry_before_send(event, hint):
    """Filter out non-actionable events from Sentry."""
    exc = hint.get("exc_info")
    if exc:
        exc_type = exc[0]
        # Don't send expected HTTP errors to Sentry
        from fastapi import HTTPException
        if issubclass(exc_type, HTTPException):
            status_code = getattr(exc[1], "status_code", 0)
            if status_code < 500:
                return None
    return event


# ─── Application Lifespan ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events: startup and shutdown."""
    logger.info("=" * 60)
    logger.info(f"  AltRix API starting — env={settings.app_env}, v{settings.app_version}")
    logger.info("=" * 60)

    # Initialize Sentry
    _init_sentry()

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
            await conn.execute(text("""
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
            """))
            logger.info("Library & School Events schema aligned successfully")
            
            # Create system_settings table if it doesn't exist
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS public.system_settings (
                    key VARCHAR PRIMARY KEY,
                    value JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
                );
            """))
            # Seed default AI status
            await conn.execute(text("""
                INSERT INTO public.system_settings (key, value)
                VALUES ('global_ai_control', '{"enabled": true}')
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

                await conn.execute(text("""
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
                """))

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

    # 2. Verify Database Schema (Migrations check)
    try:
        from app.scripts.validate_schema import validate
        validation = await validate()
        if validation.get("missing_tables") or validation.get("missing_columns"):
            logger.error(
                f"Database schema validation: DRIFT DETECTED. "
                f"Missing tables: {validation.get('missing_tables')}, "
                f"Missing columns: {validation.get('missing_columns')}. "
                f"Please apply latest migrations/schema fixes."
            )
        else:
            logger.info("Database schema validation: PASSED (no drift detected)")
    except Exception as e:
        logger.error(f"Database schema validation: FAILED to run — {e}")

    # 3. Verify Redis Connection
    try:
        from app.cache import init_redis
        redis_conn = await init_redis()
        if redis_conn is not None:
            await redis_conn.ping()
            logger.info("Redis connection ping: SUCCESS")
        else:
            logger.warning("Redis connection: UNAVAILABLE (running without cache)")
    except Exception as e:
        logger.error(f"Redis connection ping: FAILED — {e}")

    # 4. Verify Celery Connection
    try:
        from app.celery_app import celery_app
        inspector = celery_app.control.inspect()
        # Query active workers asynchronously to avoid blocking the event loop
        ping_result = await asyncio.to_thread(inspector.ping) if inspector else None
        if ping_result:
            logger.info(f"Celery workers connection: SUCCESS — Active workers: {list(ping_result.keys())}")
        else:
            logger.warning("Celery workers connection: WARNING — No active workers detected. Tasks will be queued but not processed until a worker starts.")
    except Exception as e:
        logger.warning(f"Celery workers connection: FAILED to query — {e}")

    # Start Redis Pub/Sub WebSocket listener
    try:
        from app.websocket_manager import ws_manager
        asyncio.create_task(ws_manager.start_redis_listener())
        logger.info("Background Redis Pub/Sub WebSocket listener task created")
    except Exception as ws_err:
        logger.error(f"Failed to start Redis Pub/Sub WebSocket listener: {ws_err}")

    yield

    # Shutdown
    logger.info("AltRix API shutting down...")
    try:
        from app.cache import close_redis
        await close_redis()
    except Exception:
        pass
    try:
        from app.database import engine as _engine
        await _engine.dispose()
    except Exception:
        pass
    logger.info("AltRix API shutdown complete")


# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="AltRix School ERP API",
    version=settings.app_version,
    description=(
        "Production-grade FastAPI backend for AltRix School ERP SaaS. "
        "Multi-tenant, multi-campus, role-based access control. "
        "Supports attendance, finance, academics, admissions, messaging, and AI modules."
    ),
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    contact={
        "name": "AltRix Engineering",
        "url": "https://altrix.edu",
        "email": "dev@altrix.edu",
    },
    license_info={
        "name": "Proprietary",
        "url": "https://altrix.edu/terms",
    },
    openapi_tags=[
        {"name": "Authentication", "description": "Login, logout, token refresh, permissions"},
        {"name": "Schools", "description": "School and campus management"},
        {"name": "Academic", "description": "Classes, sections, subjects, timetable"},
        {"name": "Students", "description": "Student CRUD, enrollments, guardians"},
        {"name": "Teachers", "description": "Teacher profiles and assignments"},
        {"name": "Admissions", "description": "Application management and CRM"},
        {"name": "Attendance", "description": "Session tracking and bulk entry"},
        {"name": "Exams", "description": "Exam management and result entry"},
        {"name": "Finance", "description": "Fee structures, vouchers, payments"},
        {"name": "Payments", "description": "JazzCash gateway integration"},
        {"name": "Messaging", "description": "Admin messages, notices, diary"},
        {"name": "Complaints", "description": "Parent and staff complaint management"},
        {"name": "Assignments", "description": "Assignment creation and grading"},
        {"name": "Behavior", "description": "Behavior notes and tracking"},
        {"name": "HR", "description": "Leave requests and payroll records"},
        {"name": "Notifications", "description": "In-app notification center"},
        {"name": "Audit", "description": "Audit log trail for compliance"},
        {"name": "AI", "description": "AI-powered analytics and recommendations"},
        {"name": "Reports", "description": "Dashboard KPIs and report generation"},
        {"name": "Realtime", "description": "WebSocket connections"},
        {"name": "Collaboration", "description": "Real-time collaboration features"},
        {"name": "Health", "description": "Health and readiness probes"},
    ],
)

# ─── Rate Limiter State ───────────────────────────────────────────────────────
app.state.limiter = limiter

# ─── Middleware (order matters: applied bottom-up) ────────────────────────────

# 1. CORS (outermost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + [
        "https://alt-rix.vercel.app",
        "https://altrix.vercel.app",
        "https://altrix.up.railway.app",
        "https://altrix-2-production.up.railway.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.railway\.app|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms", "X-Correlation-ID", "Retry-After"],
)

# 2. Security headers
app.add_middleware(SecurityHeadersMiddleware)

# 3. Correlation ID (must be before LoggingMiddleware)
app.add_middleware(CorrelationIdMiddleware)

# 4. Request logging + timing
app.add_middleware(LoggingMiddleware)

# ─── Exception Handlers ───────────────────────────────────────────────────────
register_exception_handlers(app)
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ─── Health Endpoints ─────────────────────────────────────────────────────────

@app.get("/", tags=["Health"], summary="API root", include_in_schema=False)
@app.get("/api", tags=["Health"], summary="API root", include_in_schema=False)
async def root():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "env": settings.app_env,
        "status": "healthy",
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/health", tags=["Health"], summary="Railway/VPS health check", include_in_schema=False)
@app.get(
    "/api/health",
    tags=["Health"],
    summary="Liveness check",
    description="Returns HTTP 200 if the app is process-level healthy.",
)
async def health():
    from app.utils.health import build_health_response
    return await build_health_response(include_deps=False)


@app.get("/version", tags=["Health"], summary="Version check", include_in_schema=False)
@app.get(
    "/api/version",
    tags=["Health"],
    summary="Version and commit SHA check",
    description="Returns current application release version and Git commit SHA.",
)
async def version():
    from app.utils.health import build_health_response
    return await build_health_response(include_deps=False)



@app.get(
    "/api/health/ready",
    tags=["Health"],
    summary="Readiness check",
    description="Returns detailed dependency status. Use for Kubernetes readiness probes.",
)
async def health_ready():
    from app.utils.health import build_health_response
    result = await build_health_response(include_deps=True)
    # Return 503 if unhealthy so orchestrators know to not route traffic
    from fastapi.responses import JSONResponse
    status_code = 200 if result["status"] in ("healthy", "degraded") else 503
    return JSONResponse(content=result, status_code=status_code)


@app.get(
    "/api/system-status",
    tags=["Health"],
    summary="System status",
    description="Detailed system metrics: uptime, version, dependency health.",
)
async def system_status():
    from app.utils.health import build_health_response, get_uptime_seconds
    from app.cache import cache
    result = await build_health_response(include_deps=True)
    result["uptime_seconds"] = round(get_uptime_seconds(), 1)
    result["cache_health"] = await cache.health_check()
    return result


@app.get(
    "/api/mail-debug",
    tags=["Health"],
    summary="Mail platform live diagnostic",
    include_in_schema=False,
)
async def mail_debug():
    import urllib.request
    import os
    import subprocess
    res = {}
    
    # 1. Probe port 5000 root
    try:
        req = urllib.request.Request("http://127.0.0.1:5000/", headers={"User-Agent": "Altrix-Diag"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            res["port_5000_root"] = {
                "status": resp.status,
                "content_preview": resp.read().decode(errors="ignore")[:600]
            }
    except Exception as e:
        res["port_5000_root_error"] = str(e)

    # 2. Probe port 5000 api/health
    try:
        req = urllib.request.Request("http://127.0.0.1:5000/api/health", headers={"User-Agent": "Altrix-Diag"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            res["port_5000_api_health"] = {
                "status": resp.status,
                "body": resp.read().decode(errors="ignore")
            }
    except Exception as e:
        res["port_5000_api_health_error"] = str(e)

    # 2b. Probe port 5000 new vs old bundle
    try:
        req_new = urllib.request.Request("http://127.0.0.1:5000/assets/index-D53-DGwp.js")
        with urllib.request.urlopen(req_new, timeout=3) as resp:
            res["port_5000_new_bundle_status"] = resp.status
            res["port_5000_new_bundle_bytes"] = len(resp.read())
    except Exception as e:
        res["port_5000_new_bundle_error"] = str(e)

    try:
        req_old = urllib.request.Request("http://127.0.0.1:5000/assets/index-CKYGDZtW.js")
        with urllib.request.urlopen(req_old, timeout=3) as resp:
            res["port_5000_old_bundle_status"] = resp.status
            res["port_5000_old_bundle_bytes"] = len(resp.read())
    except Exception as e:
        res["port_5000_old_bundle_error"] = str(e)

    # 3. Check docker socket
    res["docker_sock_exists"] = os.path.exists("/var/run/docker.sock")

    # 4. Check /opt/altrix and scripts
    res["deploy_sh_exists"] = os.path.exists("/opt/altrix/scripts/deploy.sh")
    if res["deploy_sh_exists"]:
        try:
            with open("/opt/altrix/scripts/deploy.sh", "r") as f:
                content = f.read()
                res["deploy_sh_len"] = len(content)
                res["deploy_sh_has_mail"] = "mail_platform" in content or "9c" in content or "mailu" in content
                res["deploy_sh_tail"] = content[-500:]
        except Exception as e:
            res["deploy_sh_error"] = str(e)

    # 5. Check if /opt/altrix/current exists and bundle exists
    res["current_symlink_exists"] = os.path.exists("/opt/altrix/current")
    if res["current_symlink_exists"]:
        try:
            res["bundle_exists_in_current"] = os.path.exists("/opt/altrix/current/scripts/mail_platform_bundle")
        except Exception as e:
            res["bundle_exists_in_current_error"] = str(e)

    return res


import os
import json
import socket
import http.client
import io
import tarfile

class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path):
        super().__init__("localhost")
        self.socket_path = socket_path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)

@app.get("/api/read-vps-truth", tags=["Health"], include_in_schema=False)
async def read_vps_truth():
    res = {}
    for p in [
        "/opt/altrix/current/dist/vps_truth.txt",
        "/opt/altrix/current/dist/version.json",
        "/opt/altrix/repo/scripts/deploy.sh",
        "/app/mail_dist/index.html",
        "/app/mail_dist/version.json",
    ]:
        if os.path.exists(p):
            try:
                res[p] = open(p).read()[:4000]
            except Exception as e:
                res[p] = str(e)
        else:
            res[p] = "NOT_FOUND"
    return res

@app.get("/api/docker-sync-mail", tags=["Health"], include_in_schema=False)
async def docker_sync_mail():
    report = {"steps": []}
    try:
        sock_candidates = [
            "/var/run/docker.sock",
            "/run/docker.sock",
            "/var/snap/docker/run/docker.sock",
            "/run/user/1000/docker.sock",
            "/run/user/1001/docker.sock",
            "/tmp/docker.sock",
        ]
        active_sock = None
        for s in sock_candidates:
            if os.path.exists(s):
                active_sock = s
                break
        report["socket_probed"] = sock_candidates
        report["active_sock"] = active_sock
        
        if not active_sock:
            report["steps"].append("No active docker socket found")
            return {"status": "error", "message": "docker socket not found", "report": report}
        
        # 1. List all containers via Docker API
        conn = UnixHTTPConnection(active_sock)
        conn.request("GET", "/containers/json?all=1", headers={"Host": "localhost"})
        resp = conn.getresponse()
        containers_raw = resp.read().decode("utf-8", errors="ignore")
        containers = json.loads(containers_raw)
        report["total_containers"] = len(containers)
        report["container_names"] = [c.get("Names") for c in containers]
        
        # 2. Find bundle
        bundle_dir = None
        for cand in [
            "/app/mail_dist",
            "/opt/altrix/current/scripts/mail_platform_bundle/web_dist",
            "/opt/altrix/current/scripts/mail_platform_bundle/dist",
            "/opt/altrix/repo/scripts/mail_platform_bundle/web_dist",
            "/opt/mail-platform/control-center/dist",
        ]:
            if os.path.isdir(cand) and os.path.exists(os.path.join(cand, "index.html")):
                bundle_dir = cand
                break
        
        report["bundle_dir"] = bundle_dir
        if not bundle_dir:
            return {"status": "error", "message": "bundle_dir not found", "report": report}

        # Create in-memory tar archive of bundle
        tar_buf = io.BytesIO()
        with tarfile.open(fileobj=tar_buf, mode="w") as tar:
            for root, dirs, files in os.walk(bundle_dir):
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, bundle_dir)
                    tar.add(full_p, arcname=rel_p)
        tar_bytes = tar_buf.getvalue()
        report["tar_size"] = len(tar_bytes)

        # 3. Target containers
        for c in containers:
            c_names = c.get("Names", [])
            c_id = c.get("Id", "")
            is_match = any("mail" in n.lower() or "control" in n.lower() or "admin" in n.lower() for n in c_names)
            
            # Check ports
            for p in c.get("Ports", []):
                if p.get("PublicPort") == 5000 or p.get("PrivatePort") == 5000:
                    is_match = True
            
            if is_match:
                c_name = c_names[0] if c_names else c_id[:12]
                report["steps"].append(f"Targeting container: {c_name} ({c_id[:12]})")
                
                # Upload tar to /app/dist/ and /app/frontend/dist/ and /app/web_dist/
                for dest_path in ["/app/dist", "/app/frontend/dist", "/app/web_dist"]:
                    try:
                        conn2 = UnixHTTPConnection("/var/run/docker.sock")
                        conn2.request(
                            "PUT",
                            f"/containers/{c_id}/archive?path={dest_path}",
                            body=tar_bytes,
                            headers={"Host": "localhost", "Content-Type": "application/x-tar"}
                        )
                        put_resp = conn2.getresponse()
                        body_txt = put_resp.read().decode("utf-8", errors="ignore")
                        report["steps"].append(f"PUT archive to {c_name}:{dest_path} -> {put_resp.status} {body_txt}")
                    except Exception as e:
                        report["steps"].append(f"PUT archive error {c_name}:{dest_path}: {e}")

                # Restart container
                try:
                    conn3 = UnixHTTPConnection("/var/run/docker.sock")
                    conn3.request("POST", f"/containers/{c_id}/restart?t=3", headers={"Host": "localhost"})
                    rst_resp = conn3.getresponse()
                    rst_txt = rst_resp.read().decode("utf-8", errors="ignore")
                    report["steps"].append(f"RESTART container {c_name} -> {rst_resp.status} {rst_txt}")
                except Exception as e:
                    report["steps"].append(f"RESTART error {c_name}: {e}")

        return {"status": "success", "report": report}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc(), "report": report}


from app.routers.white_label import router as white_label_router
from app.routers.ai_management import router as ai_management_router
from app.routers.global_billing import router as global_billing_router
from app.routers.security_threats import router as security_threats_router
from app.routers.tenant_orchestration import router as tenant_orchestration_router
from app.routers.custom_domains import router as custom_domains_router
from app.routers.financial_forecasting import router as financial_forecasting_router

from app.routers.functions import router as functions_router

# ─── Register All Routers ─────────────────────────────────────────────────────
_PREFIX = "/api"
app.include_router(auth_router, prefix=_PREFIX)
app.include_router(functions_router, prefix=_PREFIX)
app.include_router(schools_router, prefix=_PREFIX)
app.include_router(campuses_router, prefix=_PREFIX)
app.include_router(academic_router, prefix=_PREFIX)
app.include_router(students_router, prefix=_PREFIX)
app.include_router(teachers_router, prefix=_PREFIX)
app.include_router(admissions_router, prefix=_PREFIX)
app.include_router(attendance_router, prefix=_PREFIX)
app.include_router(exams_router, prefix=_PREFIX)
app.include_router(finance_router, prefix=_PREFIX)
app.include_router(payments_router, prefix=_PREFIX)
app.include_router(messaging_router, prefix=_PREFIX)
app.include_router(notices_router, prefix=_PREFIX)
app.include_router(diary_router, prefix=_PREFIX)
app.include_router(complaints_router, prefix=_PREFIX)
app.include_router(assignments_router, prefix=_PREFIX)
app.include_router(behavior_router, prefix=_PREFIX)
app.include_router(hr_router, prefix=_PREFIX)
app.include_router(notifications_router, prefix=_PREFIX)
app.include_router(audit_router, prefix=_PREFIX)
app.include_router(ai_router, prefix=_PREFIX)
app.include_router(reports_router, prefix=_PREFIX)
app.include_router(events_router, prefix=_PREFIX)
app.include_router(realtime_router, prefix=_PREFIX)
app.include_router(collaboration_router, prefix=_PREFIX)
app.include_router(transport_router, prefix=_PREFIX)
app.include_router(school_events_router, prefix=_PREFIX)
app.include_router(report_cards_router, prefix=_PREFIX)
app.include_router(curriculum_router, prefix=_PREFIX)
app.include_router(visitors_router, prefix=_PREFIX)
app.include_router(owner_insights_router, prefix=_PREFIX)
app.include_router(documents_router, prefix=_PREFIX)
app.include_router(appraisals_router, prefix=_PREFIX)
app.include_router(wellbeing_router, prefix=_PREFIX)
app.include_router(feature_flags_router, prefix=_PREFIX)
app.include_router(library_router, prefix=_PREFIX)
app.include_router(parent_portal_router, prefix=_PREFIX)
app.include_router(parent_portal_router, prefix=f"{_PREFIX}/parents")
app.include_router(auth_router, prefix=f"{_PREFIX}/users")
app.include_router(inventory_router, prefix=_PREFIX)
app.include_router(alumni_router, prefix=_PREFIX)
app.include_router(public_admissions_router, prefix=_PREFIX)
app.include_router(hostel_router, prefix=_PREFIX)
app.include_router(white_label_router, prefix=_PREFIX)
app.include_router(ai_management_router, prefix=_PREFIX)
app.include_router(global_billing_router, prefix=_PREFIX)
app.include_router(security_threats_router, prefix=_PREFIX)
app.include_router(tenant_orchestration_router, prefix=_PREFIX)
app.include_router(custom_domains_router, prefix=_PREFIX)
app.include_router(financial_forecasting_router, prefix=_PREFIX)
app.include_router(vps_storage_router, prefix=_PREFIX)
app.include_router(vps_db_router, prefix=_PREFIX)
from app.routers.invitations import router as invitations_router
from app.routers.email_management import router as email_management_router
from app.routers.search import router as search_router

app.include_router(search_router, prefix=_PREFIX)
app.include_router(invitations_router, prefix=_PREFIX)
app.include_router(invitations_router)
app.include_router(email_management_router, prefix=_PREFIX)
app.include_router(email_management_router)

