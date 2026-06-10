"""
AltRix School ERP API main application module.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.middleware import LoggingMiddleware

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

# Configure logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for startup and shutdown."""
    logger.info("Initializing AltRix API backend...")
    yield
    logger.info("Cleaning up backend database connections...")
    await engine.dispose()
    logger.info("AltRix API backend shutdown complete.")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="FastAPI Backend for AltRix School ERP SaaS",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom logging/timing middleware
app.add_middleware(LoggingMiddleware)

from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request, exc):
    logger.error(f"Database error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database service is temporarily unavailable. Please try again later."},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=503,
        content={"detail": "Service is temporarily unavailable. Please try again later."},
    )

# Root endpoint
@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "env": settings.app_env,
        "status": "healthy",
        "docs": "/docs"
    }

# Register routers under /api prefix
app.include_router(auth_router, prefix="/api")
app.include_router(schools_router, prefix="/api")
app.include_router(campuses_router, prefix="/api")
app.include_router(academic_router, prefix="/api")
app.include_router(students_router, prefix="/api")
app.include_router(teachers_router, prefix="/api")
app.include_router(admissions_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")
app.include_router(exams_router, prefix="/api")
app.include_router(finance_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(messaging_router, prefix="/api")
app.include_router(notices_router, prefix="/api")
app.include_router(diary_router, prefix="/api")
app.include_router(complaints_router, prefix="/api")
app.include_router(assignments_router, prefix="/api")
app.include_router(behavior_router, prefix="/api")
app.include_router(hr_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(realtime_router, prefix="/api")
app.include_router(collaboration_router, prefix="/api")
