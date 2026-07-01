"""
Rate limiting for AltRix API.
Uses slowapi (a Starlette-compatible wrapper around limits).
"""
import logging
from fastapi import Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger("app.rate_limit")


def _get_user_or_ip(request: Request) -> str:
    """
    Key function: use user ID from auth state if available, else fall back to IP.
    This prevents IP-based limits from affecting legitimate authenticated users.
    """
    # Try to get user ID from request state (set by auth middleware)
    user_id = getattr(getattr(request, "state", None), "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


# ─── Limiter Instances ────────────────────────────────────────────────────────

# Main limiter — uses Redis for distributed limiting
limiter = Limiter(
    key_func=_get_user_or_ip,
    storage_uri=None,  # Will be set from settings in main.py lifespan
    default_limits=["200/minute"],
)

# Strict IP-only limiter for public/auth endpoints
ip_limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
)


# ─── Rate Limit Decorators ────────────────────────────────────────────────────

def rate_limit_login(request: Request, response: Response):
    """5 login attempts per minute per IP."""
    pass  # Applied via @limiter.limit decorator in router


def rate_limit_password_reset(request: Request, response: Response):
    """3 password reset requests per 5 minutes per IP."""
    pass


# ─── Custom Error Handler ──────────────────────────────────────────────────────

async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
    """Return a structured 429 response with Retry-After header."""
    from fastapi.responses import JSONResponse
    from slowapi.errors import RateLimitExceeded as _RLE
    _exc = exc if isinstance(exc, _RLE) else exc

    retry_after = getattr(_exc, "retry_after", 60)
    
    logger.warning(
        f"Rate limit exceeded: {request.method} {request.url.path} "
        f"from {get_remote_address(request)}"
    )
    
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
            "X-RateLimit-Limit": str(getattr(_exc, "limit", "unknown")),
        },
    )

