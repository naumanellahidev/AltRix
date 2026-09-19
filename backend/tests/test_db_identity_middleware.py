"""
End-to-end check that a request's identity reaches the database layer.

test_db_session_context.py covers the helpers in isolation. What actually
matters is the seam between them: FastAPI resolves get_db *before*
get_current_user, so the identity has to be in place by the time the session
opens. This exercises that through a real ASGI request.
"""
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.middleware import DbIdentityMiddleware
from app.utils.db_session_context import get_request_identity
from app.utils.jwt import create_access_token, create_refresh_token


def _build_app():
    """A minimal app whose dependency reports what get_db would have seen."""
    app = FastAPI()
    app.add_middleware(DbIdentityMiddleware)

    async def fake_get_db():
        # Stands in for get_db: reads the identity at session-open time.
        yield get_request_identity()

    @app.get("/whoami")
    async def whoami(identity=Depends(fake_get_db)):
        return {"identity": identity}

    return app


@pytest.fixture(scope="module")
def client():
    with TestClient(_build_app()) as c:
        yield c


def test_anonymous_request_has_no_identity(client):
    assert client.get("/whoami").json()["identity"] is None


def test_access_token_identity_reaches_the_db_dependency(client):
    token = create_access_token(user_id="11111111-1111-1111-1111-111111111111",
                                email="head@school.test")
    body = client.get("/whoami", headers={"Authorization": f"Bearer {token}"}).json()

    assert body["identity"] is not None, (
        "get_db saw no identity: RLS would evaluate auth.uid() as NULL"
    )
    assert body["identity"]["sub"] == "11111111-1111-1111-1111-111111111111"


def test_refresh_token_does_not_establish_an_identity(client):
    """A refresh token is not a session credential anywhere else either."""
    token = create_refresh_token(user_id="22222222-2222-2222-2222-222222222222",
                                 email="x@y.z")
    body = client.get("/whoami", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["identity"] is None


@pytest.mark.parametrize("header", [
    "Bearer not-a-jwt",
    "Bearer ",
    "Basic abc123",
    "garbage",
    "",
])
def test_unusable_authorization_headers_stay_anonymous(client, header):
    body = client.get("/whoami", headers={"Authorization": header}).json()
    assert body["identity"] is None


def test_forged_token_is_rejected(client):
    """Signed with the wrong key: must not establish an identity."""
    from jose import jwt as jose_jwt
    forged = jose_jwt.encode(
        {"sub": "33333333-3333-3333-3333-333333333333", "email": "e@v.il"},
        "the-wrong-secret",
        algorithm="HS256",
    )
    body = client.get("/whoami", headers={"Authorization": f"Bearer {forged}"}).json()
    assert body["identity"] is None


def test_identity_does_not_persist_into_the_next_request(client):
    """
    Requests reuse worker tasks. An authenticated request must not leave its
    identity behind for the anonymous request that follows it.
    """
    token = create_access_token(user_id="44444444-4444-4444-4444-444444444444",
                                email="a@b.c")
    first = client.get("/whoami", headers={"Authorization": f"Bearer {token}"}).json()
    assert first["identity"]["sub"] == "44444444-4444-4444-4444-444444444444"

    second = client.get("/whoami").json()
    assert second["identity"] is None, "identity leaked into the next request"
