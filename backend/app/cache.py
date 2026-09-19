import asyncio
import json
import logging
import time
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger("app.cache")

# Singleton Redis pool & connection attempt state
_redis_pool: Optional[aioredis.Redis] = None
_last_redis_attempt: float = 0.0
_redis_retry_cooldown: float = 60.0  # Wait 60s before retrying failed Redis connection to prevent per-request latency


# ─── TTL Constants (seconds) ──────────────────────────────────────────────────
TTL_PERMISSIONS = 300        # 5 minutes
TTL_USER_ROLES = 600         # 10 minutes
TTL_DASHBOARD_KPIS = 60      # 1 minute
TTL_NOTIFICATIONS = 120      # 2 minutes
TTL_PARENT_CHILDREN = 3600   # 1 hour
TTL_CAMPUS_SWITCH = 600      # 10 minutes
TTL_SCHOOL_INFO = 1800       # 30 minutes


async def init_redis() -> Optional[aioredis.Redis]:
    """Initialize and return the Redis connection pool with cooldown on failure."""
    global _redis_pool, _last_redis_attempt
    now = time.time()

    # If we tried recently and failed, return None immediately without blocking HTTP requests
    if _redis_pool is None and (now - _last_redis_attempt) < _redis_retry_cooldown:
        return None

    _last_redis_attempt = now

    if _redis_pool is None:
        try:
            pool = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=settings.redis_pool_size,
                socket_connect_timeout=0.5,  # 500ms max timeout
            )
            await pool.ping()
            _redis_pool = pool
            logger.info(f"Redis connected: {settings.redis_url}")
        except Exception as e:
            logger.warning(f"Redis unavailable: {e} — cache disabled, running without cache (retry in 60s)")
            _redis_pool = None

    return _redis_pool


async def close_redis():
    """Close the Redis connection pool."""
    global _redis_pool
    if _redis_pool:
        try:
            await _redis_pool.aclose()
        except Exception:
            pass
        _redis_pool = None
        logger.info("Redis connection closed")


async def get_redis() -> Optional[aioredis.Redis]:
    """Return the active Redis pool, or None if unavailable."""
    if _redis_pool is None:
        return await init_redis()
    return _redis_pool


class CacheManager:
    """
    Enterprise caching service with JSON serialization, trackable stats, and dynamic refreshing.
    """
    def __init__(self):
        self.hits = 0
        self.misses = 0
        self.errors = 0

    @staticmethod
    def build_key(
        school_id: str,
        base_key: str,
        tenant_id: Optional[str] = None,
        campus_id: Optional[str] = None,
        user_id: Optional[str] = None,
        role: Optional[str] = None,
    ) -> str:
        tid = tenant_id or school_id
        parts = [f"tenant_{tid}", f"school_{school_id}"]
        if campus_id:
            parts.append(f"campus_{campus_id}")
        if user_id:
            parts.append(f"user_{user_id}")
        if role:
            parts.append(f"role_{role}")
        parts.append(base_key)
        return "_".join(parts)

    async def get(self, key: str) -> Optional[Any]:
        redis = await get_redis()
        if not redis:
            self.misses += 1
            return None
        try:
            raw = await redis.get(key)
            if raw is None:
                self.misses += 1
                return None
            self.hits += 1
            return json.loads(raw)
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache GET error for '{key}': {e}")
            return None

    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        redis = await get_redis()
        if not redis:
            return False
        try:
            serialized = json.dumps(value, default=str)
            await redis.setex(key, ttl, serialized)
            return True
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache SET error for '{key}': {e}")
            return False

    async def delete(self, key: str) -> bool:
        redis = await get_redis()
        if not redis:
            return False
        try:
            await redis.delete(key)
            return True
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache DELETE error for '{key}': {e}")
            return False

    async def invalidate(self, key: str) -> bool:
        return await self.delete(key)

    async def invalidate_pattern(self, pattern: str) -> int:
        redis = await get_redis()
        if not redis:
            return 0
        try:
            # SCAN rather than KEYS: KEYS walks the whole keyspace in one
            # blocking call, which stalls every other client once the cache
            # holds a few hundred thousand keys.
            deleted = 0
            batch: list = []
            async for key in redis.scan_iter(match=pattern, count=500):
                batch.append(key)
                if len(batch) >= 500:
                    deleted += await redis.delete(*batch)
                    batch = []
            if batch:
                deleted += await redis.delete(*batch)
            return deleted
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache INVALIDATE error for pattern '{pattern}': {e}")
            return 0

    async def exists(self, key: str) -> bool:
        """Check if a key exists in the cache."""
        redis = await get_redis()
        if not redis:
            return False
        try:
            return bool(await redis.exists(key))
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache EXISTS error for '{key}': {e}")
            return False

    async def increment(self, key: str, ttl: int = 60) -> int:
        """Atomic increment (for rate limiting). Returns the new count."""
        redis = await get_redis()
        if not redis:
            return 0
        try:
            pipe = redis.pipeline()
            await pipe.incr(key)
            await pipe.expire(key, ttl)
            results = await pipe.execute()
            val = results[0] if results else 0
            return val if isinstance(val, int) else 0
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache INCR error for '{key}': {e}")
            return 0

    async def clear(self) -> bool:
        """Clear all cache keys under the altrix namespace."""
        redis = await get_redis()
        if not redis:
            return False
        try:
            keys = await redis.keys("tenant_*") + await redis.keys("altrix:*")
            if keys:
                await redis.delete(*keys)
            return True
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache CLEAR error: {e}")
            return False

    async def refresh(self, key: str, builder_callable, ttl: int = 300) -> Optional[Any]:
        """Runs the builder callable, caches it, and returns the fresh value."""
        try:
            if asyncio.iscoroutinefunction(builder_callable):
                value = await builder_callable()
            else:
                value = builder_callable()
            await self.set(key, value, ttl)
            return value
        except Exception as e:
            self.errors += 1
            logger.warning(f"Cache REFRESH error for '{key}': {e}")
            return None

    async def get_stats(self) -> dict:
        redis_status = await self.health_check()
        return {
            "hits": self.hits,
            "misses": self.misses,
            "errors": self.errors,
            "redis": redis_status
        }

    async def health_check(self) -> dict:
        redis = await get_redis()
        if not redis:
            return {"status": "unavailable", "url": settings.redis_url}
        try:
            await redis.ping()
            info = await redis.info("server")
            mem = await redis.info("memory")
            return {
                "status": "healthy",
                "version": info.get("redis_version", "unknown"),
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_human": mem.get("used_memory_human", "?"),
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}


# ─── Cache Singleton ──────────────────────────────────────────────────────────
cache = CacheManager()


# ─── Cache Key Builders (Legacy / Compatibility layer) ───────────────────────

def cache_key_permissions(user_id: str, school_id: str) -> str:
    return cache.build_key(school_id=school_id, base_key="permissions", user_id=user_id)


def cache_key_roles(user_id: str) -> str:
    return cache.build_key(school_id="global", base_key=f"roles:{user_id}")


def cache_key_auth_roles(user_id: str, school_id: str) -> str:
    """
    Key for the per-school role set resolved on every authenticated request.

    This must stay in lockstep with ``get_current_user_with_roles``; a mismatch
    means revoked roles keep working until the TTL expires.
    """
    return cache.build_key(school_id=str(school_id), base_key=f"auth:roles:{user_id}")


async def invalidate_user_role_cache(user_id: str, school_id: Optional[str] = None) -> None:
    """
    Drop a user's cached authorization so a role change takes effect at once.

    Call this from every path that grants, revokes or changes a role, and on
    logout. Without it a revoked teacher keeps full access until TTL_USER_ROLES
    elapses.
    """
    try:
        if school_id:
            await cache.delete(cache_key_auth_roles(user_id, school_id))
            await cache.delete(cache_key_permissions(user_id, str(school_id)))
        else:
            # School unknown (e.g. logout): clear every tenant's entry for them.
            await cache.invalidate_pattern(f"*auth:roles:{user_id}")
            await cache.invalidate_pattern(f"*user_{user_id}_permissions")
        await cache.delete(cache_key_roles(user_id))
    except Exception as e:  # cache failures must never block an auth change
        logger.warning(f"Failed to invalidate role cache for {user_id}: {e}")


def cache_key_dashboard(school_id: str) -> str:
    return cache.build_key(school_id=school_id, base_key="dashboard")


def cache_key_notifications(user_id: str, school_id: str) -> str:
    return cache.build_key(school_id=school_id, base_key="notifications", user_id=user_id)


def cache_key_parent_children(parent_user_id: str, school_id: str) -> str:
    return cache.build_key(school_id=school_id, base_key="parent_children", user_id=parent_user_id)


def cache_key_campus_switch(user_id: str) -> str:
    return cache.build_key(school_id="global", base_key=f"campus_data:{user_id}")


def cache_key_school_info(school_id: str) -> str:
    return cache.build_key(school_id=school_id, base_key="school")
