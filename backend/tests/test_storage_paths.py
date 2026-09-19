"""
Storage path-resolution tests.

Tenant isolation for files is imposed by deriving the school prefix from the
session, not by validating one the client sent. These tests pin that down, plus
traversal handling and the type allowlist that keeps stored XSS out.
"""
import os
from dataclasses import dataclass, field
from typing import List, Optional

import pytest
from fastapi import HTTPException

from app.routers import vps_storage as st


@dataclass
class User:
    id: str = "user-1"
    school_id: Optional[str] = "school-A"
    is_super_admin: bool = False
    roles: List[str] = field(default_factory=list)


SCHOOL_A, SCHOOL_B = "school-A", "school-B"


def _resolve(path, user=None, bucket="docs"):
    return st.resolve_storage_path(bucket, path, user or User())


# --- The prefix is imposed, not trusted -------------------------------------

def test_school_prefix_is_added_when_the_client_omits_it():
    """
    Assignment submissions send "{studentId}/{assignmentId}/file". Under the old
    rule that first segment had to equal the school id, so these 403'd; now the
    school prefix is prepended and the object lands inside the tenant.
    """
    _, rel = _resolve("student-77/assignment-9/essay.pdf")
    assert rel == f"{SCHOOL_A}/student-77/assignment-9/essay.pdf"


def test_existing_school_prefixed_paths_are_left_alone():
    """Objects already written as "{schoolId}/..." must stay reachable."""
    _, rel = _resolve(f"{SCHOOL_A}/logo_123.png")
    assert rel == f"{SCHOOL_A}/logo_123.png"


def test_a_caller_cannot_address_another_schools_prefix():
    """Naming school B just nests it under school A; it never escapes."""
    _, rel = _resolve(f"{SCHOOL_B}/secret.pdf")
    assert rel == f"{SCHOOL_A}/{SCHOOL_B}/secret.pdf"
    assert not rel.startswith(SCHOOL_B)


def test_absolute_looking_paths_are_confined():
    _, rel = _resolve("/etc/passwd")
    assert rel == f"{SCHOOL_A}/etc/passwd"


def test_no_school_context_is_refused_rather_than_skipped():
    """
    The old code skipped the isolation check entirely when the user had no
    school, which turned a missing context into read access to every school.
    """
    with pytest.raises(HTTPException) as exc:
        _resolve("anything.pdf", User(school_id=None))
    assert exc.value.status_code == 403


def test_super_admin_addresses_the_store_directly():
    _, rel = _resolve("snapshots/backup.zip", User(is_super_admin=True, school_id=None))
    assert rel == "snapshots/backup.zip"


# --- Traversal ---------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "../../../etc/passwd",
    "a/../../b.pdf",
    "..%2f..%2fetc/passwd",
    "a/\x00b.pdf",
    "a\\..\\b.pdf",
])
def test_traversal_attempts_are_rejected_or_confined(path):
    try:
        abs_path, rel = _resolve(path)
    except HTTPException as e:
        assert e.status_code in (400, 403)
        return
    bucket_dir = os.path.realpath(os.path.join(st.STORAGE_ROOT, "docs"))
    assert os.path.commonpath([abs_path, bucket_dir]) == bucket_dir
    assert ".." not in rel


def test_sibling_bucket_cannot_be_reached_by_name_prefix():
    """"/storage/ab" starts with "/storage/a" but is a different bucket."""
    abs_path, _ = _resolve("x.pdf", bucket="a")
    assert os.path.commonpath(
        [abs_path, os.path.realpath(os.path.join(st.STORAGE_ROOT, "a"))]
    ).endswith(os.sep + "a")


@pytest.mark.parametrize("bucket", ["", "a/b", "../etc", ".hidden", "a\\b"])
def test_invalid_buckets_are_rejected(bucket):
    with pytest.raises(HTTPException):
        st.resolve_storage_path(bucket, "f.pdf", User())


def test_empty_path_is_rejected():
    for p in ("", "/", "///", "./."):
        with pytest.raises(HTTPException):
            _resolve(p)


# --- Type allowlist ----------------------------------------------------------

@pytest.mark.parametrize("name", [
    "photo.jpg", "scan.PDF", "sheet.xlsx", "data.csv", "notes.md", "pack.zip",
])
def test_expected_document_types_are_accepted(name):
    assert st._checked_media_type(name)


@pytest.mark.parametrize("name", [
    "payload.html",   # executes script on this origin
    "payload.svg",    # same, via embedded script
    "shell.sh", "app.exe", "lib.so", "run.php", "x.js", "noext",
])
def test_script_bearing_and_unknown_types_are_refused(name):
    with pytest.raises(HTTPException) as exc:
        st._checked_media_type(name)
    assert exc.value.status_code == 400


def test_html_and_svg_are_never_served_inline():
    for mime in ("text/html", "image/svg+xml", "application/xml"):
        assert mime not in st.INLINE_SAFE_TYPES


def test_upload_limit_is_bounded():
    assert 0 < st.MAX_UPLOAD_BYTES <= 100 * 1024 * 1024
    assert st._CHUNK < st.MAX_UPLOAD_BYTES, "must read in chunks, not all at once"


# --- Signed URLs -------------------------------------------------------------
#
# A browser cannot attach an Authorization header to an <img src>, so every
# image in the product was being requested anonymously and answered with 401.
# A signed URL carries its own proof instead.

import time as _time


def _sign(bucket="photos", path="school-A/x.jpg", ttl=60, scope="school-A"):
    exp = int(_time.time()) + ttl
    return exp, st._signature(bucket, path, exp, scope)


def test_a_valid_signature_is_accepted():
    exp, sig = _sign()
    assert st.verify_signature("photos", "school-A/x.jpg", exp, "school-A", sig) is True


@pytest.mark.parametrize("bucket,path,scope", [
    ("photos", "school-B/x.jpg", "school-A"),   # different object
    ("photos", "school-A/x.jpg", "school-B"),   # different tenant
    ("documents", "school-A/x.jpg", "school-A"),  # different bucket
])
def test_editing_any_signed_field_invalidates_it(bucket, path, scope):
    """The signature covers the object, the tenant and the expiry together."""
    exp, sig = _sign()
    assert st.verify_signature(bucket, path, exp, scope, sig) is False


def test_an_expired_signature_is_refused():
    exp = int(_time.time()) - 1
    sig = st._signature("photos", "school-A/x.jpg", exp, "school-A")
    assert st.verify_signature("photos", "school-A/x.jpg", exp, "school-A", sig) is False


def test_a_forged_signature_is_refused():
    exp = int(_time.time()) + 60
    assert st.verify_signature("photos", "school-A/x.jpg", exp, "school-A",
                               "0" * 64) is False


def test_signing_is_refused_without_a_real_key(monkeypatch):
    """
    The default placeholder secret must not produce usable links — otherwise a
    deployment that forgot to set SECRET_KEY hands out forgeable URLs.
    """
    from app.config import settings
    monkeypatch.setattr(settings, "secret_key", "change-this-in-production")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    exp, sig = _sign()
    assert st.verify_signature("photos", "school-A/x.jpg", exp, "school-A", sig) is False


def test_signed_ttl_is_bounded():
    assert st.SIGNED_URL_DEFAULT_TTL <= st.SIGNED_URL_MAX_TTL
    assert st.SIGNED_URL_MAX_TTL <= 24 * 3600
