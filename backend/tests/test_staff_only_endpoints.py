# -*- coding: utf-8 -*-
"""
School-wide records answer only to the school's own staff.

Found in a sweep of endpoints that never looked at the caller: any account
could list every payment, read the school's financial summary, approve an
appraisal (raising a salary, their own included), list every child's bus
route, and read any school's dashboards and salary budget by naming it.
The salary budget also served invented salaries, or stale figures from a
file shipped with the code, whenever the database failed.
"""
import asyncio
import io
import os
import uuid

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import appraisals, finance, misc, transport  # noqa: E402

SCHOOL = uuid.uuid4()


class Result:
    rowcount = 0

    def first(self):
        return None

    def fetchall(self):
        return []

    def fetchone(self):
        return None

    def scalar_one_or_none(self):
        return None


class DB:
    async def execute(self, *a, **k):
        return Result()

    async def rollback(self):
        pass


class FailingDB(DB):
    async def execute(self, *a, **k):
        raise RuntimeError("database down")


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = SCHOOL
        self.campus_id = None


class Req:
    headers = {}


def refused(coro, code=403):
    with pytest.raises(HTTPException) as err:
        asyncio.run(coro)
    assert err.value.status_code == code


@pytest.mark.parametrize("roles", [["parent"], ["teacher"]])
def test_salary_budgets_are_for_finance_and_hr(roles):
    refused(finance.get_salary_records(User(roles), DB(), None))
    refused(finance.get_budget_targets(User(roles), DB(), None, None))


def test_no_one_reads_another_schools_salaries():
    refused(finance.get_salary_records(User(["accountant"]), DB(), uuid.uuid4()))
    refused(finance.create_or_update_budget_target(
        {"school_id": str(uuid.uuid4()), "fiscal_year": 2026, "budget_amount": 1}, User(["accountant"]), DB()))


def test_a_database_failure_is_reported_not_papered_over():
    refused(finance.get_salary_records(User(["accountant"]), FailingDB(), None), code=503)
    refused(finance.get_budget_targets(User(["accountant"]), FailingDB(), None, None), code=503)
    src = io.open("app/routers/finance.py", encoding="utf-8").read()
    assert "budget_store" not in src and "sal-1" not in src
    assert not os.path.exists("app/budget_store.json")


def test_deleting_a_budget_target_is_confined_to_the_school():
    refused(finance.delete_budget_target(uuid.uuid4(), User(["accountant"]), DB()), code=404)


def test_the_financial_summary_is_for_finance_staff():
    refused(finance.finance_summary(User(["teacher"]), DB(), None, None, None))


@pytest.mark.parametrize("roles", [["teacher"], ["parent"], ["accountant"]])
def test_only_hr_and_administration_review_appraisals(roles):
    refused(appraisals.review_appraisal(uuid.uuid4(), "approved", None, 10.0, User(roles), DB()))


def test_families_do_not_list_every_childs_bus():
    refused(transport.list_assignments(User(["parent"]), DB()))


def test_dashboards_are_for_the_schools_own_staff():
    refused(misc.resolve_effective_school_id(None, Req(), User(["parent"]), DB()))
    refused(misc.resolve_effective_school_id(str(uuid.uuid4()), Req(), User(["principal"]), DB()))
    own = asyncio.run(misc.resolve_effective_school_id(str(SCHOOL), Req(), User(["principal"]), DB()))
    assert str(own) == str(SCHOOL)
