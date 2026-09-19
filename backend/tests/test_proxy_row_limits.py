"""
Row-limit tests for the data proxy.

Only a minority of the frontend's queries set a limit, so the rest were asking
for whole tables. On a school with tens of thousands of attendance or ledger
rows that is a full table serialised into one response on every page load — the
single biggest scaling problem in the product, and one that gets worse the more
successful a customer is.
"""
import pytest

from app.routers.vps_db import (
    DEFAULT_ROW_LIMIT,
    MAX_ROW_LIMIT,
    _bounded_limit,
)


def test_an_absent_limit_becomes_the_default():
    """A caller that asks for nothing must not get everything."""
    assert _bounded_limit(0) == DEFAULT_ROW_LIMIT
    assert _bounded_limit(-1) == DEFAULT_ROW_LIMIT


@pytest.mark.parametrize("requested", [1, 25, 100, 999, DEFAULT_ROW_LIMIT])
def test_reasonable_limits_are_honoured(requested):
    assert _bounded_limit(requested) == requested


@pytest.mark.parametrize("requested", [MAX_ROW_LIMIT + 1, 50_000, 10**9])
def test_an_excessive_limit_is_clamped(requested):
    """
    Without a ceiling the default cap is decorative: a client could simply ask
    for a million rows.
    """
    assert _bounded_limit(requested) == MAX_ROW_LIMIT


def test_the_ceiling_is_above_the_default():
    assert MAX_ROW_LIMIT > DEFAULT_ROW_LIMIT


def test_limits_are_sane_for_real_screens():
    """
    High enough that ordinary pages are not silently truncated, low enough that
    one query cannot exhaust the worker.
    """
    assert 100 <= DEFAULT_ROW_LIMIT <= 5_000
    assert MAX_ROW_LIMIT <= 50_000
