"""
Who may change an account.

A principal or HR manager of any school could set the password or email of
any account on the platform, grant any role (owner included), and the bulk
import and direct invite overwrote the password of any existing account whose
email was entered.
"""
import asyncio

import pytest
from fastapi import HTTPException

from app.utils import accounts as acc

SCHOOL = "11111111-1111-1111-1111-111111111111"


def _world(monkeypatch, *, platform=(), roles=None, members=(), elsewhere=()):
    roles = roles or {}

    async def is_platform_admin(_db, uid):
        return str(uid) in platform

    async def school_roles(_db, _sid, uid):
        return set(roles.get(str(uid), ()))

    async def is_member(_db, _sid, uid):
        return str(uid) in members or str(uid) in roles

    async def belongs_elsewhere(_db, _sid, uid):
        return str(uid) in elsewhere

    monkeypatch.setattr(acc, "is_platform_admin", is_platform_admin)
    monkeypatch.setattr(acc, "school_roles", school_roles)
    monkeypatch.setattr(acc, "is_member", is_member)
    monkeypatch.setattr(acc, "belongs_elsewhere", belongs_elsewhere)


def _check(actor, target, action="set_password", new_roles=None):
    return asyncio.run(acc.check_governance_target(None, SCHOOL, actor, target, action, new_roles))


def _denied(fn, *a, **k):
    with pytest.raises(HTTPException) as err:
        fn(*a, **k)
    assert err.value.status_code == 403
    return err.value.detail


def test_nobody_in_a_school_can_touch_a_platform_account(monkeypatch):
    _world(monkeypatch, platform={"owner"}, roles={"p": ["principal"]})
    assert "platform" in _denied(_check, "p", "owner")


def test_only_members_of_the_school(monkeypatch):
    _world(monkeypatch, roles={"p": ["principal"]})
    assert "not a member" in _denied(_check, "p", "stranger")


def test_only_people_below_the_caller(monkeypatch):
    _world(monkeypatch, roles={"hr": ["hr_manager"], "p": ["principal"], "t": ["teacher"], "o": ["school_owner"]})
    _check("hr", "t")
    _denied(_check, "hr", "p")          # HR cannot reset the principal
    _denied(_check, "p", "o")           # nor the principal the owner
    _denied(_check, "p", "p")           # nor themselves through governance
    _check("o", "p")


def test_roles_given_must_be_below_the_giver_and_never_owner(monkeypatch):
    _world(monkeypatch, roles={"hr": ["hr_manager"], "t": ["teacher"], "o": ["school_owner"]})
    _check("hr", "t", "set_roles", ["accountant"])
    _denied(_check, "hr", "t", "set_roles", ["school_owner"])
    _denied(_check, "hr", "t", "set_roles", ["principal"])
    _denied(_check, "o", "t", "set_roles", ["super_admin"])
    _denied(lambda: asyncio.run(acc.check_grantable(None, SCHOOL, "hr", ["school_owner"])))


def test_a_shared_account_keeps_its_password_and_email(monkeypatch):
    _world(monkeypatch, roles={"p": ["principal"], "t": ["teacher"]}, elsewhere={"t"})
    assert "another school" in _denied(_check, "p", "t", "set_password")
    assert "another school" in _denied(_check, "p", "t", "set_email")
    _check("p", "t", "deactivate")


def test_the_platform_may_do_anything(monkeypatch):
    _world(monkeypatch, platform={"psa"})
    _check("psa", "anyone", "set_password")


class _Rows:
    def __init__(self, row):
        self.row = row

    def first(self):
        return self.row


class _Db:
    """auth.users lookup returns an existing account; any write is recorded."""
    def __init__(self, existing):
        self.existing = existing
        self.writes = []

    async def execute(self, sql, params=None):
        q = str(sql)
        if q.lstrip().upper().startswith(("UPDATE", "INSERT")):
            self.writes.append(q)
        return _Rows((self.existing,) if "FROM auth.users" in q and self.existing else None)


def test_an_existing_account_is_linked_never_overwritten(monkeypatch):
    _world(monkeypatch)
    db = _Db("uid-1")
    uid, created = asyncio.run(acc.ensure_account(db, "Someone@X.com", "newpassword", "S"))
    assert uid == "uid-1" and created is False and db.writes == []


def test_a_platform_email_cannot_be_added_to_a_school(monkeypatch):
    _world(monkeypatch, platform={"uid-psa"})
    _denied(lambda: asyncio.run(acc.ensure_account(_Db("uid-psa"), "owner@x.com", "whatever1", None)))


def test_a_new_account_is_created_with_its_password(monkeypatch):
    _world(monkeypatch)
    db = _Db(None)
    _uid, created = asyncio.run(acc.ensure_account(db, "new@x.com", "longenough", "N"))
    assert created is True and any("INSERT INTO auth.users" in w for w in db.writes)


def test_the_routes_use_the_guards():
    import io
    src = io.open("app/routers/functions.py", encoding="utf-8").read()
    assert "await check_governance_target(db, school_id, actor_uid, target_uid, action, body.roles)" in src
    assert "await check_grantable(db, school_id, actor_uid, [body.role])" in src
    assert "await ensure_account(db, row_email, pwd, dname)" in src
    # No path in these functions overwrites an existing account's password
    # except the guarded set_password.
    assert src.count("SET encrypted_password") == 1


def test_the_platform_functions_exist_and_are_guarded():
    from app.routers import functions as f
    paths = [r.path for r in f.router.routes]
    for name in ("eduverse-admin-create-school", "eduverse-admin-unlock-bootstrap",
                 "eduverse-bootstrap", "eduverse-recover-master", "eduverse-admin-impersonate"):
        # Declared before the catch-all, which would otherwise answer "not implemented".
        assert paths.index(f"/functions/{name}") < paths.index("/functions/{function_name}")
    import inspect
    create = inspect.getsource(f.admin_create_school)
    assert "_require_platform_admin" in create and "ensure_account(" in create
    assert "SET encrypted_password" not in create
    assert "_require_platform_admin" in inspect.getsource(f.admin_unlock_bootstrap)
    # Minting a platform administrator from a shared secret is not offered.
    assert "platform_super_admins" not in inspect.getsource(f.not_offered)


def test_early_warning_rules():
    from app.routers.functions import early_warnings_for as ew
    base = {"name": "A", "att_total": 0, "att_present": 0, "att_absent": 0, "marks_n": 0, "avg_pct": None,
            "concerns": 0, "missing": 0}
    assert ew(base) == []                                   # no records, no verdict
    assert ew({**base, "att_total": 1, "att_absent": 1}) == []   # one day is not a pattern
    w = ew({**base, "att_total": 20, "att_present": 9, "att_absent": 11})
    assert w[0]["warning_type"] == "dropout_risk" and w[0]["severity"] == "critical"
    assert ew({**base, "marks_n": 2, "avg_pct": 10}) == []   # fewer than three marks
    assert ew({**base, "marks_n": 3, "avg_pct": 35})[0]["severity"] == "high"
    assert ew({**base, "concerns": 5})[0]["warning_type"] == "emotional_stress"
    assert ew({**base, "missing": 3})[0]["warning_type"] == "engagement_drop"
