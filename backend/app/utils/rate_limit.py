"""
Rate limiting for the AltRix API.

Two things this has to get right, both of which were previously wrong.

*It must say no.* The handler used to answer an exceeded limit with HTTP 200 and
``{"status": "ok", "items": []}``. Callers cannot distinguish that from a
genuinely empty result, so a throttled dashboard renders "0 students" and a
throttled fee page renders "no invoices" — data loss that looks like data. It
now returns 429 with ``Retry-After``, which clients and proxies understand.

*Counters must be shared.* With in-process storage every worker keeps its own
tally, so the effective limit is multiplied by the worker count and resets on
every deploy. Redis is already a dependency, so counters live there when it is
reachable, and fall back to in-process only for single-process development.
"""
import logging

from fastapi import Request, Response

from app.config import settings

logger = logging.getLogger("app.rate_limit")


def _client_ip(request: Request) -> str:
    """
    The caller's address, as seen through the reverse proxy.

    Vercel and Railway both terminate the connection, so ``request.client.host``
    is the proxy — every user would otherwise share one bucket. The left-most
    X-Forwarded-For entry is the original client.

    This trusts the header, which is only safe because the app is always
    deployed behind a proxy that overwrites it. Exposed directly to the
    internet, a caller could spoof it to dodge limits.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _rate_limit_key(request: Request) -> str:
    """
    Prefer the authenticated user, falling back to the client address.

    Keying on the user means one person on a shared school network cannot
    exhaust everyone else's quota. The identity comes from the middleware that
    already decoded the token for this request; the previous implementation read
    ``request.state.user_id``, which nothing ever set, so every authenticated
    caller silently fell back to an IP bucket.
    """
    try:
        from app.utils.db_session_context import get_request_identity
        identity = get_request_identity()
        if identity and identity.get("sub"):
            return f"user:{identity['sub']}"
    except Exception:
        pass
    return f"ip:{_client_ip(request)}"


MEMORY_STORAGE = "memory://"


def _storage_uri() -> str:
    """
    Shared counters via Redis when configured; in-process otherwise.

    An unexpanded Railway template such as ``${{Redis.REDIS_URL}}`` is not a URL
    and must not be handed to the storage layer.
    """
    url = (settings.redis_url or "").strip()
    if url.startswith(("redis://", "rediss://", "unix://")) and "${{" not in url:
        return url
    logger.warning(
        "Rate limiting is using in-process counters: with more than one worker "
        "the effective limit is multiplied by the worker count. Set REDIS_URL."
    )
    return MEMORY_STORAGE


def _reachable_storage_uri() -> str:
    """
    Return the Redis URI only if Redis actually answers; memory otherwise.

    This probe exists because an unreachable Redis is not a degraded limiter —
    it is a total outage. The storage layer raises on every counter operation,
    slowapi turns that into a 500, and because ``/auth/login`` is rate limited,
    nobody can sign in at all. Checking once at startup means a Redis that is
    already down never takes the product with it.
    """
    uri = _storage_uri()
    if uri == MEMORY_STORAGE:
        return uri

    # Bound the probe: a hanging connect must not stall application startup.
    probe_uri = uri
    if probe_uri.startswith(("redis://", "rediss://")) and "socket_connect_timeout" not in probe_uri:
        probe_uri += ("&" if "?" in probe_uri else "?") + "socket_connect_timeout=2"

    try:
        from limits.storage import storage_from_string
        if storage_from_string(probe_uri).check():
            logger.info("Rate limiting: using shared Redis counters")
            return probe_uri
        logger.error(
            "Rate limiting: Redis did not respond - falling back to in-process "
            "counters. Limits still apply but are per worker."
        )
    except Exception as e:
        logger.error(
            f"Rate limiting: could not reach Redis ({e}) — falling back to "
            "in-process counters. Limits still apply but are per worker."
        )
    return MEMORY_STORAGE


try:
    from slowapi import Limiter
    from slowapi.errors import RateLimitExceeded

    # Development stays generous so local testing is not throttled; production
    # gets a real ceiling rather than the previous 5000/minute, which was high
    # enough to be no limit at all.
    _default_limit = (
        settings.rate_limit_api if settings.is_production else "100000/minute"
    )

    _resolved_storage = _reachable_storage_uri()

    # If Redis dies *after* startup, keep serving:
    #   in_memory_fallback_enabled - limits continue, per process, instead of
    #                                vanishing entirely
    #   swallow_errors             - a storage failure never becomes a 500
    # Rate limiting protects the service; it is not worth taking the service
    # down to enforce it. Brute force also remains covered by the database-backed
    # checks in the auth router, which do not depend on Redis.
    _limiter_opts = dict(
        headers_enabled=True,
        enabled=True,
        in_memory_fallback_enabled=True,
        swallow_errors=True,
    )

    limiter = Limiter(
        key_func=_rate_limit_key,
        storage_uri=_resolved_storage,
        default_limits=[_default_limit],
        **_limiter_opts,
    )

    ip_limiter = Limiter(
        key_func=lambda request: f"ip:{_client_ip(request)}",
        storage_uri=_resolved_storage,
        default_limits=[],
        **_limiter_opts,
    )

    async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
        from fastapi.responses import JSONResponse

        retry_after = getattr(exc, "retry_after", None)
        if retry_after is None:
            # slowapi exposes the window on the limit it tripped.
            limit = getattr(exc, "limit", None)
            retry_after = getattr(getattr(limit, "limit", None), "GRANULARITY", None)
            retry_after = getattr(retry_after, "seconds", 60)

        logger.warning(
            f"Rate limit exceeded on {request.method} {request.url.path} "
            f"by {_rate_limit_key(request)}"
        )
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Too many requests. Please slow down and retry.",
                "retry_after_seconds": int(retry_after),
            },
            headers={"Retry-After": str(int(retry_after))},
        )

except ImportError:  # pragma: no cover - slowapi is a declared dependency
    logger.error(
        "slowapi is not installed — the API is running with NO rate limiting. "
        "Login and password reset endpoints are unprotected against brute force."
    )

    class DummyLimiter:
        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

    limiter = DummyLimiter()
    ip_limiter = DummyLimiter()
    RateLimitExceeded = Exception

    async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please slow down and retry."},
            headers={"Retry-After": "60"},
        )
