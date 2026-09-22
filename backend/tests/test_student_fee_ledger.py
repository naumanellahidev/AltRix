# -*- coding: utf-8 -*-
"""
One student's fee ledger — the parent's balance screen and the office's
Student Ledger tab, from one endpoint so both see the same numbers.

Nothing it returned could ever have been right:

* it summed ``FeeVoucher.amount``, which the model does not map, so the
  request raised before it answered;
* it filtered invoices on ``status in ("unpaid", "partial")`` — "unpaid" is
  not a value of that enum;
* it counted payments with status "completed", while payments are recorded
  as "success";
* it compared the ``due_date`` column against a formatted string;
* and its only access check was the school, so any signed-in user of the
  school could read any child's balance.

The parent screen caught the resulting error and showed zeros, which is why
nobody noticed.
"""
import ast
import io

SRC = io.open("app/routers/finance.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


LEDGER = fn("balance_dashboard")


def test_it_no_longer_reads_a_column_the_model_does_not_map():
    assert "FeeVoucher.amount" not in LEDGER


def test_it_no_longer_asks_for_a_status_the_enum_does_not_have():
    # The output key "unpaid" (a count of invoices) is fine; asking the
    # database for that status is not.
    assert "status.in_(['unpaid'" not in LEDGER
    assert "IN ('unpaid'" not in LEDGER
    assert "LIVE_INVOICE_STATUSES" in LEDGER


def test_payments_are_matched_on_the_status_they_are_recorded_with():
    assert "PAID_PAYMENT_STATUSES" in LEDGER
    assert "'completed'" not in LEDGER


def test_a_family_can_only_see_its_own_child():
    assert "_require_student_fee_access" in LEDGER


def test_the_ledger_stays_inside_one_school():
    assert LEDGER.count("school_id = CAST(:sid AS UUID)") >= 3


def test_money_is_added_as_decimal_and_leaves_as_strings():
    assert "float(" not in LEDGER
    assert "money(r[6])" in LEDGER and "money(r[7])" in LEDGER
    assert "str(outstanding)" in LEDGER


def test_an_overpaid_invoice_is_advance_not_a_negative_balance():
    assert "elif balance < 0:" in LEDGER
    assert "'advance'" in LEDGER


def test_the_fields_the_parent_screen_reads_are_still_there():
    for key in ("'total_due'", "'total_paid'", "'overdue_amount'", "'active_escalations'"):
        assert key in LEDGER, key


def test_a_failed_or_refunded_payment_is_shown_as_such_not_hidden():
    assert "'counted': r[3] in PAID_PAYMENT_STATUSES" in LEDGER


def test_the_due_date_is_compared_as_a_date():
    assert "r[3] < today" in LEDGER
    assert 'strftime("%Y-%m-%d")' not in LEDGER
