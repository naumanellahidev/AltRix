"""
Custom middleware for the AltRix API: CORS, request logging, and execution timing.
"""
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("app.middleware")


class DbIdentityMiddleware:
    """
    Publish the caller's user id for the duration of the request so database
    sessions can hand it to Postgres, where row-level security reads it through
    ``auth.uid()``.

    This has to run before dependency resolution: FastAPI resolves ``get_db``
    before ``get_current_user``, so the session needs an identity before the
    auth dependency has computed one.

    Written as a raw ASGI middleware rather than a ``BaseHTTPMiddleware``
    deliberately. ``BaseHTTPMiddleware`` runs the downstream app in a separate
    anyio task, and whether a ``ContextVar`` set in ``dispatch`` is visible to
    the endpoint then depends on Starlette's internals. A plain ASGI middleware
    stays on the same task, so the identity is reliably visible to ``get_db``.

    It only verifies the token signature and reads ``sub``; it grants nothing.
    Authorization still happens in the dependencies and routers, and an absent
    or invalid token simply leaves the request anonymous.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        from app.utils.db_session_context import (
            set_request_identity, clear_request_identity,
        )

        set_request_identity(None)

        auth_header = ""
        for key, value in scope.get("headers") or ():
            if key == b"authorization":
                auth_header = value.decode("latin-1")
                break

        scheme, _, token = auth_header.partition(" ")
        if scheme.lower() == "bearer" and token:
            try:
                from app.utils.jwt import decode_supabase_token
                payload = await decode_supabase_token(token)
                # A refresh token is not a session credential; ignore it here,
                # exactly as get_current_user does.
                if payload.get("token_type") != "refresh":
                    set_request_identity(
                        payload.get("sub"),
                        role=payload.get("role") or "authenticated",
                        email=payload.get("email") or "",
                    )
            except Exception as exc:
                logger.warning("Optional step failed (%s): %s", "from app.utils.jwt import decode_supabas", exc, exc_info=True)

        try:
            await self.app(scope, receive, send)
        finally:
            clear_request_identity()


class LoggingMiddleware(BaseHTTPMiddleware):
    """Logs details about incoming requests and their processing time."""
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        path = request.url.path
        method = request.method
        
        # Log request start
        logger.info(f"Started {method} '{path}'")
        
        try:
            response = await call_next(request)
            process_time = (time.time() - start_time) * 1000
            response.headers["X-Process-Time-Ms"] = f"{process_time:.2f}"
            logger.info(
                f"Finished {method} '{path}' - Status {response.status_code} in {process_time:.2f}ms"
            )
            return response
        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(
                f"Failed {method} '{path}' in {process_time:.2f}ms - Exception: {e}",
                exc_info=True
            )
            raise
