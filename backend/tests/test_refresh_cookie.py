"""
Refresh-token cookie tests.

The refresh token is the 30-day credential, so it is the one worth putting out
of reach of script. These pin the cookie's attributes — HttpOnly is what stops
an XSS reading it, SameSite is what stops another site using it — and check that
the token is no longer handed to JavaScript in the response body.
"""
import pytest

from app.routers import auth as auth_router


class FakeResponse:
    """Captures set_cookie/delete_cookie the way Starlette's Response records them."""

    def __init__(self):
        self.cookies = {}
        self.deleted = []

    def set_cookie(self, key, value, **kw):
        self.cookies[key] = {"value": value, **kw}

    def delete_cookie(self, key, **kw):
        self.deleted.append({"key": key, **kw})


@pytest.fixture
def prod(monkeypatch):
    monkeypatch.setattr(auth_router.settings, "app_env", "production")


def _set(resp=None, token="refresh-token-value"):
    resp = resp or FakeResponse()
    auth_router._set_refresh_cookie(resp, token)
    return resp.cookies[auth_router.REFRESH_COOKIE_NAME]


# --- Cookie attributes -------------------------------------------------------

def test_cookie_is_httponly():
    """The whole point: script must not be able to read it."""
    assert _set()["httponly"] is True


def test_cookie_is_samesite_strict():
    """
    SameSite=Strict is what protects the refresh endpoint from CSRF: the browser
    will not attach the cookie to a request initiated by another site.
    """
    assert _set()["samesite"] == "strict"


def test_cookie_is_secure_in_production(prod):
    assert _set()["secure"] is True


def test_cookie_is_not_secure_outside_production(monkeypatch):
    """A Secure cookie cannot be set over plain http, which would make local
    development impossible to sign in to."""
    monkeypatch.setattr(auth_router.settings, "app_env", "development")
    assert _set()["secure"] is False


def test_cookie_is_scoped_to_the_auth_endpoints():
    """Confining the path keeps it off every other API request."""
    assert _set()["path"] == auth_router.REFRESH_COOKIE_PATH
    assert auth_router.REFRESH_COOKIE_PATH.endswith("/auth")


def test_cookie_lifetime_matches_the_token_lifetime():
    expected = auth_router.settings.refresh_token_expire_days * 24 * 60 * 60
    assert _set()["max_age"] == expected


def test_cookie_carries_the_token_value():
    assert _set(token="abc.def.ghi")["value"] == "abc.def.ghi"


# --- Clearing ----------------------------------------------------------------

def test_clear_targets_the_same_name_and_path():
    """A cookie is only removed when name and path match how it was set."""
    resp = FakeResponse()
    auth_router._clear_refresh_cookie(resp)
    cleared = resp.deleted[0]
    assert cleared["key"] == auth_router.REFRESH_COOKIE_NAME
    assert cleared["path"] == auth_router.REFRESH_COOKIE_PATH


# --- The token must not reach JavaScript ------------------------------------

def test_login_does_not_return_the_refresh_token_in_the_body():
    import ast
    import inspect

    src = inspect.getsource(auth_router.login)
    tree = ast.parse(ast.unparse(ast.parse(src)))
    returns = [
        n for n in ast.walk(tree)
        if isinstance(n, ast.Call)
        and getattr(n.func, "id", None) == "LoginResponse"
    ]
    assert returns, "login should still build a LoginResponse"
    for call in returns:
        for kw in call.keywords:
            if kw.arg == "refresh_token":
                assert isinstance(kw.value, ast.Constant) and kw.value.value is None, (
                    "returning the refresh token in the body puts it back within "
                    "reach of script, which is what the cookie exists to prevent"
                )


def test_refresh_prefers_the_cookie_over_the_body():
    import inspect

    src = inspect.getsource(auth_router.refresh_token)
    cookie_read = src.index("request.cookies.get(REFRESH_COOKIE_NAME)")
    body_read = src.index('body.get("refresh_token"')
    assert cookie_read < body_read, "the cookie must take precedence"
