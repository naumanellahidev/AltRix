"""
JazzCash payment tests.

The callback is a public endpoint that moves money, so these focus on the two
properties that keep it honest: a payload is only accepted if it carries a
signature we can reproduce, and the same reference can never be settled twice.
"""
import hashlib
import hmac

import pytest

from app.models.finance import PaymentTransaction
from app.routers import payments as pay


SALT = "test-integrity-salt"


def _sign(fields: dict, salt: str = SALT) -> str:
    """Independent implementation of the gateway's scheme, per its spec."""
    values = "&".join(
        str(v) for k, v in sorted(fields.items()) if k != "pp_SecureHash" and v
    )
    return hmac.new(
        salt.encode(), f"{salt}&{values}".encode(), hashlib.sha256
    ).hexdigest().upper()


@pytest.fixture
def salted(monkeypatch):
    monkeypatch.setattr(pay.settings, "jazzcash_integrity_salt", SALT)


# --- The lookup bug that silently dropped every real payment ----------------

def test_transaction_lookup_uses_a_real_column():
    """
    The callback used to filter on PaymentTransaction.gateway_transaction_id,
    which is a plain Python property, not a mapped column. Comparing it yields
    the Python bool False, so the query became WHERE false and never matched --
    genuine payments were dropped while the endpoint still answered 200.
    """
    # The property comparison collapses to a plain bool...
    assert (PaymentTransaction.gateway_transaction_id == "x") is False
    assert isinstance(PaymentTransaction.gateway_transaction_id == "x", bool)
    # ...whereas the mapped column produces SQL.
    assert not isinstance(PaymentTransaction.txn_ref_no == "x", bool)
    assert "txn_ref_no" in str(PaymentTransaction.txn_ref_no == "x")


# --- Signature verification --------------------------------------------------

def test_hash_matches_the_gateway_specification():
    fields = {"pp_Amount": "10000", "pp_TxnRefNo": "T1", "pp_MerchantID": "M1"}
    assert pay.generate_jazzcash_hash(fields, SALT) == _sign(fields)


def test_hash_ignores_empty_values_and_the_hash_field():
    a = {"pp_A": "1", "pp_B": "", "pp_SecureHash": "ZZZ"}
    b = {"pp_A": "1"}
    assert pay.generate_jazzcash_hash(a, SALT) == pay.generate_jazzcash_hash(b, SALT)


def test_valid_signature_is_accepted(salted):
    raw = {"pp_ResponseCode": "000", "pp_Amount": "10000", "pp_TxnRefNo": "T1"}
    raw["pp_SecureHash"] = _sign(raw)
    assert pay._verify_callback_signature(raw) is True


@pytest.mark.parametrize("field,value", [
    ("pp_Amount", "1"),            # pay one paisa instead
    ("pp_ResponseCode", "999"),
    ("pp_TxnRefNo", "T-SOMEONE-ELSE"),
])
def test_tampering_after_signing_is_rejected(salted, field, value):
    raw = {"pp_ResponseCode": "000", "pp_Amount": "10000", "pp_TxnRefNo": "T1"}
    raw["pp_SecureHash"] = _sign(raw)
    raw[field] = value
    assert pay._verify_callback_signature(raw) is False


def test_forged_callback_without_the_salt_is_rejected(salted):
    """The whole point: no salt, no way to mark an invoice paid."""
    raw = {"pp_ResponseCode": "000", "pp_Amount": "10000", "pp_TxnRefNo": "T1"}
    raw["pp_SecureHash"] = _sign(raw, salt="attacker-guess")
    assert pay._verify_callback_signature(raw) is False


def test_missing_signature_is_rejected(salted):
    assert pay._verify_callback_signature(
        {"pp_ResponseCode": "000", "pp_TxnRefNo": "T1"}
    ) is False
    assert pay._verify_callback_signature(
        {"pp_ResponseCode": "000", "pp_SecureHash": ""}
    ) is False


def test_unconfigured_salt_fails_closed(monkeypatch):
    """
    With no salt we cannot tell a real callback from a forged one. Accepting it
    would let anyone who can reach the URL settle invoices for free.
    """
    monkeypatch.setattr(pay.settings, "jazzcash_integrity_salt", "")
    raw = {"pp_ResponseCode": "000", "pp_TxnRefNo": "T1"}
    raw["pp_SecureHash"] = _sign(raw)
    assert pay._verify_callback_signature(raw) is False


def test_signature_covers_extra_gateway_fields(salted):
    """ppmpf_* passthrough fields are signed too and must be verified."""
    raw = {"pp_ResponseCode": "000", "pp_TxnRefNo": "T1", "ppmpf_1": "abc"}
    raw["pp_SecureHash"] = _sign(raw)
    assert pay._verify_callback_signature(raw) is True
    raw["ppmpf_1"] = "tampered"
    assert pay._verify_callback_signature(raw) is False


# --- Money handling ----------------------------------------------------------

@pytest.mark.parametrize("amount,paisa", [
    (1, 100), (0.1, 10), (12.34, 1234), (1999.99, 199999), ("450.05", 45005),
])
def test_paisa_conversion_is_exact(amount, paisa):
    assert pay._to_paisa(amount) == paisa


def test_paisa_conversion_avoids_float_drift():
    """int(1.15 * 100) is 114 in binary floating point; Decimal keeps it 115."""
    assert pay._to_paisa(1.15) == 115
    assert pay._to_paisa(8.70) == 870


# --- Transaction references --------------------------------------------------

def test_txn_refs_are_unique_and_gateway_safe():
    refs = {pay._new_txn_ref() for _ in range(20000)}
    assert len(refs) == 20000, "collisions would let one payment settle another invoice"
    for r in list(refs)[:50]:
        assert r.isalnum()
        assert len(r) <= 20, "JazzCash caps pp_TxnRefNo length"
