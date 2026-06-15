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
)
from app.routers.realtime import router as realtime_router
from app.routers.collaboration import router as collaboration_router

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

    # 1. Verify Database Connection
    try:
        from sqlalchemy import text
        from app.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection ping: SUCCESS")
    except Exception as e:
        logger.critical(f"Database connection ping: FAILED — {e}")
        raise RuntimeError(f"Database connection failed: {e}") from e

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
        if redis_conn:
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

    # Log startup complete
    logger.info("AltRix API startup complete — ready to serve requests")

    yield

    # Shutdown
    logger.info("AltRix API shutting down...")
    try:
        from app.cache import close_redis
        await close_redis()
    except Exception:
        pass
    await engine.dispose()
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
    allow_origins=settings.cors_origins,
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
    from app.cache import CacheService
    result = await build_health_response(include_deps=True)
    result["uptime_seconds"] = round(get_uptime_seconds(), 1)
    result["cache_health"] = await CacheService.health_check()
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
app.include_router(realtime_router, prefix=_PREFIX)
app.include_router(collaboration_router, prefix=_PREFIX)
