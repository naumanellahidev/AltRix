# -*- coding: utf-8 -*-
"""
Report cards are private to the child's family, and only once issued.

The detail endpoint checked only that the caller belonged to the same school,
so any parent could read any child's report card — drafts included — by
changing the id in the request. The school check itself also let a caller with
no school at all through, because it compared only when the caller had one.
"""
import ast
import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.utils.security import require_school_match


def _user(school_id, super_admin=False):
    return SimpleNamespace(school_id=school_id, is_super_admin=super_admin, roles=["parent"])


def test_same_school_passes():
    require_school_match(_user("s1"), "s1")


def test_other_school_is_refused():
    with pytest.raises(HTTPException) as exc:
        require_school_match(_user("s1"), "s2")
    assert exc.value.status_code == 403


def test_a_caller_with_no_school_is_refused():
    with pytest.raises(HTTPException) as exc:
        require_school_match(_user(None), "s2")
    assert exc.value.status_code == 403


def test_super_admin_is_not_bound_to_a_school():
    require_school_match(_user(None, super_admin=True), "s2")


def _function_source(name: str) -> str:
    tree = ast.parse(io.open("app/routers/report_cards.py", encoding="utf-8").read())
    fn = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    return ast.unparse(fn)


def test_detail_limits_families_to_their_own_published_cards():
    src = _function_source("get_report_card_detail")
    assert "get_allowed_student_ids" in src
    assert "card.is_published" in src


def test_verification_ignores_unpublished_drafts():
    assert "card.is_published" in _function_source("verify_report_card")


# ─── Issuing ──────────────────────────────────────────────────────────────────

import asyncio  # noqa: E402

from app.routers.report_cards import _issue  # noqa: E402


class _NoTemplateDb:
    async def execute(self, *_args, **_kwargs):  # pragma: no cover - not reached
        raise AssertionError("no template lookup expected")


def _card(**kw):
    base = dict(is_published=False, published_at=None, qr_verification_token=None, template_id=None, signed_at=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_issuing_creates_a_verification_token():
    card = _card()
    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(_issue(_NoTemplateDb(), card))
    assert card.is_published is True
    assert card.qr_verification_token and len(card.qr_verification_token) > 20
    assert card.published_at is not None


def test_reissuing_keeps_the_token_already_printed():
    """A re-publish used to mint a new token and void every printed QR code."""
    card = _card(qr_verification_token="printed-token", published_at="2026-09-01")
    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(_issue(_NoTemplateDb(), card))
    assert card.qr_verification_token == "printed-token"
    assert card.published_at == "2026-09-01"


def test_bulk_publish_is_scoped_by_uuid_not_by_string_comparison():
    src = _function_source("bulk_publish")
    assert "UUID(str(current_user.school_id))" in src
    assert "_issue(" in src
