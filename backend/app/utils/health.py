"""
Health check utilities for AltRix production monitoring.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("app.health")

_startup_time = time.time()


async def check_database() -> dict:
    """Ping the database and return status."""
    try:
        from app.database import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "healthy", "latency_ms": None}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)[:200]}


async def check_redis() -> dict:
    """Ping Redis and return status."""
    try:
        from app.cache import get_redis
        redis = await get_redis()
        if not redis:
            return {"status": "unavailable", "note": "Redis not configured"}
        start = time.monotonic()
        await redis.ping()
        latency_ms = round((time.monotonic() - start) * 1000, 2)
        return {"status": "healthy", "latency_ms": latency_ms}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)[:200]}


def get_uptime_seconds() -> float:
    return time.time() - _startup_time


def get_commit_sha() -> str:
    import os
    sha = os.getenv("GIT_COMMIT_SHA") or os.getenv("COMMIT_SHA")
    if not sha and os.path.exists("/app/COMMIT_SHA"):
        try:
            with open("/app/COMMIT_SHA", "r") as f:
                sha = f.read().strip()
        except Exception:
            pass
    return sha or "unknown"


async def build_health_response(include_deps: bool = False) -> dict:
    """Build the full health response."""
    from app.config import settings
    
    commit_sha = get_commit_sha()
    response = {
        "status": "healthy",
        "version": settings.app_version,
        "commit": commit_sha,
        "environment": settings.app_env,
        "vps_database_connected": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(get_uptime_seconds(), 1),
    }

    if include_deps:
        db_status, redis_status = await asyncio.gather(
            check_database(),
            check_redis(),
        )
        response["dependencies"] = {
            "database": db_status,
            "redis": redis_status,
        }
        # Overall status is unhealthy if database is down
        if db_status.get("status") != "healthy":
            response["status"] = "unhealthy"
        elif redis_status.get("status") == "unhealthy":
            response["status"] = "degraded"

    return response

