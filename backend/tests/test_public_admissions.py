# -*- coding: utf-8 -*-
"""
The public admissions portal.

Neither half had ever worked. Both were written against fields the model does
not have — `applicant_name`, `guardian_name`, `guardian_phone`,
`guardian_email`, `target_class` and `application_number` — so constructing
the row raised a TypeError before it reached the database, and the status
lookup raised on `AdmissionApplication.application_number`. An applicant got a
500 whether they applied or checked. It also wrote `status="pending"`, which
is not one of that column's enum values.
"""
import ast
import io

import pytest

from app.models.admissions import AdmissionApplication
from app.routers.public_admissions import (
    NEW_APPLICATION_STATUS,
    PUBLIC_STATUS_LABELS,
    _split_name,
    _tracking_code,
)

SRC = io.open("app/routers/public_admissions.py", encoding="utf-8").read()
TREE = ast.parse(SRC)

MODEL_FIELDS = {
    name
    for name in dir(AdmissionApplication)
    if not name.startswith("_")
}


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


def test_every_field_written_to_the_model_exists_on_it():
    apply_body = next(
        node
        for node in ast.walk(TREE)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "AdmissionApplication"
    )
    written = {kw.arg for kw in apply_body.keywords if kw.arg}
    missing = written - MODEL_FIELDS
    assert not missing, f"not on the model: {sorted(missing)}"


def test_the_fields_that_never_existed_are_gone():
    for ghost in ("applicant_name=", "guardian_name=", "guardian_phone=", "target_class=", "application_number"):
        assert ghost not in fn("submit_public_admission_application"), ghost


def test_a_new_application_uses_a_status_the_enum_holds():
    assert NEW_APPLICATION_STATUS == "submitted"
    assert "pending" not in PUBLIC_STATUS_LABELS


def test_tracking_is_by_the_column_that_exists():
    assert "AdmissionApplication.registration_number" in fn("check_public_admission_status")


@pytest.mark.parametrize(
    "full,expected",
    [
        ("Ayesha Khan", ("Ayesha", "Khan")),
        ("Ali", ("Ali", "")),
        ("  Syed Ali Raza  ", ("Syed Ali", "Raza")),
        ("", ("Applicant", "")),
    ],
)
def test_one_line_of_name_becomes_two_columns(full, expected):
    assert _split_name(full) == expected


def test_a_tracking_code_is_long_enough_to_be_unique_and_readable():
    codes = {_tracking_code() for _ in range(500)}
    assert len(codes) > 480  # collisions are rare, and handled besides
    assert all(code.startswith("ADM-") for code in codes)


def test_the_code_is_checked_for_collisions_before_it_is_issued():
    body = fn("submit_public_admission_application")
    assert "registration_number = :code" in body
    assert "503" in body or "HTTP_503_SERVICE_UNAVAILABLE" in body


def test_an_unknown_class_name_is_recorded_rather_than_dropped():
    body = fn("submit_public_admission_application")
    assert "no class of that name exists" in body
    assert "notes" in body


def test_the_status_lookup_tells_an_applicant_only_about_themselves():
    body = fn("check_public_admission_status")
    for private in ("decision_notes", "parent_phone", "parent_email", "reviewed_by"):
        assert private not in body, private
