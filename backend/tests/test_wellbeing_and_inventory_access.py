# -*- coding: utf-8 -*-
"""
Health files and the store room: who may read, and who may change.

The wellbeing router let any signed-in account list every child's medical
file, and read another school's child by id. The inventory router let any
account, a student included, add items and move stock, in any school, by id.
These tests hold the new rules.
"""
import asyncio
import os
import uuid

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import inventory as inv  # noqa: E402
from app.routers import wellbeing as w  # noqa: E402

SCHOOL = str(uuid.uuid4())
MINE = str(uuid.uuid4())
OTHER = str(uuid.uuid4())


class Result:
    def __init__(self, rows):
        self.rows = rows
        self.rowcount = 1

    def mappings(self):
        return self

    def all(self):
        return self.rows

    def first(self):
        return self.rows[0] if self.rows else None

    def scalar(self):
        return None


class FakeDB:
    def __init__(self, guardians=None, survey_count=0):
        self.calls = []
        self.guardians = guardians or []
        self.survey_count = survey_count

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        self.calls.append((sql, dict(params or {})))
        if "SELECT DISTINCT s.id::text" in sql:
            return Result([(MINE,)])
        if "SELECT 1 FROM students" in sql:
            return Result([(1,)])
        if "SELECT DISTINCT g.user_id::text" in sql:
            return Result([(g,) for g in self.guardians])
        if "COUNT(*) AS responses" in sql:
            return Result([{"responses": self.survey_count, "average_mood_score": 7, "average_stress_level": 4}])
        return Result([{"id": uuid.uuid4()}])

    async def commit(self):
        pass


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = SCHOOL


def run(coro):
    return asyncio.run(coro)


def test_a_parent_sees_only_their_own_childs_health_file():
    db = FakeDB()
    run(w.list_medical_records(db, User(["parent"]), None))
    sql, params = db.calls[-1]
    assert "ANY(:ids)" in sql and params["ids"] == [MINE]


def test_a_parent_is_refused_another_childs_file():
    with pytest.raises(HTTPException) as err:
        run(w.list_medical_records(FakeDB(), User(["parent"]), uuid.UUID(OTHER)))
    assert err.value.status_code == 403


def test_staff_read_the_whole_school_but_only_the_school():
    db = FakeDB()
    run(w.list_medical_records(db, User(["teacher"]), None))
    sql, params = db.calls[-1]
    assert "school_id = CAST(:sid AS uuid)" in sql and params["sid"] == SCHOOL
    assert "ANY(:ids)" not in sql


@pytest.mark.parametrize("roles", [["parent"], ["student"], ["teacher"]])
def test_only_leadership_and_counsellors_write_a_health_file(roles):
    with pytest.raises(HTTPException) as err:
        run(w.create_or_update_medical_record(w.MedicalRecordIn(student_id=uuid.UUID(MINE), allergies="x"),
                                              FakeDB(), User(roles)))
    assert err.value.status_code == 403


def test_the_screens_field_names_are_saved():
    db = FakeDB()
    run(w.create_or_update_medical_record(
        w.MedicalRecordIn(student_id=uuid.UUID(MINE), conditions="Asthma", medications="Inhaler",
                          health_insurance_info="Policy 1"), db, User(["principal"])))
    sql, params = db.calls[-1]
    assert params["cc"] == "Asthma" and params["med"] == "Inhaler" and params["ins"] == "Policy 1"


def test_an_infirmary_visit_from_the_screen_is_accepted():
    body = w.InfirmaryVisitIn(student_id=uuid.UUID(MINE), reason="Headache", treatment_given="Rest")
    db = FakeDB()
    run(w.log_infirmary_visit(body, db, User(["teacher"])))
    sql, params = db.calls[-1]
    assert params["sym"] == "Headache" and params["tr"] == "Rest"
    assert params["nurse"] is None  # no invented "School Nurse"


def test_first_aid_says_whether_anyone_was_told():
    body = w.FirstAidIn(student_id=uuid.UUID(MINE), incident_description="Scraped knee", first_aid_given="Bandaged")
    none = run(w.log_first_aid_incident(body, FakeDB(guardians=[]), User(["teacher"])))
    assert "nobody was notified" in none["message"]
    told = run(w.log_first_aid_incident(body, FakeDB(guardians=[str(uuid.uuid4())]), User(["teacher"])))
    assert told["guardians_notified"] == 1


def test_no_check_ins_is_not_an_average_of_zero():
    assert run(w.survey_summary(FakeDB(survey_count=0), User(["principal"]), None, 30)) is None
    out = run(w.survey_summary(FakeDB(survey_count=3), User(["principal"]), None, 30))
    assert out["responses"] == 3 and out["average_mood_score"] == 7


@pytest.mark.parametrize("roles", [["parent"], ["student"]])
def test_families_cannot_touch_the_inventory(roles):
    with pytest.raises(HTTPException) as err:
        inv._require_staff(User(roles))
    assert err.value.status_code == 403


def test_stock_moves_only_within_the_school_and_are_recorded():
    import io
    body = io.open("app/routers/inventory.py", encoding="utf-8").read()
    assert "InventoryItem.id == payload.item_id, InventoryItem.school_id == school_id" in body
    assert '@router.put("/items/{item_id}"' in body
    screen = io.open("../src/pages/tenant/modules/InventoryModule.tsx", encoding="utf-8").read()
    assert '"/inventory/transactions"' in screen
