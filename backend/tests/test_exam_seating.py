# -*- coding: utf-8 -*-
"""
Exam seating: real students, real halls, no invented plans.

The screen invented rooms, plans and "Grade 9-A Candidate #3" students and
posted them to an endpoint that did not exist; generation matched a class id
against a section id; the invigilator endpoint had no school check at all;
and parents and students were all shown the same made-up seat.
"""
import ast
import io
from uuid import uuid4

from app.routers.exams import allocate_seats, seat_label

SRC = io.open("app/routers/exams.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    return ast.unparse(node)


def test_seat_labels():
    assert seat_label(0, 0) == "A-1"
    assert seat_label(1, 2) == "B-3"
    assert seat_label(26, 0) == "AA-1"


def test_two_sections_alternate_like_a_chessboard():
    a = [uuid4() for _ in range(6)]
    b = [uuid4() for _ in range(6)]
    room = uuid4()
    seats = allocate_seats([a, b], [(room, 3, 4)])
    assert len(seats) == 12
    section = {s: "a" for s in a} | {s: "b" for s in b}
    grid = {(r, c): section[sid] for _, r, c, sid in seats}
    for (r, c), sec in grid.items():
        for dr, dc in ((0, 1), (1, 0)):
            if (r + dr, c + dc) in grid:
                assert grid[(r + dr, c + dc)] != sec


def test_every_student_seated_once_and_uneven_sections_fill_in():
    a = [uuid4() for _ in range(9)]
    b = [uuid4() for _ in range(2)]
    seats = allocate_seats([a, b], [(uuid4(), 2, 3), (uuid4(), 2, 3)])
    ids = [s[3] for s in seats]
    assert sorted(map(str, ids)) == sorted(map(str, a + b))
    assert len(set((room, r, c) for room, r, c, _ in seats)) == len(seats)


def test_generation_uses_enrolments_in_the_callers_school():
    body = fn("generate_seating_arrangement")
    assert "student_enrollments" in body and "end_date IS NULL" in body
    assert "Student.class_id" not in body
    assert "school_id" in body


def test_writes_are_for_academic_staff_and_scoped_to_the_school():
    for name in (
        "create_exam_room", "delete_exam_room", "generate_seating_arrangement",
        "delete_seating_plan", "assign_invigilator", "remove_invigilator",
    ):
        assert "_require_exam_staff" in fn(name), name
    assert "ExamSeatingPlan.school_id == current_user.school_id" in fn("assign_invigilator")


def test_families_see_only_their_own_childrens_seats():
    body = fn("my_seating")
    assert "get_allowed_student_ids" in body


def test_teachers_can_read_plans_but_not_change_them():
    body = fn("list_seating_plans")
    assert "'teacher'" in body and "ACADEMIC_GOV" in body


def test_visitor_registration_does_not_claim_messages_it_never_sent():
    src = io.open("app/routers/visitors.py", encoding="utf-8").read()
    assert "SMS Alert dispatched" not in src
    assert "WhatsApp Message sent" not in src
    assert '"status": "queued"' in src
