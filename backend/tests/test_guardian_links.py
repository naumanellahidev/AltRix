# -*- coding: utf-8 -*-
"""
A guardian link gives an account a child's records, so only the school's
administration makes one, and only for its own students.

Any signed-in account could link itself to any student in any school, then
read that child's marks, fees and health through every family screen. The
per-student guardian routes also read, changed and deleted guardians of any
school's students by id, and the school-wide list gave any account every
family's phone number.
"""
import asyncio
import os
import uuid

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import students as st  # noqa: E402

SCHOOL = uuid.uuid4()


class Result:
    def __init__(self, found):
        self.found = found

    def first(self):
        return (1,) if self.found else None

    def scalars(self):
        return self

    def all(self):
        return []

    def scalar_one_or_none(self):
        return None


class DB:
    def __init__(self, student_in_school=True):
        self.found = student_in_school

    async def execute(self, stmt, params=None):
        return Result(self.found)


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = SCHOOL


def run(coro):
    return asyncio.run(coro)


@pytest.mark.parametrize("roles", [["parent"], ["student"], ["teacher"], ["accountant"]])
def test_only_administration_links_a_parent_to_a_child(roles):
    body = st.GuardianCreateAll(student_id=uuid.uuid4(), full_name="X", user_id=uuid.uuid4())
    with pytest.raises(HTTPException) as err:
        run(st.create_school_guardian(body, User(roles), DB()))
    assert err.value.status_code == 403
    with pytest.raises(HTTPException) as err:
        run(st.add_guardian(uuid.uuid4(), st.GuardianCreate(full_name="X"), User(roles), DB()))
    assert err.value.status_code == 403


def test_a_link_is_only_to_the_schools_own_student():
    body = st.GuardianCreateAll(student_id=uuid.uuid4(), full_name="X")
    with pytest.raises(HTTPException) as err:
        run(st.create_school_guardian(body, User(["principal"]), DB(student_in_school=False)))
    assert err.value.status_code == 404


def test_families_cannot_list_every_familys_contacts():
    with pytest.raises(HTTPException) as err:
        run(st.get_all_guardians(User(["parent"]), DB()))
    assert err.value.status_code == 403


def test_another_schools_students_guardians_are_not_found():
    with pytest.raises(HTTPException) as err:
        run(st.delete_guardian(uuid.uuid4(), uuid.uuid4(), User(["principal"]), DB(student_in_school=False)))
    assert err.value.status_code == 404


def test_a_missing_guardian_is_reported_as_missing_not_as_a_database_failure():
    with pytest.raises(HTTPException) as err:
        run(st.delete_school_guardian(uuid.uuid4(), User(["principal"]), DB()))
    assert err.value.status_code == 404


def test_the_guardian_schema_matches_the_table():
    g = st.GuardianCreate(first_name="Ayesha", last_name="Khan", phone="0300")
    assert g.stored_fields() == {"full_name": "Ayesha Khan", "phone": "0300"}
    assert set(st.GuardianOut.model_fields) <= {
        "id", "school_id", "student_id", "user_id", "full_name", "relationship", "phone", "email",
        "is_primary", "is_emergency_contact", "created_at"}
