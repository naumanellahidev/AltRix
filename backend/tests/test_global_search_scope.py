# -*- coding: utf-8 -*-
"""
The command palette's search answers each person with what they may see.

It let any signed-in account, a parent or a student included, search the
whole school: every student, every parent's phone number and email, staff
contacts and admission leads. It also read a table that does not exist
(transport_vehicles) and inventory columns that do not exist, so it failed
on every call, and the palette fell back to searching the school directly.
"""
import asyncio
import io
import os
import re
import uuid
from contextlib import asynccontextmanager

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import search as s  # noqa: E402

SCHOOL = str(uuid.uuid4())
CHILD = str(uuid.uuid4())


class Rows:
    def fetchall(self):
        return []


class FakeDB:
    def __init__(self):
        self.sql = []

    @asynccontextmanager
    async def begin_nested(self):
        yield

    async def execute(self, stmt, params=None):
        self.sql.append((str(stmt), dict(params or {})))
        return Rows()


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = SCHOOL


def search(roles, monkeypatch):
    async def allowed(user, db):
        return [CHILD]
    monkeypatch.setattr(s, "get_allowed_student_ids", allowed)
    db = FakeDB()
    asyncio.run(s.global_search(User(roles), db, q="a", limit=30))
    return db.sql


def tables(sql):
    return {re.search(r"FROM (\w+)", q).group(1) for q, _ in sql}


def test_a_parent_finds_only_their_own_children_and_the_catalogue(monkeypatch):
    sql = search(["parent"], monkeypatch)
    assert tables(sql) == {"students", "academic_classes", "library_books"}
    students = [(q, p) for q, p in sql if "FROM students" in q]
    assert len(students) == 1 and "ANY(:ids)" in students[0][0] and students[0][1]["ids"] == [CHILD]
    assert all("parent_phone" not in q for q, _ in sql)


def test_a_student_sees_no_contacts_either(monkeypatch):
    assert tables(search(["student"], monkeypatch)) == {"students", "academic_classes", "library_books"}


def test_a_teacher_searches_the_school_but_not_the_leads(monkeypatch):
    t = tables(search(["teacher"], monkeypatch))
    assert {"students", "user_roles", "hr_staff_directory", "vehicles", "inventory_items"} <= t
    assert "crm_leads" not in t


def test_the_crm_roles_search_the_leads(monkeypatch):
    for role in ("principal", "marketing_staff", "school_owner"):
        assert "crm_leads" in tables(search([role], monkeypatch)), role


def test_every_statement_is_confined_to_the_school_and_names_real_tables(monkeypatch):
    sql = search(["principal"], monkeypatch)
    for q, p in sql:
        assert "school_id = CAST(:sid AS uuid)" in q and p["sid"] == SCHOOL
    assert "transport_vehicles" not in io.open("app/routers/search.py", encoding="utf-8").read()


def test_the_platform_owner_and_former_staff_are_not_listed(monkeypatch):
    staff = next(q for q, _ in search(["principal"], monkeypatch) if "FROM user_roles" in q)
    assert "platform_super_admins" in staff and "end_date" in staff


def test_the_palette_does_not_search_the_school_itself_when_the_service_answers():
    src = io.open("../src/components/global/GlobalCommandPalette.tsx", encoding="utf-8").read()
    assert "if (!schoolId || isFamily)" in src
    assert "reachable(item.href)" in src
