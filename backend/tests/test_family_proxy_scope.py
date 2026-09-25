# -*- coding: utf-8 -*-
"""
Parents and students, through the data proxy, see their own children only.

The proxy confined a caller to their school and nothing more: a parent could
read every child's marks, fees and health records, every parent's phone, the
staff's payroll and the admission leads, and write to most of it. These tests
hold the family rules in app/utils/family_scope.py as the proxy applies them.
"""
import asyncio
import os
import uuid

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import vps_db as v  # noqa: E402
from app.utils import family_scope as fs  # noqa: E402

SCHOOL = str(uuid.uuid4())
CHILD = str(uuid.uuid4())
OTHER_CHILD = str(uuid.uuid4())

COLUMNS = {
    "students": ["id", "school_id", "first_name", "profile_id"],
    "student_marks": ["id", "school_id", "student_id", "marks"],
    "fee_invoices": ["id", "school_id", "student_id", "status"],
    "hr_salary_records": ["id", "school_id", "user_id", "net_salary"],
    "crm_leads": ["id", "school_id", "full_name", "phone"],
    "academic_classes": ["id", "school_id", "name"],
    "notices": ["id", "school_id", "audience", "title"],
    "complaints": ["id", "school_id", "student_id", "sender_user_id", "status"],
    "support_messages": ["id", "school_id", "conversation_id", "sender_user_id", "content"],
    "assignment_submissions": ["id", "school_id", "student_id", "content"],
    "user_roles": ["id", "school_id", "user_id", "role"],
}


class Result:
    def __init__(self, rows=None, scalar=None):
        self.rows = rows or []
        self._scalar = scalar

    def fetchall(self):
        return self.rows

    def scalar(self):
        return self._scalar

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeDB:
    def __init__(self, check_passes=True):
        self.sql = []
        self.check_passes = check_passes

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        self.sql.append((sql, dict(params or {})))
        if "information_schema.columns" in sql:
            return Result([(c, "uuid" if c.endswith("id") else "text") for c in COLUMNS[params["table"]]])
        if sql.startswith("SELECT (") or sql.startswith("SELECT EXISTS") or sql.startswith("SELECT CAST"):
            return Result(scalar=self.check_passes)
        return Result()

    async def flush(self):
        pass

    async def commit(self):
        pass


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = SCHOOL


@pytest.fixture(autouse=True)
def _patch(monkeypatch):
    async def allowed(user, db):
        return None if set(user.roles) - {"parent", "student"} else [CHILD]

    async def quiet(*a, **k):
        return None
    monkeypatch.setattr(v, "get_allowed_student_ids", allowed)
    monkeypatch.setattr(v, "broadcast_mutation", quiet)


def run(table, roles, action="select", payload=None, filters=None, db=None, user=None):
    db = db or FakeDB()
    q = v.QueryPayload(table=table, action=action, payload=payload, filters=filters or [])
    out = asyncio.run(v.execute_query(q, user or User(roles), db))
    return db, out


def last(db, prefix):
    return next(s for s, _ in reversed(db.sql) if s.lstrip().startswith(prefix))


def test_a_parent_reads_only_their_own_childs_marks_and_fees():
    for table in ("student_marks", "fee_invoices"):
        db, _ = run(table, ["parent"])
        sql = last(db, "SELECT")
        assert "student_id = ANY(CAST(:__kids AS uuid[]))" in sql, table
        params = db.sql[-1][1]
        assert [str(k) for k in params["__kids"]] == [CHILD]


def test_a_parent_reads_only_their_own_child_from_students():
    db, _ = run("students", ["parent"])
    assert "id = ANY(CAST(:__kids AS uuid[]))" in last(db, "SELECT")


@pytest.mark.parametrize("table", ["hr_salary_records", "crm_leads"])
@pytest.mark.parametrize("roles", [["parent"], ["student"], ["parent", "student"]])
def test_families_cannot_read_staff_records(table, roles):
    with pytest.raises(HTTPException) as err:
        run(table, roles)
    assert err.value.status_code == 403


def test_the_schools_structure_stays_readable():
    db, _ = run("academic_classes", ["student"])
    assert "__kids" not in last(db, "SELECT")


def test_families_see_only_notices_meant_for_them():
    db, _ = run("notices", ["parent"])
    assert "audience = ANY(CAST(:__aud AS text[]))" in last(db, "SELECT")
    assert db.sql[-1][1]["__aud"] == ["all", "parents"]


def test_staff_keep_the_whole_school():
    for roles in (["teacher"], ["principal"], ["teacher", "parent"]):
        db, _ = run("student_marks", roles)
        assert "__kids" not in last(db, "SELECT"), roles
    db, _ = run("hr_salary_records", ["principal"])


def test_a_family_cannot_write_staff_tables():
    with pytest.raises(HTTPException) as err:
        run("student_marks", ["parent"], action="update", payload={"marks": 100},
            filters=[v.QueryFilter(method="eq", args=["id", str(uuid.uuid4())])])
    assert err.value.status_code == 403


def test_a_submission_is_only_for_ones_own_child():
    with pytest.raises(HTTPException) as err:
        run("assignment_submissions", ["student"], action="insert",
            payload={"student_id": OTHER_CHILD, "content": "x"})
    assert err.value.status_code == 403
    db, out = run("assignment_submissions", ["student"], action="insert",
                  payload={"student_id": CHILD, "content": "x"})
    assert out["error"] is None


def test_the_sender_of_a_complaint_is_the_caller():
    me = User(["parent"])
    db, _ = run("complaints", ["parent"], action="insert", user=me,
                payload={"student_id": CHILD, "sender_user_id": str(uuid.uuid4()), "status": "open"})
    _, params = next((s, p) for s, p in db.sql if s.startswith("INSERT"))
    assert str(params["sender_user_id_0"]) == str(me.id)


def test_a_reply_goes_only_to_a_conversation_one_is_part_of():
    conv = str(uuid.uuid4())
    with pytest.raises(HTTPException):
        run("support_messages", ["parent"], action="insert",
            payload={"conversation_id": conv, "content": "hi"}, db=FakeDB(check_passes=False))
    db, out = run("support_messages", ["parent"], action="insert",
                  payload={"conversation_id": conv, "content": "hi"}, db=FakeDB(check_passes=True))
    check_sql, check_params = next((s, p) for s, p in db.sql if "__v_conversation_id" in s)
    assert check_params["__v_conversation_id"] == conv and out["error"] is None


def test_an_update_only_touches_the_familys_own_rows():
    db, _ = run("complaints", ["parent"], action="update", payload={"status": "resolved"},
                filters=[v.QueryFilter(method="eq", args=["id", str(uuid.uuid4())])])
    assert "sender_user_id = :__me" in last(db, "UPDATE")


def test_families_call_only_their_own_database_functions(monkeypatch):
    class DB:
        async def execute(self, stmt, params=None):
            self.sql = str(stmt)
            return Result()
    with pytest.raises(HTTPException) as err:
        asyncio.run(v.execute_rpc(v.RpcPayload(fn="get_at_risk_students", params={"_school_id": SCHOOL}),
                                  User(["parent"]), DB()))
    assert err.value.status_code == 403
    db = DB()
    asyncio.run(v.execute_rpc(v.RpcPayload(fn="get_school_user_directory", params={"_school_id": SCHOOL}),
                              User(["parent"]), db))
    assert '"get_school_staff_directory"' in db.sql


def test_every_family_read_rule_names_real_columns():
    """Each rule is SQL run on production; its tables and columns must exist."""
    import io
    import re
    schema = {}
    for line in io.open("../scripts/db/schema_columns.txt", encoding="utf-8"):
        t, cs = line.strip().split("|", 1)
        schema[t] = set(cs.split(","))
    for table in list(fs.READ_RULES) + list(fs.WRITE_RULES) + list(fs.SCHOOL_WIDE):
        assert table in schema, table
    for table, rule in fs.READ_RULES.items():
        for col in re.findall(r"^\(?(\w+) (?:=|IN)", rule):
            assert col in schema[table], (table, col)


def test_live_changes_reach_a_family_only_when_the_rows_are_theirs():
    from app.websocket_manager import ConnectionManager

    sent = {}

    class M(ConnectionManager):
        async def send_to_user(self, user_id, data):
            sent[user_id] = data

    m = M()
    m._rooms[f"school:{SCHOOL}"] = {"staff", "parent"}
    m.set_family_view("parent", SCHOOL, {"kids": {CHILD}, "audiences": ["all", "parents"]})
    rows = [{"id": "1", "student_id": CHILD, "marks": 70}, {"id": "2", "student_id": OTHER_CHILD, "marks": 40}]
    asyncio.run(m.broadcast_change(SCHOOL, {"event_name": "postgres_changes", "table": "student_marks",
                                            "action": "insert", "data": rows}))
    assert len(sent["staff"]["data"]["data"]) == 2
    assert sent["parent"]["data"]["data"] == [rows[0]]

    asyncio.run(m.broadcast_change(SCHOOL, {"event_name": "postgres_changes", "table": "hr_salary_records",
                                            "action": "update", "data": [{"user_id": "x", "net": 1}]}))
    assert sent["parent"]["data"] == {"event_name": "table_changed", "school_id": SCHOOL,
                                      "table": "hr_salary_records", "action": "update"}


def test_a_familys_live_view_is_forgotten_when_they_leave():
    from app.websocket_manager import ConnectionManager

    m = ConnectionManager()
    m.set_family_view("p", SCHOOL, {"kids": set(), "audiences": ["all"]})

    class WS:
        pass
    ws = WS()
    m._user_connections["p"].append(ws)
    asyncio.run(m.disconnect(ws, "p", []))
    assert not m._family_views
