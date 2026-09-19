"""
Tests for the per-request database identity.

The identity is what Postgres row-level security evaluates via auth.uid(), and
it travels on a *pooled* connection. The properties worth pinning down are
therefore about isolation and cleanup, not about happy-path formatting.
"""
import asyncio
import json

import pytest

from app.utils.db_session_context import (
    apply_identity_to_session,
    clear_identity_from_session,
    clear_request_identity,
    get_request_identity,
    set_request_identity,
)


class FakeSession:
    """Records the statements and bind parameters it is handed."""

    def __init__(self):
        self.calls = []

    async def execute(self, stmt, params=None):
        self.calls.append((str(stmt), params))
        return None


@pytest.fixture(autouse=True)
def _reset_identity():
    clear_request_identity()
    yield
    clear_request_identity()


def test_identity_round_trips():
    set_request_identity("abc-123", role="authenticated", email="a@b.c")
    assert get_request_identity() == {
        "sub": "abc-123", "role": "authenticated", "email": "a@b.c",
    }


def test_empty_user_id_is_anonymous():
    set_request_identity("")
    assert get_request_identity() is None
    set_request_identity(None)
    assert get_request_identity() is None


@pytest.mark.asyncio
async def test_authenticated_session_publishes_both_claim_spellings():
    """
    Different Supabase builds define auth.uid() against request.jwt.claim.sub
    or against the request.jwt.claims JSON. Both must be set or the policies
    evaluate against NULL on some deployments.
    """
    set_request_identity("user-1", email="u@example.com")
    session = FakeSession()
    await apply_identity_to_session(session)

    assert len(session.calls) == 1
    sql, params = session.calls[0]
    assert "request.jwt.claim.sub" in sql
    assert "request.jwt.claims" in sql
    assert params["sub"] == "user-1"
    assert json.loads(params["claims"])["sub"] == "user-1"


@pytest.mark.asyncio
async def test_settings_are_connection_scoped_not_transaction_scoped():
    """
    The routers COMMIT mid-request in many places, and COMMIT discards
    transaction-local settings. is_local must be false.
    """
    set_request_identity("user-1")
    session = FakeSession()
    await apply_identity_to_session(session)

    sql, _ = session.calls[0]
    assert ", false)" in sql
    assert ", true)" not in sql


@pytest.mark.asyncio
async def test_anonymous_request_still_writes_the_setting():
    """
    The load-bearing property: an anonymous request must actively blank the
    identity, otherwise it inherits whatever the previous caller on that pooled
    connection left behind.
    """
    session = FakeSession()
    await apply_identity_to_session(session)

    assert len(session.calls) == 1, "anonymous requests must not skip the write"
    _, params = session.calls[0]
    assert params["sub"] == ""
    assert params["role"] == "anon"


@pytest.mark.asyncio
async def test_clear_blanks_the_identity():
    session = FakeSession()
    await clear_identity_from_session(session)

    sql, _ = session.calls[0]
    assert "request.jwt.claim.sub" in sql
    assert "''" in sql


@pytest.mark.asyncio
async def test_apply_never_propagates_database_errors():
    """
    Application-level authorization is the primary control. A failure to publish
    the identity must not take the request down with it.
    """
    class Broken(FakeSession):
        async def execute(self, stmt, params=None):
            raise RuntimeError("connection gone")

    set_request_identity("user-1")
    await apply_identity_to_session(Broken())      # must not raise
    await clear_identity_from_session(Broken())    # must not raise


@pytest.mark.asyncio
async def test_identity_does_not_leak_between_concurrent_requests():
    """
    ContextVars are per-task. Two requests in flight at once must not see each
    other's identity -- on a multi-tenant API that would be a cross-tenant leak.
    """
    seen = {}

    async def request(name):
        set_request_identity(name)
        await asyncio.sleep(0)  # yield, letting the other task interleave
        session = FakeSession()
        await apply_identity_to_session(session)
        seen[name] = session.calls[0][1]["sub"]

    await asyncio.gather(*(asyncio.create_task(request(n)) for n in ("a", "b", "c")))

    assert seen == {"a": "a", "b": "b", "c": "c"}
