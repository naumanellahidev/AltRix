"""
Global exception handlers for AltRix API.
Registers all error handlers with the FastAPI app.
Produces standardized, user-friendly JSON error responses.
"""
import logging
import traceback
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from jose import JWTError
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
try:
    from slowapi.errors import RateLimitExceeded
except ImportError:
    RateLimitExceeded = Exception

logger = logging.getLogger("app.error_handlers")


def _error_response(
    status_code: int,
    error: str,
    detail: Any,
    code: Optional[str] = None,
    correlation_id: Optional[str] = None,
) -> JSONResponse:
    """Build a standardized error JSON response."""
    content: Dict[str, Any] = {
        "error": error,
        "code": code or error.upper().replace(" ", "_"),
        "detail": detail,
    }
    if correlation_id:
        content["correlation_id"] = correlation_id

    return JSONResponse(status_code=status_code, content=content)


def _get_correlation_id(request: Request) -> Optional[str]:
    return getattr(getattr(request, "state", None), "correlation_id", None)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI app."""

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        corr_id = _get_correlation_id(request)
        logger.warning(
            f"HTTP {exc.status_code} on {request.method} {request.url.path}: {exc.detail}"
            + (f" [{corr_id}]" if corr_id else "")
        )
        return _error_response(
            status_code=exc.status_code,
            error=_status_to_error_name(exc.status_code),
            detail=exc.detail,
            correlation_id=corr_id,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        corr_id = _get_correlation_id(request)
        # Format field-level errors
        field_errors = []
        for err in exc.errors():
            field = " → ".join(str(loc) for loc in err.get("loc", []))
            field_errors.append({
                "field": field,
                "message": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            })

        logger.warning(
            f"Validation error on {request.method} {request.url.path}: "
            f"{len(field_errors)} field(s) failed"
        )
        return _error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error="validation_failed",
            code="VALIDATION_FAILED",
            detail=field_errors,
            correlation_id=corr_id,
        )

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(
        request: Request, exc: SQLAlchemyError
    ) -> JSONResponse:
        corr_id = _get_correlation_id(request)
        logger.error(
            f"Database error on {request.method} {request.url.path}: {exc}",
            exc_info=True,
        )
        _capture_sentry(exc, request)
        return _error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error="database_error",
            code="DB_ERROR",
            detail="A database error occurred. Please try again shortly.",
            correlation_id=corr_id,
        )

    @app.exception_handler(JWTError)
    async def jwt_exception_handler(request: Request, exc: JWTError) -> JSONResponse:
        corr_id = _get_correlation_id(request)
        logger.warning(f"JWT error on {request.url.path}: {exc}")
        return _error_response(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_token",
            code="INVALID_TOKEN",
            detail="Authentication token is invalid or expired. Please log in again.",
            correlation_id=corr_id,
        )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        retry_after = getattr(exc, "retry_after", 60)
        logger.warning(
            f"Rate limit hit: {request.method} {request.url.path} "
            f"from {request.client.host if request.client else 'unknown'}"
        )
        response = JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": "rate_limit_exceeded",
                "code": "RATE_LIMIT_EXCEEDED",
                "detail": f"Too many requests. Please retry after {retry_after} seconds.",
                "retry_after": retry_after,
            },
        )
        response.headers["Retry-After"] = str(retry_after)
        return response

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        corr_id = _get_correlation_id(request)
        logger.error(
            f"Unhandled exception on {request.method} {request.url.path}: {exc}",
            exc_info=True,
        )
        _capture_sentry(exc, request)

        # Include stack trace only in development
        from app.config import settings
        detail: Any = "An unexpected error occurred. Our team has been notified."
        if settings.is_development:
            detail = {
                "message": str(exc),
                "type": type(exc).__name__,
                "traceback": traceback.format_exc()[-2000:],  # last 2000 chars
            }

        return _error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error="internal_server_error",
            code="INTERNAL_ERROR",
            detail=detail,
            correlation_id=corr_id,
        )


def _status_to_error_name(status_code: int) -> str:
    """Map HTTP status codes to human-readable error names."""
    mapping = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        410: "gone",
        422: "unprocessable_entity",
        429: "too_many_requests",
        500: "internal_server_error",
        502: "bad_gateway",
        503: "service_unavailable",
        504: "gateway_timeout",
    }
    return mapping.get(status_code, f"http_error_{status_code}")


def _capture_sentry(exc: Exception, request: Request) -> None:
    """Send exception to Sentry if configured."""
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("path", str(request.url.path))
            scope.set_tag("method", request.method)
            corr_id = _get_correlation_id(request)
            if corr_id:
                scope.set_tag("correlation_id", corr_id)
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass  # Sentry not configured — silently skip
