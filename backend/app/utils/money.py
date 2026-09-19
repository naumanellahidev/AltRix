"""
Decimal helpers for money, marks and percentages.

Why these columns are Decimal
-----------------------------
They used to be ``double precision``. Binary floating point cannot represent
1650.10, so three of them sum to 4950.299999999999 and this is false::

    paid_amount >= total_amount

A parent pays their fees in full and the invoice stays "partial" forever, with
reminders still going out. The same arithmetic decides grade boundaries, where
79.99999999999999 falls in the wrong band.

Why this module exists
----------------------
SQLAlchemy returns ``Decimal`` for a ``Numeric`` column, while request bodies
carry ``float``. Mixing them raises::

    TypeError: unsupported operand type(s) for *: 'decimal.Decimal' and 'float'

So anywhere a stored amount meets a value from the outside, convert first.
``D()`` accepts either and always returns a Decimal; ``money()`` and
``ratio()`` also round to the scale the column stores, so a computed value and
the value that comes back from a later read are the same number.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Union

Number = Union[int, float, str, Decimal, None]

#: Matches NUMERIC(14, 2) on the money columns.
MONEY_PLACES = Decimal("0.01")

#: Matches NUMERIC(8, 3) on marks, percentages and GPA.
RATIO_PLACES = Decimal("0.001")


def D(value: Number, default: str = "0") -> Decimal:
    """
    Convert anything numeric to Decimal.

    Floats go via ``str`` deliberately: ``Decimal(0.1)`` is
    0.1000000000000000055511151231257827, whereas ``Decimal("0.1")`` is exactly
    0.1 — which is the value the user actually typed.
    """
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money(value: Number, default: str = "0") -> Decimal:
    """A Decimal rounded to 2 places, as the money columns store it."""
    return D(value, default).quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)


def ratio(value: Number, default: str = "0") -> Decimal:
    """A Decimal rounded to 3 places, as marks and percentages store them."""
    return D(value, default).quantize(RATIO_PLACES, rounding=ROUND_HALF_UP)


def percentage(part: Number, whole: Number) -> Optional[Decimal]:
    """
    ``part`` as a percentage of ``whole``, or None when there is nothing to
    divide by. Returning None rather than 0 keeps "no marks recorded" distinct
    from "scored zero".
    """
    w = D(whole)
    if w == 0:
        return None
    return ratio(D(part) / w * 100)


def is_settled(paid: Number, total: Number) -> bool:
    """
    Whether an invoice is fully paid.

    The comparison both sides are rounded to the stored scale first, so a
    rounding difference in the last place cannot leave a settled invoice
    looking partial.
    """
    return money(paid) >= money(total)


def to_float(value: Number) -> float:
    """
    For a boundary that genuinely needs a float — a chart payload, a third-party
    SDK. Never use this before arithmetic that decides a balance.
    """
    return float(D(value))
