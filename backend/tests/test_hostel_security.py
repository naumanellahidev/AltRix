# -*- coding: utf-8 -*-
"""
Hostel records belong to one school and are changed only by its staff.

Allocation looked a room up by id alone, so a user of any school could put a
student into another school's room; any signed-in user — a parent, a student —
could create rooms, allocate, mark night attendance and edit the mess menu;
and callers with no school wrote under an all-zero "nil" school id.
"""
import ast
import io

SRC = io.open("app/routers/hostel.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    return ast.unparse(next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name))


def test_no_nil_school_fallback():
    assert "00000000-0000-0000-0000-000000000000" not in SRC


def test_writes_are_staff_only():
    for name in ("create_hostel_room", "allocate_student_to_room", "mark_hostel_night_attendance", "update_hostel_mess_menu"):
        assert "_require_staff(current_user)" in fn(name), name


def test_allocation_stays_inside_the_school_and_locks_the_room():
    body = fn("allocate_student_to_room")
    assert "HostelRoom.school_id == school_id" in body
    assert "with_for_update" in body
    assert "_require_student_in_school" in body
    assert "already has a hostel room" in body


def test_attendance_is_for_the_schools_own_students():
    assert "_require_student_in_school" in fn("mark_hostel_night_attendance")
