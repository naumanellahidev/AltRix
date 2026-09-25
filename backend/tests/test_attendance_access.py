# -*- coding: utf-8 -*-
"""
Taking and reading a register is for teachers and the administration.

None of these endpoints checked the caller: a parent or student could mark a
session, wipe it, or read any section's register and the school-wide report.
Staff attendance, with each check-in's location, could be read for any
school by naming it in the query, and anyone could mark any staff member.
"""
import asyncio
import os
import uuid

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import attendance as a  # noqa: E402

SCHOOL = uuid.uuid4()


class Result:
    def first(self):
        return None

    def scalar_one_or_none(self):
        return None

    def fetchall(self):
        return []


class DB:
    async def execute(self, *args, **kwargs):
        return Result()


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = SCHOOL


def refused(coro, code=403):
    with pytest.raises(HTTPException) as err:
        asyncio.run(coro)
    assert err.value.status_code == code


@pytest.mark.parametrize("roles", [["parent"], ["student"]])
def test_families_cannot_take_or_read_a_register(roles):
    u = User(roles)
    sid = uuid.uuid4()
    refused(a.save_attendance_entries(sid, [], u, DB()))
    refused(a.bulk_mark_attendance(sid, a.BulkAttendanceCreate(session_id=sid, entries=[]), u, DB()))
    refused(a.get_session_roster(sid, u, DB()))
    refused(a.get_staff_today(u, DB(), None, None))


def test_accountants_do_not_take_attendance():
    refused(a.save_attendance_entries(uuid.uuid4(), [], User(["accountant"]), DB()))


def test_a_session_from_another_school_is_not_found():
    refused(a.save_attendance_entries(uuid.uuid4(), [], User(["teacher"]), DB()), code=404)


def test_staff_attendance_is_only_for_ones_own_school():
    refused(a.get_staff_today(User(["principal"]), DB(), uuid.uuid4(), None))


def test_a_teacher_marks_only_their_own_staff_attendance():
    refused(a.mark_staff_attendance({"user_id": str(uuid.uuid4())}, User(["teacher"]), DB()))
