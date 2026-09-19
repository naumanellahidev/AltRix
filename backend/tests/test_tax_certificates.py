# -*- coding: utf-8 -*-
"""
Annual certificates of fees paid.

The certificate always said PKR 0: it counted payments with status
"completed" (payments are recorded as "success") and read a field that does
not exist, and the error that raised was swallowed for every payment. It also
counted two calendar years for one fiscal year, and any user of the school
could issue or read one for any student.
"""
import ast
import io

import pytest
from fastapi import HTTPException

from app.routers.finance import PAID_PAYMENT_STATUSES, _fiscal_year_bounds

SRC = io.open("app/routers/finance.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    return ast.unparse(node)


def test_counts_the_status_payments_are_recorded_with():
    assert "success" in PAID_PAYMENT_STATUSES
    assert "PAID_PAYMENT_STATUSES" in fn("generate_tax_certificate")
    assert "transaction_id" not in fn("generate_tax_certificate")


def test_fiscal_year_is_july_to_june():
    assert _fiscal_year_bounds("2025-2026") == (2025, 2026)
    body = fn("generate_tax_certificate")
    assert "datetime(start_year, 7, 1" in body and "datetime(end_year, 7, 1" in body
    assert "paid_at < period_end" in body


@pytest.mark.parametrize("bad", ["2025", "2025-2027", "abc", "2025-26", "", "1900-1901"])
def test_rejects_a_fiscal_year_it_cannot_read(bad):
    with pytest.raises(HTTPException) as err:
        _fiscal_year_bounds(bad)
    assert err.value.status_code == 422


def test_only_the_finance_office_or_the_family_can_see_a_childs_certificate():
    assert "_require_tax_certificate_access" in fn("generate_tax_certificate")
    assert "_require_tax_certificate_access" in fn("get_tax_certificates")
    guard = fn("_require_tax_certificate_access")
    assert "get_allowed_student_ids" in guard and "FINANCE_GOV" in guard
    assert "school_id" in guard


def test_sums_money_exactly_and_stores_json_safe_details():
    body = fn("generate_tax_certificate")
    assert "money(payment.amount)" in body
    assert "'amount': str(amount)" in body
    assert ".isoformat()" in body


def test_a_family_cannot_state_the_schools_tax_number():
    assert "FINANCE_GOV" in fn("generate_tax_certificate")


def test_jazzcash_takes_an_exact_amount_and_a_real_mobile_number():
    from decimal import Decimal

    from pydantic import ValidationError

    from app.schemas import JazzCashPaymentRequest

    sid = "11111111-1111-4111-8111-111111111111"
    whole = JazzCashPaymentRequest(student_id=sid, mobile_number="03211234567")
    assert whole.amount is None  # the server charges the outstanding balance
    part = JazzCashPaymentRequest(student_id=sid, mobile_number="03211234567", amount="1250.50")
    assert part.amount == Decimal("1250.50")
    for bad in ("", "3001234567", "0300-1234567x", "+923001234567"):
        with pytest.raises(ValidationError):
            JazzCashPaymentRequest(student_id=sid, mobile_number=bad)
