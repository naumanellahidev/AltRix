# -*- coding: utf-8 -*-
"""
The document vault and certificate engine.

Pins the fixes: families see only their own children's documents; only
academic staff issue certificates, only for their own school's students;
numbers are sequential rather than random; the screen's endpoints exist.
"""
import ast
import io

from app.main import app
from app.routers.documents import CERTIFICATE_ISSUERS, CERTIFICATE_TYPES, DOCUMENT_STAFF

SRC = io.open("app/routers/documents.py", encoding="utf-8").read()
TREE = ast.parse(SRC)


def fn(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    return ast.unparse(node)


def test_families_are_limited_to_their_own_children():
    for name in ("list_documents", "list_student_documents", "list_certificates", "certificate_detail"):
        assert "_family_scope" in fn(name), name


def test_only_staff_write_to_the_vault_and_issue_certificates():
    assert "_require(current_user, DOCUMENT_STAFF" in fn("upload_student_document")
    assert "_require(current_user, DOCUMENT_STAFF" in fn("delete_student_document")
    assert "_require(current_user, CERTIFICATE_ISSUERS" in fn("generate_certificate")
    assert "_require(current_user, CERTIFICATE_ISSUERS" in fn("revoke_certificate")
    assert "parent" not in DOCUMENT_STAFF and "student" not in CERTIFICATE_ISSUERS


def test_certificates_are_only_for_the_schools_own_students():
    assert "_student_in_school" in fn("generate_certificate")
    assert "_student_in_school" in fn("upload_student_document")


def test_certificate_numbers_are_sequential_not_random():
    assert "randbelow" not in SRC
    assert "count + 1" in fn("_next_certificate_number")
    assert "IntegrityError" in fn("generate_certificate")


def test_every_endpoint_the_screen_calls_exists():
    routes = {(m, r.path) for r in app.routes for m in (getattr(r, "methods", None) or [])}
    for method, path in [
        ("GET", "/api/documents/student/{student_id}"),
        ("POST", "/api/documents/upload"),
        ("DELETE", "/api/documents/{document_id}"),
        ("GET", "/api/documents/alerts"),
        ("GET", "/api/documents/certificates/types"),
        ("GET", "/api/documents/certificates"),
        ("POST", "/api/documents/certificates/generate"),
        ("GET", "/api/documents/certificates/{certificate_id}"),
        ("POST", "/api/documents/certificates/{certificate_id}/revoke"),
        ("GET", "/api/documents/certificates/verify/{qr_code}"),
    ]:
        assert (method, path) in routes or (method, path.replace("/api", "")) in routes, (method, path)


def test_every_certificate_type_has_a_prefix_and_title():
    for spec in CERTIFICATE_TYPES.values():
        assert spec["prefix"] and spec["title"]
