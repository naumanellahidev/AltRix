"""
Per-request database identity.

Postgres row-level security decides what a statement can see by calling
``auth.uid()``, which reads the ``request.jwt.claim.sub`` setting on the current
connection. Nothing was setting it except the generic proxy router, so for the
rest of the API ``auth.uid()`` was NULL and every policy that depends on it
could never match. Combined with connecting as a superuser — which bypasses RLS
outright — that left all 604 policies inert.

This module publishes the caller's identity onto the connection that serves
their request, so the policies have something to evaluate.

Two details matter:

*Scope.* The settings are applied with ``is_local => false``, i.e. for the whole
connection rather than the current transaction. Transaction-local values are
discarded by COMMIT, and this codebase commits mid-request in 131 places; a
transaction-local identity would silently vanish partway through a request and
every subsequent statement would be evaluated as anonymous.

*Leakage.* Connection-scoped settings outlive the request, and connections are
pooled. So the identity is written at the start of *every* session — including
anonymous ones, which write empty values — and cleared again when the session
ends. The unconditional write at the start is the load-bearing half: even if a
reset is ever missed, the next request overwrites the value before running any
query of its own.
"""
import logging
from contextvars import ContextVar
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.best_effort import best_effort

logger = logging.getLogger("app.db_context")

#: Claims for the request being served on this task. Starlette runs each request
#: in its own context, so this cannot bleed between concurrent requests.
_request_identity: ContextVar[Optional[dict]] = ContextVar(
    "altrix_request_identity", default=None
)

# One statement, one round trip. Applied on every session.
_APPLY_SQL = text(
    "SELECT set_config('request.jwt.claim.sub', :sub, false),"
    "       set_config('request.jwt.claim.role', :role, false),"
    "       set_config('request.jwt.claims', :claims, false)"
)

_CLEAR_SQL = text(
    "SELECT set_config('request.jwt.claim.sub', '', false),"
    "       set_config('request.jwt.claim.role', '', false),"
    "       set_config('request.jwt.claims', '', false)"
)


def set_request_identity(user_id: Optional[str], role: str = "authenticated",
                         email: str = "") -> None:
    """Record the authenticated caller for the current request."""
    if not user_id:
        _request_identity.set(None)
        return
    _request_identity.set({"sub": str(user_id), "role": role, "email": email or ""})


def get_request_identity() -> Optional[dict]:
    return _request_identity.get()


def clear_request_identity() -> None:
    _request_identity.set(None)


async def apply_identity_to_session(session: AsyncSession) -> None:
    """
    Publish the current request's identity onto the session's connection.

    Always issues the statement, even when anonymous: writing empty values is
    what guarantees a pooled connection cannot inherit the previous caller's
    identity.
    """
    identity = _request_identity.get()
    if identity:
        import json
        params = {
            "sub": identity["sub"],
            "role": identity.get("role") or "authenticated",
            "claims": json.dumps({
                "sub": identity["sub"],
                "role": identity.get("role") or "authenticated",
                "email": identity.get("email", ""),
            }),
        }
    else:
        params = {"sub": "", "role": "anon", "claims": ""}

    try:
        await session.execute(_APPLY_SQL, params)
    except Exception as e:
        # Never fail a request because the identity could not be published.
        # Application-level authorization is the primary control; RLS is
        # defence in depth behind it.
        logger.warning(f"Could not apply request identity to session: {e}")


async def clear_identity_from_session(session: AsyncSession) -> None:
    """Wipe the identity before the connection goes back to the pool."""
    # Runs from a finally: during teardown. A broken or already-closed
    # connection is not handed back to the pool, so there is nothing to leak,
    # and raising here would mask whatever exception is already unwinding.
    async with best_effort("clearing request identity from the session",
                           level=logging.DEBUG):
        await session.execute(_CLEAR_SQL)
