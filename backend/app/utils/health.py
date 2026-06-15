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


async def check_supabase() -> dict:
    """Check Supabase Auth API reachability."""
    try:
        import httpx
        from app.config import settings
        async with httpx.AsyncClient(timeout=5.0) as client:
            start = time.monotonic()
            resp = await client.get(
                f"{settings.supabase_url}/auth/v1/health",
                headers={"apikey": settings.supabase_anon_key},
            )
            latency_ms = round((time.monotonic() - start) * 1000, 2)
            if resp.status_code < 500:
                return {"status": "healthy", "latency_ms": latency_ms}
            return {"status": "degraded", "http_status": resp.status_code}
    except Exception as e:
        return {"status": "unreachable", "error": str(e)[:200]}


def get_uptime_seconds() -> float:
    return time.time() - _startup_time


async def build_health_response(include_deps: bool = False) -> dict:
    """Build the full health response."""
    from app.config import settings
    
    response = {
        "status": "healthy",
        "version": settings.app_version,
        "environment": settings.app_env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(get_uptime_seconds(), 1),
    }

    if include_deps:
        db_status, redis_status, supabase_status = await asyncio.gather(
            check_database(),
            check_redis(),
            check_supabase(),
        )
        response["dependencies"] = {
            "database": db_status,
            "redis": redis_status,
            "supabase": supabase_status,
        }
        # Overall status is unhealthy if database is down
        if db_status.get("status") != "healthy":
            response["status"] = "unhealthy"
        elif redis_status.get("status") == "unhealthy":
            response["status"] = "degraded"

    return response
