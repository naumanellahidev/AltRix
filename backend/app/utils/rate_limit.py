"""
Rate limiting for AltRix API (Safe fallback if slowapi is not installed).
"""
import logging
from fastapi import Request, Response

logger = logging.getLogger("app.rate_limit")

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded

    def _get_user_or_ip(request: Request) -> str:
        user_id = getattr(getattr(request, "state", None), "user_id", None)
        if user_id:
            return f"user:{user_id}"
        return get_remote_address(request)

    limiter = Limiter(
        key_func=_get_user_or_ip,
        storage_uri=None,
        default_limits=["200/minute"],
    )

    ip_limiter = Limiter(
        key_func=get_remote_address,
        default_limits=[],
    )

    async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
        from fastapi.responses import JSONResponse
        retry_after = getattr(exc, "retry_after", 60)
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limit_exceeded",
                "code": "RATE_LIMIT_EXCEEDED",
                "detail": f"Too many requests. Please retry after {retry_after} seconds.",
                "retry_after": retry_after,
            },
            headers={
                "Retry-After": str(retry_after),
            },
        )

except ImportError:
    class DummyLimiter:
        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

    limiter = DummyLimiter()
    ip_limiter = DummyLimiter()

    async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=429, content={"error": "rate_limit_exceeded"})
