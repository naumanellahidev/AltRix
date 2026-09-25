# -*- coding: utf-8 -*-
"""
The salary budget: finance and HR staff, their own school, honest failures.

It answered any account for any school named in the URL, deleted any target
by id, and when the database failed it served a JSON file shipped with the
code (older figures than the database) or three invented salaries, and
reported unsaved changes as saved.
"""
import asyncio
import io
import os
import uuid

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import finance as f  # noqa: E402

SCHOOL = uuid.uuid4()


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = SCHOOL
        self.campus_id = None


class FailingDB:
    async def execute(self, *a, **k):
        raise RuntimeError("connection lost")

    async def rollback(self):
        pass


@pytest.mark.parametrize("roles", [["parent"], ["student"], ["teacher"]])
def test_only_finance_and_hr_see_salaries(roles):
    with pytest.raises(HTTPException) as err:
        f._salary_school(User(roles), None)
    assert err.value.status_code == 403


def test_another_schools_budget_is_refused():
    with pytest.raises(HTTPException) as err:
        f._salary_school(User(["accountant"]), uuid.uuid4())
    assert err.value.status_code == 403
    assert f._salary_school(User(["hr_manager"]), SCHOOL) == SCHOOL


def test_a_database_failure_is_reported_not_papered_over():
    with pytest.raises(HTTPException) as err:
        asyncio.run(f.get_salary_records(User(["accountant"]), FailingDB(), None))
    assert err.value.status_code == 503
    with pytest.raises(HTTPException) as err:
        asyncio.run(f.create_or_update_budget_target({"fiscal_year": 2026, "budget_amount": 100},
                                                     User(["accountant"]), FailingDB()))
    assert err.value.status_code == 503


def test_no_local_store_or_invented_salaries_remain():
    src = io.open("app/routers/finance.py", encoding="utf-8").read()
    assert "budget_store" not in src and "sal-1" not in src
    assert not os.path.exists("app/budget_store.json")
