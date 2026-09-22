# -*- coding: utf-8 -*-
"""
The Fees Centre overview.

``/finance/reports/summary`` could not be the source for it:

* it called an invoice "collected" when its *status* said paid, so a half-paid
  invoice counted as nothing collected and a paid invoice whose status was
  never refreshed counted as nothing either;
* it returned ``float``, so 1650.10 three times is 4950.299999999999;
* it accepted from_date/to_date and ignored both.

``/finance/collection-board`` answers from the payments that were actually
received, keeps the arithmetic in NUMERIC, and hands every amount out as a
string.
"""
import ast
import io
from datetime import date

import pytest
from fastapi import HTTPException

from app.routers.finance import (
    COLLECTED_PAYMENT_STATUS,
    LIVE_INVOICE_STATUSES,
    _amount,
    _period_bounds,
)

SRC = io.open("app/routers/finance.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    return ast.unparse(node)


BOARD = fn("collection_board")


def test_collected_comes_from_payments_not_from_invoice_status():
    assert "FROM fee_payments p" in BOARD
    assert "p.status = CAST(:paid_status AS fee_payment_status)" in BOARD
    assert COLLECTED_PAYMENT_STATUS == "success"
    # The old mistake, in its exact shape.
    assert "SUM(total_amount) FILTER (WHERE status = 'paid')" not in BOARD


def test_cancelled_and_draft_invoices_are_not_money_owed():
    assert set(LIVE_INVOICE_STATUSES) == {"pending", "partial", "paid", "overdue"}
    assert "cancelled" not in LIVE_INVOICE_STATUSES
    assert "draft" not in LIVE_INVOICE_STATUSES
    assert BOARD.count("CAST(:live AS fee_invoice_status[])") >= 4


def test_outstanding_never_goes_negative_and_overpayment_is_reported_separately():
    assert "GREATEST(i.total_amount - i.paid_amount, 0)" in BOARD
    assert "GREATEST(i.paid_amount - i.total_amount, 0)" in BOARD
    assert "'advance'" in BOARD  # ast.unparse normalises the quotes


def test_no_float_touches_the_money():
    assert "float(" not in BOARD
    assert "_amount(" in BOARD


def test_amounts_leave_as_exact_strings():
    assert _amount("1650.10") == "1650.10"
    assert _amount(None) == "0.00"
    assert _amount(0.1 + 0.2) == "0.30"


def test_a_rate_with_nothing_to_divide_by_is_unknown_not_zero():
    assert "if billed > 0 else None" in BOARD
    assert "if money(r[3]) > 0 else None" in BOARD


def test_the_period_is_honoured_not_ignored():
    assert "i.due_date BETWEEN :start AND :end" in BOARD
    assert BOARD.count("::date BETWEEN :start AND :end") >= 3


def test_period_defaults_to_this_month_in_karachi_time():
    start, end = _period_bounds(None, None)
    today = date.today()
    assert start.day == 1
    assert start <= end
    assert abs((end - today).days) <= 1


def test_period_accepts_an_explicit_range():
    assert _period_bounds("2026-04-01", "2026-04-30") == (date(2026, 4, 1), date(2026, 4, 30))


@pytest.mark.parametrize("bad", ["01-04-2026", "2026-13-01", "yesterday", "2026/04/01"])
def test_an_unreadable_date_is_refused_rather_than_guessed(bad):
    with pytest.raises(HTTPException) as err:
        _period_bounds(bad, None)
    assert err.value.status_code == 400


def test_a_backwards_period_is_refused():
    with pytest.raises(HTTPException) as err:
        _period_bounds("2026-04-30", "2026-04-01")
    assert err.value.status_code == 400


def test_only_the_finance_office_can_read_it():
    assert "FINANCE_GOV" in BOARD
    assert "ForbiddenError" in BOARD


def test_it_stays_inside_one_school_and_honours_the_campus_a_user_belongs_to():
    assert BOARD.count("i.school_id = CAST(:sid AS UUID)") >= 3
    assert "p.school_id = CAST(:sid AS UUID)" in BOARD
    assert "current_user.campus_id" in BOARD


def test_the_aging_buckets_cover_every_overdue_day():
    for window in ("BETWEEN 0 AND 30", "BETWEEN 31 AND 60", "BETWEEN 61 AND 90", "> 90"):
        assert window in BOARD
    assert "i.due_date >= CURRENT_DATE" in BOARD  # not due yet
