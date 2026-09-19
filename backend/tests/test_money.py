"""
Money and marks arithmetic.

These columns were stored as double precision. Binary floating point cannot
represent 1650.10, so three of them summed to 4950.299999999999 and a fully paid
invoice read as partial — reminders kept going out to a parent who had paid.
The same arithmetic decided grade boundaries.
"""
from decimal import Decimal

import pytest

from app.utils.money import D, is_settled, money, percentage, ratio, to_float


# --- The bug these columns had ----------------------------------------------

def test_the_float_failure_this_replaces():
    """The exact case from the audit, shown failing in float and passing in Decimal."""
    as_float = 0.0
    for _ in range(3):
        as_float += 1650.10
    assert as_float != 4950.30            # 4950.299999999999
    assert as_float < 4950.30             # so `paid >= total` was False

    as_money = money(0)
    for _ in range(3):
        as_money += money("1650.10")
    assert as_money == Decimal("4950.30")
    assert is_settled(as_money, "4950.30")


def test_a_fully_paid_invoice_is_settled():
    paid = money(0)
    for instalment in ("1650.10", "1650.10", "1650.10"):
        paid = money(paid + money(instalment))
    assert is_settled(paid, "4950.30") is True


def test_a_part_paid_invoice_is_not_settled():
    assert is_settled("500.00", "5000.00") is False
    assert is_settled("4999.99", "5000.00") is False


def test_overpayment_counts_as_settled():
    assert is_settled("5000.01", "5000.00") is True


# --- Conversion --------------------------------------------------------------

def test_floats_convert_through_str_not_binary():
    """
    Decimal(0.1) is 0.1000000000000000055511151231257827; Decimal("0.1") is
    exactly 0.1 — the number the user actually typed.
    """
    assert D(0.1) == Decimal("0.1")
    assert D(1650.10) == Decimal("1650.10")


@pytest.mark.parametrize("value,expected", [
    (None, "0"), (0, "0"), ("12.5", "12.5"), (Decimal("3.33"), "3.33"), (7, "7"),
])
def test_D_accepts_anything_numeric(value, expected):
    assert D(value) == Decimal(expected)


def test_money_rounds_to_the_stored_scale():
    """A computed value must equal what comes back from a later read."""
    assert money("10.005") == Decimal("10.01")   # half-up, as a till would
    assert money("10.004") == Decimal("10.00")
    assert money(1 / 3) == Decimal("0.33")


def test_ratio_rounds_to_three_places():
    assert ratio("79.9999") == Decimal("80.000")
    assert ratio(2 / 3 * 100) == Decimal("66.667")


# --- Mixing a stored Decimal with a request float ---------------------------

def test_decimal_and_float_cannot_be_multiplied_directly():
    """
    The regression that converting these columns introduced: a stored amount is
    Decimal, a request body carries float, and Python refuses to mix them.
    D() is what every such boundary has to go through.
    """
    stored = Decimal("50000.00")
    from_request = 12.5
    with pytest.raises(TypeError):
        _ = stored * from_request
    assert money(stored * (D(1) + D(from_request) / D(100))) == Decimal("56250.00")


# --- Percentages and grade boundaries ---------------------------------------

def test_percentage_lands_exactly_on_a_grade_boundary():
    """
    A student scoring 40 out of 50 is on exactly 80%. In float the division can
    land at 79.99999999999999 and drop them a grade band.
    """
    assert percentage(40, 50) == Decimal("80.000")
    assert percentage(40, 50) >= Decimal("80")


def test_percentage_returns_none_when_there_is_nothing_to_divide_by():
    """A missing total is not a zero score."""
    assert percentage(10, 0) is None
    assert percentage(10, None) is None


def test_percentage_of_zero_marks_is_zero_not_none():
    assert percentage(0, 50) == Decimal("0.000")


# --- Boundary to the outside world ------------------------------------------

def test_to_float_is_available_for_chart_payloads():
    assert to_float(Decimal("4950.30")) == 4950.30
    assert isinstance(to_float(Decimal("1")), float)


def test_decimal_serialises_as_a_json_number():
    """Responses and Pydantic float fields must not choke on Decimal."""
    import json

    from fastapi.encoders import jsonable_encoder

    payload = jsonable_encoder({"total": Decimal("4950.30")})
    assert json.loads(json.dumps(payload))["total"] == 4950.30


# --- The models actually use it ---------------------------------------------

def test_invoice_columns_are_numeric():
    from sqlalchemy import Float, Numeric

    from app.models.finance import FeeVoucher

    for col in ("total_amount", "paid_amount", "subtotal", "late_fee",
                "discount_amount", "sibling_discount_amount"):
        coltype = FeeVoucher.__table__.columns[col].type
        assert isinstance(coltype, Numeric), f"{col} is not Numeric"
        assert not isinstance(coltype, Float), f"{col} is still floating point"


def test_coordinates_are_left_as_floats():
    """
    Not everything numeric should be Decimal. Latitude has no fixed scale and is
    never compared for exact equality, so converting it would be noise.
    """
    from sqlalchemy import Float

    from app.models.core import School

    assert isinstance(School.__table__.columns["latitude"].type, Float)


def test_marks_columns_are_numeric():
    from sqlalchemy import Float, Numeric

    from app.models.exams import ExamResult

    for col in ("marks_obtained", "max_marks"):
        coltype = ExamResult.__table__.columns[col].type
        assert isinstance(coltype, Numeric) and not isinstance(coltype, Float)
