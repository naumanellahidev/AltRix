"""
Rate-limiter tests.

The behaviour that matters most is the response on refusal: answering 200 with
an empty payload, as this used to, is indistinguishable from "there is no data"
and turns throttling into silent data loss in the UI.
"""
import json

import pytest

from app.utils import rate_limit as rl


class FakeRequest:
    def __init__(self, headers=None, client_host="10.0.0.1", path="/api/students"):
        self.headers = headers or {}
        self.client = type("C", (), {"host": client_host})() if client_host else None
        self.method = "GET"
        self.url = type("U", (), {"path": path})()


# --- Refusal response --------------------------------------------------------

@pytest.mark.asyncio
async def test_exceeding_a_limit_returns_429_not_200():
    resp = await rl.rate_limit_exceeded_handler(FakeRequest(), Exception())
    assert resp.status_code == 429, (
        "a 200 with an empty body reads as 'no data' to the client"
    )


@pytest.mark.asyncio
async def test_refusal_does_not_look_like_an_empty_result_set():
    resp = await rl.rate_limit_exceeded_handler(FakeRequest(), Exception())
    body = json.loads(resp.body)
    assert "items" not in body, "must not mimic a successful list response"
    assert body.get("status") != "ok"
    assert "detail" in body


@pytest.mark.asyncio
async def test_refusal_tells_the_client_when_to_retry():
    resp = await rl.rate_limit_exceeded_handler(FakeRequest(), Exception())
    assert "Retry-After" in resp.headers
    assert int(resp.headers["Retry-After"]) > 0


# --- Client address through a proxy -----------------------------------------

def test_forwarded_header_is_preferred_over_the_proxy_address():
    """
    Behind Vercel/Railway, request.client.host is the proxy — without this every
    user shares a single bucket.
    """
    req = FakeRequest({"X-Forwarded-For": "203.0.113.9, 70.41.3.18"},
                      client_host="10.0.0.1")
    assert rl._client_ip(req) == "203.0.113.9"


def test_falls_back_through_real_ip_then_socket():
    assert rl._client_ip(FakeRequest({"X-Real-IP": "198.51.100.4"})) == "198.51.100.4"
    assert rl._client_ip(FakeRequest({}, client_host="10.1.2.3")) == "10.1.2.3"
    assert rl._client_ip(FakeRequest({}, client_host=None)) == "unknown"


def test_blank_forwarded_header_does_not_produce_an_empty_key():
    assert rl._client_ip(FakeRequest({"X-Forwarded-For": " "}, "10.0.0.7")) == "10.0.0.7"


# --- Bucket selection --------------------------------------------------------

def test_authenticated_callers_get_their_own_bucket():
    """
    Keyed per user, one person on a school's shared connection cannot exhaust
    everyone else's quota. The old key read request.state.user_id, which nothing
    ever set, so every caller silently fell back to an IP bucket.
    """
    from app.utils.db_session_context import set_request_identity, clear_request_identity

    set_request_identity("user-42")
    try:
        assert rl._rate_limit_key(FakeRequest()) == "user:user-42"
    finally:
        clear_request_identity()


def test_anonymous_callers_are_keyed_by_address():
    from app.utils.db_session_context import clear_request_identity

    clear_request_identity()
    key = rl._rate_limit_key(FakeRequest({"X-Forwarded-For": "203.0.113.9"}))
    assert key == "ip:203.0.113.9"


def test_two_users_behind_one_address_do_not_share_a_bucket():
    from app.utils.db_session_context import set_request_identity, clear_request_identity

    req = FakeRequest({"X-Forwarded-For": "203.0.113.9"})
    try:
        set_request_identity("user-a")
        a = rl._rate_limit_key(req)
        set_request_identity("user-b")
        b = rl._rate_limit_key(req)
    finally:
        clear_request_identity()
    assert a != b


# --- Storage -----------------------------------------------------------------

def test_redis_is_used_when_configured(monkeypatch):
    monkeypatch.setattr(rl.settings, "redis_url", "redis://cache:6379/0")
    assert rl._storage_uri() == "redis://cache:6379/0"


@pytest.mark.parametrize("value", ["", "   ", "${{Redis.REDIS_URL}}", "not-a-url"])
def test_unusable_redis_url_falls_back_to_memory(monkeypatch, value):
    """
    An unexpanded Railway template such as ${{Redis.REDIS_URL}} is not a URL;
    treating it as one would crash the limiter at import time.
    """
    monkeypatch.setattr(rl.settings, "redis_url", value)
    assert rl._storage_uri() == "memory://"


# --- Resilience when Redis is unavailable ------------------------------------

def test_unreachable_redis_resolves_to_memory(monkeypatch):
    """
    An unreachable Redis is not a degraded limiter, it is an outage: the storage
    layer raises on every counter operation, slowapi turns that into a 500, and
    since /auth/login is rate limited nobody can sign in at all. The startup
    probe must catch that and fall back instead.
    """
    monkeypatch.setattr(rl.settings, "redis_url", "redis://127.0.0.1:6399/0")
    assert rl._reachable_storage_uri() == rl.MEMORY_STORAGE


def test_reachable_redis_is_used_and_given_a_connect_timeout(monkeypatch):
    monkeypatch.setattr(rl.settings, "redis_url", "redis://cache:6379/0")

    class Reachable:
        def check(self):
            return True

    monkeypatch.setattr(
        "limits.storage.storage_from_string", lambda uri, **kw: Reachable()
    )
    resolved = rl._reachable_storage_uri()
    assert resolved.startswith("redis://cache:6379/0")
    # A hanging connect must not stall application startup.
    assert "socket_connect_timeout" in resolved


def test_probe_failure_is_caught_rather_than_raised(monkeypatch):
    monkeypatch.setattr(rl.settings, "redis_url", "redis://cache:6379/0")

    def boom(uri, **kw):
        raise RuntimeError("DNS failure")

    monkeypatch.setattr("limits.storage.storage_from_string", boom)
    assert rl._reachable_storage_uri() == rl.MEMORY_STORAGE


def test_limiter_is_configured_to_survive_a_mid_flight_redis_failure():
    """
    Redis can die after startup. Limits should then continue per process rather
    than disappearing, and a storage error must never surface as a 500.
    """
    if hasattr(rl.limiter, "_in_memory_fallback_enabled"):
        assert rl.limiter._in_memory_fallback_enabled is True
    if hasattr(rl.limiter, "_swallow_errors"):
        assert rl.limiter._swallow_errors is True
