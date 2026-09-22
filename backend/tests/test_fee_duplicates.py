# -*- coding: utf-8 -*-
"""
Billing the same child twice for the same period.

`generate_fee_voucher` had no duplicate check, so re-running a class billing
issued a second full invoice to everyone in it. Production carried three June
invoices for one student, two for July, and a second "Voucher August 2026" for
another whose first copy was already paid — and every copy counted as money
owed, so the defaulters list and the totals built on it were wrong.

The guard lives in the database, because that is the only place every caller
passes through. Existing duplicates are not touched automatically: which copy
goes is the school's decision, so the office cancels one with a reason.
"""
import ast
import io
import re

MIGRATION = io.open(
    "sql_migrations/20260922000000_fee_voucher_duplicate_guard.sql", encoding="utf-8"
).read()
SRC = io.open("app/routers/finance.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


# ── The guard ────────────────────────────────────────────────────────────────

def test_the_guard_is_in_the_function_every_caller_uses():
    assert "CREATE OR REPLACE FUNCTION public.generate_fee_voucher" in MIGRATION
    assert "IF NOT COALESCE(_allow_duplicate, false) THEN" in MIGRATION
    assert "duplicate_voucher" in MIGRATION


def test_it_matches_on_student_plan_and_period_ignoring_cancelled_copies():
    guard = MIGRATION[MIGRATION.index("IF NOT COALESCE(_allow_duplicate"):]
    guard = guard[: guard.index("END IF;")]
    assert "student_id = _student_id" in guard
    assert "fee_plan_id IS NOT DISTINCT FROM _fee_plan_id" in guard
    assert "COALESCE(period_label, '') = COALESCE(_period_label, '')" in guard
    assert "status <> 'cancelled'" in guard


def test_a_deliberate_re_issue_is_still_possible():
    assert "_allow_duplicate boolean DEFAULT false" in MIGRATION


def test_the_old_ten_argument_function_is_replaced_not_shadowed():
    # Leaving it in place would make a 10-argument call resolve to the
    # unguarded version.
    assert "DROP FUNCTION IF EXISTS public.generate_fee_voucher(uuid, uuid, uuid, text, date, numeric, numeric, text, text, uuid)" in MIGRATION


def test_the_refusal_carries_a_code_the_caller_can_recognise():
    assert "USING ERRCODE = 'unique_violation'" in MIGRATION


def test_it_runs_in_one_transaction():
    assert MIGRATION.strip().startswith("--")
    assert "BEGIN;" in MIGRATION and MIGRATION.strip().endswith("COMMIT;")


def test_no_invoice_is_deleted_or_cancelled_by_the_migration():
    assert not re.search(r"\bDELETE\s+FROM\s+public\.fee_invoices", MIGRATION, re.I)
    assert not re.search(r"\bUPDATE\s+public\.fee_invoices\b", MIGRATION, re.I)


def test_the_migration_is_registered_so_the_deploy_applies_it():
    listed = io.open("app/sql_migrations.py", encoding="utf-8").read()
    assert "20260922000000_fee_voucher_duplicate_guard.sql" in listed


# ── Cancelling one copy ──────────────────────────────────────────────────────

CANCEL = fn("cancel_voucher")


def test_a_voucher_can_only_be_cancelled_inside_its_own_school():
    assert "FeeVoucher.school_id == current_user.school_id" in CANCEL
    assert "FINANCE_GOV" in CANCEL


def test_cancelling_requires_a_reason_and_records_it():
    signature = next(
        ast.unparse(node.args)
        for node in ast.walk(TREE)
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "cancel_voucher"
    )
    assert "reason" in signature and "min_length=3" in signature
    assert "voucher.notes" in CANCEL
    assert "Cancelled" in CANCEL


def test_a_voucher_with_money_against_it_is_refused():
    assert "money(voucher.paid_amount) > 0" in CANCEL
    assert "409" in CANCEL


# ── Finding the duplicates that already exist ────────────────────────────────

DUPES = fn("list_duplicate_invoices")


def test_only_the_finance_office_sees_them():
    assert "FINANCE_GOV" in DUPES


def test_it_groups_by_student_plan_and_period():
    assert "GROUP BY student_id, fee_plan_id, COALESCE(period_label, '')" in DUPES
    assert "HAVING COUNT(*) > 1" in DUPES


def test_cancelled_copies_are_not_reported_as_duplicates():
    assert "CAST(:live AS fee_invoice_status[])" in DUPES


def test_a_paid_copy_is_marked_as_one_that_cannot_simply_be_cancelled():
    assert "'cancellable': money(r[9]) == 0" in DUPES


def test_amounts_are_exact_strings():
    assert "float(" not in DUPES
    assert "str(money(" in DUPES
