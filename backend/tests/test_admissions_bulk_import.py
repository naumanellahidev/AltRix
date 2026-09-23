# -*- coding: utf-8 -*-
"""
Bringing a paper register in, and the class the office chose.

Two things this guards.

A school joining AltRix hands the app four hundred children at once. If one
bad line costs it the other three hundred and ninety-nine, or if a row is
written from whatever keys the browser happened to send, the import is worse
than typing them in by hand.

And `convert_to_student` used to pass `section_id=` to the Student
constructor. `Student.section_id` is a read-only view over the enrolments
whose setter does nothing, so the section the office picked was discarded in
silence and the child was created belonging to no class — absent from every
register, report card run and seating plan. Production had a student in
exactly that state.
"""
import ast
import io
import re

import pytest

from app.models.people import Guardian, Student, StudentEnrollment
from app.routers.admissions import _STUDENT_FIELDS, BulkImportRequest, BulkImportRow

SRC = io.open("app/routers/admissions.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    node = next(
        n for n in ast.walk(TREE)
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == name
    )
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


def columns(model) -> set:
    return {c.key for c in model.__table__.columns} | {
        attr.key for attr in model.__mapper__.attrs
    }


# --- The fields a row may set ------------------------------------------------

def test_every_importable_field_is_a_real_student_column():
    # A field in the allowlist that the model does not have would raise on the
    # first row of every import.
    missing = _STUDENT_FIELDS - columns(Student)
    assert not missing, f"not on Student: {sorted(missing)}"


def test_the_allowlist_is_what_limits_what_a_row_can_write():
    body = fn("bulk_import_students")
    # The student is built from the allowlist, never from the row's own keys.
    assert "for f in _STUDENT_FIELDS" in body
    assert "**values" not in body, "a row's keys must not be splatted onto the model"


@pytest.mark.parametrize("sensitive", ["school_id", "id", "profile_id", "user_id", "status"])
def test_a_row_cannot_reach_the_columns_that_decide_ownership(sensitive):
    # school_id comes from the caller's token, not from the sheet.
    assert sensitive not in _STUDENT_FIELDS


def test_the_school_comes_from_the_token():
    body = fn("bulk_import_students")
    assert "school_id = current_user.school_id" in body
    assert "school_id=school_id" in body


# --- One bad line must not cost the school the rest ---------------------------

def test_each_row_is_written_in_its_own_savepoint():
    body = fn("bulk_import_students")
    assert "db.begin_nested()" in body, "a failed row must not roll back the ones before it"


def test_a_failed_row_is_reported_rather_than_swallowed():
    body = fn("bulk_import_students")
    assert "except Exception as exc" in body
    assert "reason=str(exc)" in body
    # And it must not be counted as created.
    assert "ok=False" in body


def test_a_dry_run_writes_nothing_and_claims_nothing():
    body = fn("bulk_import_students")
    assert "if body.dry_run" in body
    assert "await db.rollback()" in body
    assert "created=0 if body.dry_run else created" in body


# --- The section the office chose --------------------------------------------

def test_a_section_from_the_browser_is_checked_against_this_school():
    body = fn("bulk_import_students")
    assert "ClassSection.school_id == school_id" in body
    assert "not in allowed" in body


def test_importing_a_row_creates_the_enrolment():
    body = fn("bulk_import_students")
    assert "StudentEnrollment(" in body, "a student with no enrolment is on no register"


def test_converting_an_application_creates_the_enrolment():
    body = fn("convert_to_student")
    assert "StudentEnrollment(" in body


def test_the_setter_that_silently_dropped_the_section_is_no_longer_used():
    # Student.section_id is a property whose setter is a no-op, so passing it
    # to the constructor discarded the choice without an error.
    # Matched with a boundary: "class_section_id=app.applying_for_section_id"
    # is the correct enrolment line and contains the bad one as a substring.
    assert not re.search(r"(?<![_\w])section_id\s*=\s*app\.", SRC)
    student = Student(school_id=None, first_name="x")
    student.section_id = "anything"
    assert student.section_id is None, "the setter is still a no-op; do not assign to it"


def test_enrolment_and_guardian_fields_exist_on_their_models():
    body = fn("bulk_import_students")
    for model, name in ((StudentEnrollment, "StudentEnrollment"), (Guardian, "Guardian")):
        call = next(
            node for node in ast.walk(ast.parse(body))
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) == name
        )
        written = {kw.arg for kw in call.keywords if kw.arg}
        missing = written - columns(model)
        assert not missing, f"{name} has no {sorted(missing)}"


# --- The request shape -------------------------------------------------------

def test_an_import_is_bounded():
    # An unbounded list is a way to hold a worker open for as long as you like.
    limits = BulkImportRequest.model_fields["rows"].metadata
    assert any(getattr(m, "max_length", None) == 2000 for m in limits)


def test_a_row_carries_the_line_it_came_from():
    row = BulkImportRow(line=7, values={"first_name": "Ayesha"})
    assert row.line == 7, "the office has to be told which line failed"


def test_a_row_without_a_first_name_is_refused_not_guessed():
    body = fn("bulk_import_students")
    # ast.unparse normalises quoting, so the text is what is checked.
    assert "No first name on this row" in body
