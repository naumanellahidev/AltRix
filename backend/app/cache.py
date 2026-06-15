"""
AltRix Redis Cache Service
Provides a unified async caching layer backed by Redis.
"""
import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger("app.cache")

# Singleton Redis pool
_redis_pool: Optional[aioredis.Redis] = None


# ─── TTL Constants (seconds) ──────────────────────────────────────────────────
TTL_PERMISSIONS = 300        # 5 minutes
TTL_USER_ROLES = 600         # 10 minutes
TTL_DASHBOARD_KPIS = 60      # 1 minute
TTL_NOTIFICATIONS = 120      # 2 minutes
TTL_PARENT_CHILDREN = 3600   # 1 hour
TTL_CAMPUS_SWITCH = 600      # 10 minutes
TTL_SCHOOL_INFO = 1800       # 30 minutes


async def init_redis() -> aioredis.Redis:
    """Initialize and return the Redis connection pool."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=settings.redis_pool_size,
        )
        # Verify connection
        try:
            await _redis_pool.ping()
            logger.info(f"Redis connected: {settings.redis_url}")
        except Exception as e:
            logger.warning(f"Redis unavailable: {e} — cache disabled, running without cache")
            _redis_pool = None
    return _redis_pool


async def close_redis():
    """Close the Redis connection pool."""
    global _redis_pool
    if _redis_pool:
        await _redis_pool.aclose()
        _redis_pool = None
        logger.info("Redis connection closed")


async def get_redis() -> Optional[aioredis.Redis]:
    """Return the active Redis pool, or None if unavailable."""
    global _redis_pool
    if _redis_pool is None:
        return await init_redis()
    return _redis_pool


class CacheService:
    """
    High-level async cache service with JSON serialization.
    All operations degrade gracefully when Redis is unavailable.
    """

    @staticmethod
    async def get(key: str) -> Optional[Any]:
        """Retrieve a cached value. Returns None on miss or error."""
        redis = await get_redis()
        if not redis:
            return None
        try:
            raw = await redis.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as e:
            logger.warning(f"Cache GET error for '{key}': {e}")
            return None

    @staticmethod
    async def set(key: str, value: Any, ttl: int = 300) -> bool:
        """Store a value in cache with TTL (seconds). Returns True on success."""
        redis = await get_redis()
        if not redis:
            return False
        try:
            serialized = json.dumps(value, default=str)
            await redis.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.warning(f"Cache SET error for '{key}': {e}")
            return False

    @staticmethod
    async def delete(key: str) -> bool:
        """Delete a cache key."""
        redis = await get_redis()
        if not redis:
            return False
        try:
            await redis.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Cache DELETE error for '{key}': {e}")
            return False

    @staticmethod
    async def invalidate_pattern(pattern: str) -> int:
        """Delete all keys matching a pattern. Returns count of deleted keys."""
        redis = await get_redis()
        if not redis:
            return 0
        try:
            keys = await redis.keys(pattern)
            if keys:
                return await redis.delete(*keys)
            return 0
        except Exception as e:
            logger.warning(f"Cache INVALIDATE error for pattern '{pattern}': {e}")
            return 0

    @staticmethod
    async def exists(key: str) -> bool:
        """Check if a key exists in the cache."""
        redis = await get_redis()
        if not redis:
            return False
        try:
            return bool(await redis.exists(key))
        except Exception as e:
            logger.warning(f"Cache EXISTS error for '{key}': {e}")
            return False

    @staticmethod
    async def increment(key: str, ttl: int = 60) -> int:
        """Atomic increment (for rate limiting). Returns the new count."""
        redis = await get_redis()
        if not redis:
            return 0
        try:
            pipe = redis.pipeline()
            await pipe.incr(key)
            await pipe.expire(key, ttl)
            results = await pipe.execute()
            return results[0]
        except Exception as e:
            logger.warning(f"Cache INCR error for '{key}': {e}")
            return 0

    @staticmethod
    async def health_check() -> dict:
        """Returns Redis health status for /health endpoints."""
        redis = await get_redis()
        if not redis:
            return {"status": "unavailable", "url": settings.redis_url}
        try:
            await redis.ping()
            info = await redis.info("server")
            return {
                "status": "healthy",
                "version": info.get("redis_version", "unknown"),
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_human": info.get("used_memory_human", "?"),
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}


# ─── Cache Key Builders ────────────────────────────────────────────────────────

def cache_key_permissions(user_id: str, school_id: str) -> str:
    return f"altrix:permissions:{user_id}:{school_id}"


def cache_key_roles(user_id: str) -> str:
    return f"altrix:roles:{user_id}"


def cache_key_dashboard(school_id: str) -> str:
    return f"altrix:dashboard:{school_id}"


def cache_key_notifications(user_id: str, school_id: str) -> str:
    return f"altrix:notifications:{user_id}:{school_id}"


def cache_key_parent_children(parent_user_id: str, school_id: str) -> str:
    return f"altrix:parent_children:{parent_user_id}:{school_id}"


def cache_key_campus_switch(user_id: str) -> str:
    return f"altrix:campus_data:{user_id}"


def cache_key_school_info(school_id: str) -> str:
    return f"altrix:school:{school_id}"


# ─── Cache Singleton ──────────────────────────────────────────────────────────
cache = CacheService()
