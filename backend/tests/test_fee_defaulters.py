# -*- coding: utf-8 -*-
"""
Chasing unpaid fees.

The escalation ladder had never raised a single notice. ``check_escalations``
selected ``status in ("unpaid", "partial")`` - "unpaid" is not one of that
enum's values (draft/pending/partial/paid/overdue/cancelled), so Postgres
rejected the statement on every call - and then read ``v.amount``, which the
model does not map. Any authenticated user could also resolve another school's
notice by its id alone.

``/finance/defaulters`` is what the Defaulters tab reads. Its first draft
joined fee_payments and fee_escalations, which multiplied each invoice row by
that student's payments and reported balances two and three times too large.
"""
import ast
import io

import pytest
from fastapi import HTTPException

from app.routers.finance import (
    ESCALATION_LADDER,
    LIVE_INVOICE_STATUSES,
    _aging_bucket,
    _escalation_step,
)

SRC = io.open("app/routers/finance.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    """The function's code with its docstring dropped - this file's assertions
    are about what the code does, and several of them name the old mistakes,
    which the docstrings also quote."""
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


CHECK = fn("check_escalations")
DEFAULTERS = fn("list_defaulters")


# ── The ladder ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "days,level,kind",
    [
        (1, 1, "reminder"),
        (30, 1, "reminder"),
        (31, 2, "warning"),
        (60, 2, "warning"),
        (61, 3, "final_notice"),
        (90, 3, "final_notice"),
        (91, 4, "suspension_warning"),
        (400, 4, "suspension_warning"),
    ],
)
def test_the_ladder_steps_up_with_the_age_of_the_debt(days, level, kind):
    assert _escalation_step(days) == (level, kind)


def test_a_debt_that_is_not_yet_late_earns_the_gentlest_step():
    assert _escalation_step(0) == (1, "reminder")
    assert len(ESCALATION_LADDER) == 4


@pytest.mark.parametrize(
    "days,bucket",
    [(-5, "not_due"), (0, "not_due"), (1, "0_30"), (30, "0_30"), (31, "31_60"),
     (60, "31_60"), (61, "61_90"), (90, "61_90"), (91, "90_plus")],
)
def test_the_buckets_match_the_board(days, bucket):
    assert _aging_bucket(days) == bucket


# ── The check that never ran ─────────────────────────────────────────────────

def test_it_no_longer_asks_for_a_status_the_column_cannot_hold():
    assert "'unpaid'" not in CHECK and '"unpaid"' not in CHECK
    assert "LIVE_INVOICE_STATUSES" in CHECK
    assert "unpaid" not in LIVE_INVOICE_STATUSES


def test_it_reads_a_balance_the_model_actually_maps():
    assert "invoice.amount" not in CHECK and "v.amount" not in CHECK
    assert "money(invoice.total_amount) - money(invoice.paid_amount)" in CHECK


def test_only_a_genuinely_overdue_invoice_is_chased():
    assert "FeeVoucher.due_date < today" in CHECK
    assert "FeeVoucher.total_amount > FeeVoucher.paid_amount" in CHECK


def test_a_settled_invoice_stops_generating_notices():
    assert "UPDATE fee_escalations" in CHECK
    assert "i.paid_amount >= i.total_amount" in CHECK
    assert "resolved = TRUE" in CHECK


def test_it_says_what_it_did():
    assert "Raised" in CHECK and "closed" in CHECK


# ── Access ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("name", ["check_escalations", "list_escalations", "resolve_escalation", "list_defaulters"])
def test_only_the_finance_office_may_touch_the_ladder(name):
    assert "FINANCE_GOV" in fn(name), name


def test_a_notice_can_only_be_resolved_inside_its_own_school():
    body = fn("resolve_escalation")
    assert "FeeEscalation.school_id == current_user.school_id" in body


# ── The defaulters list ──────────────────────────────────────────────────────

def test_one_row_per_student_not_per_payment():
    # The fan-out that inflated every balance.
    assert "LEFT JOIN fee_payments" not in DEFAULTERS
    assert "LEFT JOIN fee_escalations" not in DEFAULTERS
    assert "SELECT MAX(p.paid_at) FROM fee_payments p" in DEFAULTERS


def test_every_subquery_stays_inside_the_school():
    assert DEFAULTERS.count("p.school_id = CAST(:sid AS UUID)") >= 1
    assert DEFAULTERS.count("e.school_id = CAST(:sid AS UUID)") >= 2


def test_balances_leave_as_exact_strings():
    assert "str(money(r[9]))" in DEFAULTERS
    assert "float(" not in DEFAULTERS


def test_it_reports_both_what_was_earned_and_what_was_sent():
    assert "'due_level'" in DEFAULTERS and "'notice_level'" in DEFAULTERS


def test_an_unknown_bucket_is_refused_rather_than_silently_ignored():
    assert "Unknown aging bucket" in DEFAULTERS
    assert "'not_due', '0_30', '31_60', '61_90', '90_plus'" in DEFAULTERS


def test_search_and_filters_are_parameterised():
    assert ":q" in DEFAULTERS and "f\"%{search.strip()}%\"" in DEFAULTERS or "%{search.strip()}%" in DEFAULTERS
    assert "class_section_id" in DEFAULTERS
