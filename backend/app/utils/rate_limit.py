"""
Rate limiting for AltRix API (Safe fallback if slowapi is not installed).
Bypasses rate limiting in local/dev environments to prevent 429 errors.
"""
import logging
from fastapi import Request, Response
from app.config import settings

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

    # In development/local, set extremely generous limit (100,000/minute)
    default_rate_limit = "100000/minute" if settings.app_env != "production" else "5000/minute"

    limiter = Limiter(
        key_func=_get_user_or_ip,
        storage_uri=None,
        default_limits=[default_rate_limit],
        enabled=True,
    )

    ip_limiter = Limiter(
        key_func=get_remote_address,
        default_limits=[],
        enabled=True,
    )

    async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
        from fastapi.responses import JSONResponse
        logger.warning(f"Rate limit hit on {request.url.path} - Returning 200 OK fallback to prevent UI breakage")
        # Return 200 OK fallback response to prevent frontend UI crashes
        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "rate_limit_exceeded": True,
                "items": [],
                "detail": "Rate limit threshold reached; returning fallback content."
            }
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
        return JSONResponse(status_code=200, content={"status": "ok", "items": []})
