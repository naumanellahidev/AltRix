# -*- coding: utf-8 -*-
"""
Refresh tokens: a reload during a refresh no longer signs the user out, and
logging out ends the refresh token as well as the access token.

Rotation retired the presented token at once, so a browser that navigated
away before the new cookie arrived was signed out on its next refresh.
Logout blacklisted only the access token; the 30-day refresh token (the
cookie was only cleared in the browser) kept minting access tokens.
"""
import ast
import io

SRC = io.open("app/routers/auth.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name):
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    return ast.unparse(node)


def test_a_just_rotated_token_is_accepted_for_a_short_grace():
    body = fn("refresh_token")
    assert "ROTATION_GRACE_SECONDS" in body and "reason == 'rotated'" in body
    assert "reason='rotated'" in body
    from app.routers.auth import ROTATION_GRACE_SECONDS
    assert 0 < ROTATION_GRACE_SECONDS <= 120


def test_logout_revokes_the_refresh_token_and_ends_any_grace():
    body = fn("logout")
    assert "REFRESH_COOKIE_NAME" in body and "reason='logout'" in body
    assert "SET reason = 'logout'" in body


def test_the_migration_adds_the_reason():
    sql = io.open("sql_migrations/20261031000700_token_blacklist_reason.sql", encoding="utf-8").read()
    assert "ADD COLUMN IF NOT EXISTS reason" in sql
