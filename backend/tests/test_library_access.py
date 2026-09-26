# -*- coding: utf-8 -*-
"""
The library: staff run it; a family sees its own loans and reserves for its
own child; ids are real; fines are exact.

No endpoint checked the caller (a parent could add, change or delete books,
and issue or return them); every loan and fine in the school was listed to
any account; any text was turned into a made-up student id; fines were
floats. The student and parent screens showed invented loans.
"""
import asyncio
import io
import os
import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.routers import library as lib  # noqa: E402


class User:
    def __init__(self, roles):
        self.id = uuid.uuid4()
        self.roles = roles
        self.is_super_admin = False
        self.school_id = str(uuid.uuid4())
        self.campus_id = None


@pytest.mark.parametrize("roles", [["parent"], ["student"]])
def test_families_cannot_run_the_library(roles):
    with pytest.raises(HTTPException) as err:
        lib._require_staff(User(roles))
    assert err.value.status_code == 403
    lib._require_staff(User(["teacher"]))


def test_text_is_not_turned_into_a_student_id():
    with pytest.raises(HTTPException):
        lib._strict_uuid("Ali Khan", "student_id")


def test_fines_are_exact():
    assert lib._fine(3, Decimal("20.10")) == Decimal("60.30")
    assert lib._fine(7, 0.1) == Decimal("0.70")


def test_every_write_checks_the_caller_and_lists_are_family_scoped():
    src = io.open("app/routers/library.py", encoding="utf-8").read()
    assert src.count("_require_staff(current_user)") >= 5
    assert src.count("await _family_student_ids(current_user, db)") >= 3
    assert "_parse_or_generate_uuid" not in src and "ALTER TABLE" not in src


def test_the_family_screens_read_the_library_not_invented_loans():
    for f in ("../src/pages/tenant/student-modules/StudentLibraryModule.tsx",
              "../src/pages/tenant/parent-modules/ParentLibraryModule.tsx"):
        s = io.open(f, encoding="utf-8").read()
        assert "Halliday" not in s and "FamilyLibrary" in s
