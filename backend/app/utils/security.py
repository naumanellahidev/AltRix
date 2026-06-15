"""
Security utilities: campus isolation, ownership checks, security headers.
"""
import logging
import uuid as _uuid
from typing import Optional, Set
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger("app.security")


# ─── Security Headers Middleware ──────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds production security headers to every response.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Only apply HSTS in production (HTTPS)
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Cache-Control"] = "no-store"
        return response


# ─── Correlation ID Middleware ─────────────────────────────────────────────────

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Adds a unique X-Correlation-ID header to every request/response.
    This ID is used for tracing across logs.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        correlation_id = request.headers.get(
            "X-Correlation-ID",
            str(_uuid.uuid4())
        )
        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response


# ─── Campus Isolation ─────────────────────────────────────────────────────────

async def validate_campus_access(
    user_campus_id: Optional[_uuid.UUID],
    resource_campus_id: Optional[_uuid.UUID],
    user_roles: Set[str],
    strict: bool = False,
) -> bool:
    """
    Validate that a user can access a resource in the given campus.
    
    Rules:
    - super_admin, school_owner, principal can access all campuses
    - Others can only access their assigned campus (if campus_id is set)
    - If user_campus_id is None (school-wide staff), allow all
    - If resource has no campus (school-wide), allow all
    
    Returns True if access is allowed, raises ForbiddenError if strict=True.
    """
    # Admins bypass campus isolation
    elevated_roles = {"super_admin", "school_owner", "principal", "vice_principal", "school_admin"}
    if any(r in user_roles for r in elevated_roles):
        return True

    # Resource has no campus — accessible to all school staff
    if resource_campus_id is None:
        return True

    # User has no campus restriction
    if user_campus_id is None:
        return True

    # Strict campus match
    if user_campus_id != resource_campus_id:
        if strict:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: resource belongs to a different campus",
            )
        return False

    return True


def require_campus_match(user, resource_campus_id: Optional[_uuid.UUID]):
    """
    Lightweight campus check. Call this inline in router functions.
    Raises 403 if user's campus doesn't match and they're not elevated.
    """
    elevated = {"super_admin", "school_owner", "principal", "vice_principal", "school_admin"}
    user_roles = set(getattr(user, "roles", []))
    if any(r in user_roles for r in elevated):
        return
    if resource_campus_id is None or getattr(user, "campus_id", None) is None:
        return
    user_cid = getattr(user, "campus_id", None)
    if user_cid and str(user_cid) != str(resource_campus_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: resource belongs to a different campus",
        )


def require_school_match(user, resource_school_id: _uuid.UUID):
    """
    Ensure the resource belongs to the user's active school.
    Raises 403 if mismatch.
    """
    if user.is_super_admin:
        return
    user_school = getattr(user, "school_id", None)
    if user_school and str(user_school) != str(resource_school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: resource belongs to a different school",
        )


def require_ownership_or_admin(user, resource_owner_id: Optional[_uuid.UUID]):
    """
    Ensure the user owns the resource OR has admin privileges.
    """
    elevated = {"super_admin", "school_owner", "principal", "vice_principal", "school_admin"}
    user_roles = set(getattr(user, "roles", []))
    if any(r in user_roles for r in elevated):
        return
    if resource_owner_id and str(user.id) != str(resource_owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you don't own this resource",
        )


# ─── Token Blacklist (DB-backed) ───────────────────────────────────────────────

async def blacklist_token(db, jti: str, user_id: _uuid.UUID, expires_at: datetime):
    """Add a JWT ID to the blacklist table."""
    try:
        from sqlalchemy import text
        await db.execute(text("""
            INSERT INTO token_blacklist (jti, user_id, expires_at)
            VALUES (:jti, :user_id, :expires_at)
            ON CONFLICT (jti) DO NOTHING
        """), {
            "jti": jti,
            "user_id": str(user_id),
            "expires_at": expires_at,
        })
    except Exception as e:
        logger.warning(f"Failed to blacklist token {jti}: {e}")


async def is_token_blacklisted(db, jti: str) -> bool:
    """Check if a token's JTI is in the blacklist."""
    try:
        from sqlalchemy import text
        result = await db.execute(
            text("SELECT 1 FROM token_blacklist WHERE jti = :jti AND expires_at > NOW()"),
            {"jti": jti},
        )
        return result.fetchone() is not None
    except Exception as e:
        logger.warning(f"Token blacklist check failed: {e}")
        return False  # Fail open — don't block valid users on DB error
