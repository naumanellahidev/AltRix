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
from app.middleware import LoggingMiddleware, DbIdentityMiddleware
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
    platform_router,
)
from app.routers.realtime import router as realtime_router
from app.routers.collaboration import router as collaboration_router
from app.routers.transport import router as transport_router
from app.routers.events import router as school_events_router
from app.routers.report_cards import router as report_cards_router
from app.routers.promotions import router as promotions_router
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
from app.routers.backups import router as backups_router

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

    # 1. Verify the database is reachable.
    #
    # Schema DDL used to run here on every boot of every container. It now
    # lives in app/db_bootstrap.py and runs as an explicit deploy step, so the
    # API, worker and beat containers no longer race each other for locks on
    # the same tables — and so the app can eventually stop needing DDL rights
    # on its database connection. See that module for the full reasoning.
    try:
        async with engine.begin() as conn:
            await conn.execute(text('SELECT 1'))
        logger.info('Database connection ping: SUCCESS')
    except Exception as e:
        logger.critical(f'Database connection: FAILED (continuing for health endpoint) — {e}')

    try:
        from app.db_bootstrap import apply_schema_bootstrap, should_run_on_startup
        if should_run_on_startup():
            logger.info('Applying schema bootstrap on startup (non-production)')
            await apply_schema_bootstrap()
        else:
            logger.info('Skipping startup DDL; apply it with: python -m app.db_bootstrap')
    except Exception as e:
        logger.error(f'Schema bootstrap failed: {e}')

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
        # Writes made through any endpoint, announced by the database itself.
        asyncio.create_task(ws_manager.start_table_change_listener())
    except Exception as ws_err:
        logger.error(f"Failed to start Redis Pub/Sub WebSocket listener: {ws_err}")

    yield

    # Shutdown
    logger.info("AltRix API shutting down...")
    try:
        from app.cache import close_redis
        await close_redis()
    except Exception as exc:
        logger.warning("Optional step failed (%s): %s", "from app.cache import close_redis", exc, exc_info=True)
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

# ─── Middleware ───────────────────────────────────────────────────────────────
#
# Note on order: add_middleware() PREPENDS, so the last one added ends up
# outermost. The effective stack here is, outermost first:
#     DbIdentity -> Logging -> CorrelationId -> SecurityHeaders -> CORS -> routes
# CORS therefore sits innermost despite being added first. That works — preflight
# requests still reach it — but an exception raised in an outer middleware
# produces a response without CORS headers, which the browser reports as an
# opaque CORS failure instead of the real error. Moving CORS to be added last
# would fix that; left as-is for now to avoid changing request handling here.

# 1. CORS
#
# allow_credentials=True means every origin accepted here can read authenticated
# responses. A wildcard over a public hosting domain (*.vercel.app, *.railway.app)
# therefore hands that ability to anyone who can deploy there, so origins are
# enumerated explicitly instead.
#
# The production frontend reaches the API through a same-origin /api rewrite, so
# it does not rely on CORS at all; this list exists for the hosted preview
# deployments and for local development.
_PRODUCTION_ORIGINS = [
    "https://altrixcore.com",
    "https://www.altrixcore.com",
]

_DEV_ORIGINS = [
    "http://localhost:5173", "http://localhost:8080", "http://localhost:3000",
    "http://127.0.0.1:5173", "http://127.0.0.1:8080", "http://127.0.0.1:3000",
]

_cors_origins = list(dict.fromkeys(
    [o for o in settings.cors_origins if o and "${{" not in o]
    + _PRODUCTION_ORIGINS
    + ([] if settings.is_production else _DEV_ORIGINS)
))

# White-label tenants get their own domains. Set CORS_ORIGIN_REGEX to an
# anchored pattern covering those domains only — never a public PaaS suffix.
_cors_origin_regex = (settings.cors_origin_regex or "").strip() or None

logger.info(
    f"CORS: {len(_cors_origins)} explicit origin(s)"
    + (f" + regex {_cors_origin_regex!r}" if _cors_origin_regex else "")
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization", "Content-Type", "X-School-Id", "X-Campus-Id",
        "X-Correlation-ID", "X-Requested-With", "Accept",
    ],
    expose_headers=["X-Process-Time-Ms", "X-Correlation-ID", "Retry-After"],
    max_age=600,
)

# 2. Security headers
app.add_middleware(SecurityHeadersMiddleware)

# 3. Correlation ID (must be before LoggingMiddleware)
app.add_middleware(CorrelationIdMiddleware)

# 4. Request logging + timing
app.add_middleware(LoggingMiddleware)

# 5. Database identity (innermost): makes the caller's user id visible to
#    Postgres so row-level security policies, which all route through
#    auth.uid(), have something to evaluate. Must wrap the route handlers, so it
#    is added last.
app.add_middleware(DbIdentityMiddleware)

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


@app.get("/health", tags=["Health"], summary="VPS health check", include_in_schema=False)
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


# NOTE: a second pair of /health and /api/version handlers used to live here.
# They were unreachable — FastAPI matches the first route registered for a path,
# and both are already defined above — and the version one referenced `os`
# without importing it, so it would have raised NameError had it ever run.
# The reachable definitions are the ones further up this file.


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
app.include_router(promotions_router, prefix=_PREFIX)
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
app.include_router(backups_router, prefix=_PREFIX)
from app.routers.invitations import router as invitations_router
from app.routers.email_management import router as email_management_router
from app.routers.search import router as search_router

app.include_router(search_router, prefix=_PREFIX)
app.include_router(invitations_router, prefix=_PREFIX)
app.include_router(invitations_router)
app.include_router(email_management_router, prefix=_PREFIX)
app.include_router(email_management_router)
app.include_router(platform_router, prefix=_PREFIX)
app.include_router(platform_router)

# ── Google Search Console Verification & SEO Static Fallback Routes ───────────
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

@app.get("/googlee1ba351e20a405c4.html", response_class=HTMLResponse)
@app.get("/api/googlee1ba351e20a405c4.html", response_class=HTMLResponse)
async def google_verification_direct():
    return HTMLResponse(
        content="google-site-verification: googlee1ba351e20a405c4.html",
        status_code=200,
        headers={"Content-Type": "text/html; charset=utf-8"}
    )

@app.get("/robots.txt", response_class=PlainTextResponse)
@app.get("/api/robots.txt", response_class=PlainTextResponse)
async def robots_txt_direct():
    content = """User-agent: *
Allow: /
Disallow: /admin/
Disallow: /super_admin/
Disallow: /api/

User-agent: Googlebot
Allow: /
Allow: /auth
Allow: /admissions

User-agent: Bingbot
Allow: /

Sitemap: https://altrixcore.com/sitemap.xml
"""
    return PlainTextResponse(content=content, status_code=200)

@app.get("/sitemap.xml")
@app.get("/api/sitemap.xml")
async def sitemap_xml_direct():
    try:
        with open("/opt/altrix/current/dist/sitemap.xml", "r", encoding="utf-8") as f:
            xml_data = f.read()
            return Response(content=xml_data, media_type="application/xml")
    except Exception:
        fallback_xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://altrixcore.com/</loc>
    <lastmod>2026-08-26</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://altrixcore.com/auth</loc>
    <lastmod>2026-08-26</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://altrixcore.com/admissions</loc>
    <lastmod>2026-08-26</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>"""
        return Response(content=fallback_xml, media_type="application/xml")


