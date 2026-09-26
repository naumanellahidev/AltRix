"""
Payment gateway credentials: each school's own merchant is used, and no
member of staff can read a school's merchant secrets through the data proxy.
"""
import asyncio

from app.routers import payments as pay
from app.routers import vps_db


class _Result:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class _Db:
    def __init__(self, row):
        self.row = row

    async def execute(self, *_a, **_k):
        return _Result(self.row)


def _creds(row, monkeypatch, platform=False):
    monkeypatch.setattr(pay.settings, "jazzcash_merchant_id", "PLATFORM" if platform else "")
    monkeypatch.setattr(pay.settings, "jazzcash_integrity_salt", "PSALT" if platform else "")
    return asyncio.run(pay.jazzcash_credentials(_Db(row), "00000000-0000-0000-0000-000000000001"))


FULL = {"is_enabled": True, "environment": "production", "merchant_id": "MC1",
        "merchant_password": "pw", "integrity_salt": "salt", "return_url": None}


def test_a_school_is_paid_through_its_own_merchant(monkeypatch):
    c = _creds(FULL, monkeypatch, platform=True)
    assert c["merchant_id"] == "MC1" and c["salt"] == "salt"
    assert c["api_url"] == pay.JAZZCASH_URLS["production"]


def test_incomplete_or_switched_off_settings_take_no_payment(monkeypatch):
    # Not the platform's merchant either: the school's fees must not go there.
    assert _creds({**FULL, "integrity_salt": ""}, monkeypatch, platform=True) is None
    assert _creds({**FULL, "is_enabled": False}, monkeypatch, platform=True) is None


def test_a_school_without_settings_uses_the_platform_merchant_only_if_set(monkeypatch):
    assert _creds(None, monkeypatch, platform=True)["merchant_id"] == "PLATFORM"
    assert _creds(None, monkeypatch, platform=False) is None


def test_gateway_secrets_are_never_returned():
    rows = [{"merchant_id": "MC1", "merchant_password": "pw", "integrity_salt": "salt"},
            {"merchant_id": "MC2", "merchant_password": "", "integrity_salt": None}]
    vps_db.hide_secrets("jazzcash_settings", rows)
    assert rows[0]["merchant_password"] is None and rows[0]["integrity_salt"] is None
    assert rows[0]["merchant_password_set"] is True and rows[1]["merchant_password_set"] is False
    assert rows[0]["merchant_id"] == "MC1"  # not a secret
    ep = {"hash_key": "k", "store_id": "S"}
    vps_db.hide_secrets("EASYPAISA_SETTINGS", ep)
    assert ep["hash_key"] is None and ep["hash_key_set"] is True
    other = {"merchant_password": "x"}
    vps_db.hide_secrets("fee_settings", other)
    assert other["merchant_password"] == "x"


def test_a_blank_secret_on_save_keeps_the_stored_one():
    payload = {"merchant_id": "MC1", "merchant_password": "", "integrity_salt": None,
               "merchant_password_set": True}
    vps_db.drop_blank_secrets("jazzcash_settings", payload)
    assert payload == {"merchant_id": "MC1"}
    payload = {"merchant_password": "new"}
    vps_db.drop_blank_secrets("jazzcash_settings", payload)
    assert payload == {"merchant_password": "new"}


def test_the_route_goes_through_the_secret_filter():
    import inspect
    src = inspect.getsource(vps_db.query_endpoint)
    assert "drop_blank_secrets" in src and "hide_secrets" in src
    assert "hide_secrets(table, copy.deepcopy(data))" in inspect.getsource(vps_db.broadcast_mutation)
