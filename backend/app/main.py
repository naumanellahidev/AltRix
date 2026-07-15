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
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

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
        from sqlalchemy import text
        from app.database import engine
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            logger.info("Database connection ping: SUCCESS")
            
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
        from sqlalchemy import text
        from app.database import engine
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
    except Exception as eb_err:
        logger.error(f"Failed to initialize Event Bus tables at startup: {eb_err}")

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
async def railway_health():
    from app.utils.health import build_health_response
    return await build_health_response(include_deps=False)


@app.get(
    "/api/health",
    tags=["Health"],
    summary="Basic health check",
    description="Returns API liveness status. Use for load balancer health probes.",
)
async def health():
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


# ─── Register All Routers ─────────────────────────────────────────────────────
_PREFIX = "/api"
app.include_router(auth_router, prefix=_PREFIX)
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
