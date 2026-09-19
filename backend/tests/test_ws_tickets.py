"""
WebSocket connection-ticket tests.

Browsers cannot set headers on a WebSocket handshake, so the credential has to
travel in the URL — and URLs are written to proxy access logs. A ticket exists
so that what lands in those logs is worthless: single use, and dead within
thirty seconds.
"""
import time

import pytest

from app.routers import realtime as rt


@pytest.fixture(autouse=True)
def no_redis(monkeypatch):
    """
    Force the in-process path so the tests exercise ticket semantics rather
    than a Redis connection. cache.set returning False is exactly what happens
    in production when Redis is unavailable.
    """
    async def _set(*a, **k):
        return False

    async def _get(*a, **k):
        return None

    async def _delete(*a, **k):
        return False

    monkeypatch.setattr(rt.cache, "set", _set)
    monkeypatch.setattr(rt.cache, "get", _get)
    monkeypatch.setattr(rt.cache, "delete", _delete)
    rt._local_tickets.clear()
    yield
    rt._local_tickets.clear()


@pytest.mark.asyncio
async def test_a_ticket_redeems_to_the_user_who_asked_for_it():
    ticket = await rt._issue_ticket("user-1")
    assert await rt._redeem_ticket(ticket) == "user-1"


@pytest.mark.asyncio
async def test_a_ticket_cannot_be_redeemed_twice():
    """
    The property that makes a logged ticket harmless: by the time anyone reads
    the log entry, the ticket has already been spent.
    """
    ticket = await rt._issue_ticket("user-1")
    assert await rt._redeem_ticket(ticket) == "user-1"
    assert await rt._redeem_ticket(ticket) is None


@pytest.mark.asyncio
async def test_an_unknown_ticket_is_refused():
    assert await rt._redeem_ticket("not-a-real-ticket") is None
    assert await rt._redeem_ticket("") is None


@pytest.mark.asyncio
async def test_an_expired_ticket_is_refused():
    ticket = await rt._issue_ticket("user-1")
    # Age it past its window rather than sleeping.
    rt._local_tickets[ticket] = ("user-1", time.time() - 1)
    assert await rt._redeem_ticket(ticket) is None


@pytest.mark.asyncio
async def test_tickets_are_unguessable_and_distinct():
    tickets = {await rt._issue_ticket("user-1") for _ in range(200)}
    assert len(tickets) == 200
    for t in list(tickets)[:20]:
        # token_urlsafe(32) -> ~43 characters of base64url.
        assert len(t) >= 32


@pytest.mark.asyncio
async def test_one_users_ticket_never_resolves_to_another():
    a = await rt._issue_ticket("user-a")
    b = await rt._issue_ticket("user-b")
    assert await rt._redeem_ticket(a) == "user-a"
    assert await rt._redeem_ticket(b) == "user-b"


@pytest.mark.asyncio
async def test_expired_tickets_do_not_accumulate():
    """The in-process store must not grow without bound."""
    for _ in range(50):
        t = await rt._issue_ticket("user-1")
        rt._local_tickets[t] = ("user-1", time.time() - 1)
    await rt._issue_ticket("user-2")  # issuing prunes
    assert len(rt._local_tickets) == 1


def test_ticket_window_is_short():
    assert 0 < rt.TICKET_TTL_SECONDS <= 60, (
        "a long-lived ticket in an access log is a credential again"
    )
