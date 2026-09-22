# -*- coding: utf-8 -*-
"""
The owner's board figures come from the school's records, never stand-ins.

The endpoint read fields that do not exist, so it always failed and the
screen invented numbers; the endpoint itself invented teachers, a parent
sentiment, a response count and a provincial benchmark, and counted failed
payments as revenue.
"""
import ast
import io

SRC = io.open("app/routers/owner_insights.py", encoding="utf-8").read()
TREE = ast.parse(SRC)
BODY = ast.unparse(next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == "get_owner_insights_summary"))


def test_no_invented_people_or_numbers():
    for invented in ("Haris Ali", "Sana Fatima", "72, 12, 16", "max(total_c, 240)", "[94, 88, 76, 92, 85]", "500000"):
        assert invented not in SRC, invented


def test_reads_fields_that_exist():
    assert "t.years_experience" not in BODY
    assert "c.description" not in BODY
    assert "joining_date" in BODY and "c.content" in BODY


def test_only_successful_payments_count_as_revenue():
    """
    And only with a status the column can hold.

    This used to assert ``status IN ('success', 'completed', 'paid')`` - the
    filter the code carried. fee_payment_status holds pending / success /
    failed / refunded, so Postgres rejected the whole statement and this
    board's revenue line never loaded. The test was pinning the bug in place.
    """
    assert "status = 'success'" in BODY
    assert "status IN ('success'" not in BODY  # the rejected filter, in any form


def test_no_provincial_average_is_made_up():
    assert "'provincial_average': None" in BODY
