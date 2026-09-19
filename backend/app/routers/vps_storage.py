"""
VPS Private Storage — file streaming, upload, delete and authorization.
Base path: /api/storage

Tenant isolation is *structural* here, not validated. The server derives the
school prefix for every object from the caller's verified session and builds the
path from it, rather than checking a client-supplied path and hoping the client
used the right convention.

That matters because callers do not agree on a convention: most build
``{schoolId}/...`` but assignment submissions build ``{studentId}/...`` and
message attachments ``{senderId}/...``. The previous check required the first
path segment to equal the caller's school id, so those callers were rejected
with 403 — unless the user happened to have no school context at all, in which
case the check was skipped entirely and became a cross-tenant hole.
"""
import hashlib
import hmac
import logging
import mimetypes
import os
import shutil
import tempfile
import time
from typing import Annotated, Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_with_roles, AuthenticatedUser, get_db

logger = logging.getLogger("app.routers.vps_storage")

router = APIRouter(prefix="/storage", tags=["Storage"])

STORAGE_ROOT = "/var/lib/altrix/storage"

#: Largest object accepted. The previous implementation read the whole upload
#: into memory with ``await file.read()``, so a single large request could
#: exhaust the worker's RAM. Uploads stream to disk and stop at this limit.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

#: Read in fixed chunks so memory use is bounded regardless of file size.
_CHUNK = 1024 * 1024

#: Extensions this product actually stores: photos, scanned documents,
#: spreadsheets and archives. Everything else is refused.
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp", ".tiff",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods",
    ".csv", ".txt", ".json", ".xml", ".md",
    ".zip",
}

#: Types safe to render in the browser. Everything else is sent as a download.
#:
#: Note what is absent: HTML and SVG. Both execute script in the context of the
#: serving origin, so rendering a user-supplied one inline is stored XSS against
#: this API's own origin.
INLINE_SAFE_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
    "image/tiff", "application/pdf",
}

#: Roles allowed to delete anyone's file within their school. Students and
#: parents are handled separately: they may only delete their own uploads.
STAFF_DELETE_ROLES = {
    "super_admin", "school_owner", "principal", "vice_principal",
    "school_admin", "academic_coordinator", "teacher", "accountant",
    "hr_manager", "counselor", "marketing_staff",
}

SIGNED_URL_DEFAULT_TTL = 3600
SIGNED_URL_MAX_TTL = 24 * 3600


def _reject(detail: str, code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _tenant_prefix(current_user: AuthenticatedUser) -> str:
    """The storage prefix this caller's objects live under."""
    if not current_user.school_id:
        # Previously an empty school context skipped the isolation check
        # altogether, letting such a caller read any school's files.
        raise _reject(
            "No school context. Send the X-School-Id header.",
            status.HTTP_403_FORBIDDEN,
        )
    return str(current_user.school_id)


def _clean_segments(path: str) -> list:
    segments = [s for s in (path or "").split("/") if s and s not in (".", "..")]
    if not segments or any(".." in s for s in segments):
        raise _reject("Invalid storage path")
    return segments


def _bucket_dir(bucket: str) -> str:
    if not bucket or "/" in bucket or "\\" in bucket or bucket.startswith("."):
        raise _reject("Invalid bucket")
    return os.path.realpath(os.path.join(STORAGE_ROOT, bucket))


def _confine(bucket_dir: str, rel_path: str) -> str:
    real_path = os.path.realpath(os.path.join(bucket_dir, rel_path))
    # Compare against the directory boundary, not a bare string prefix:
    # "/storage/ab" starts with "/storage/a" but is a different bucket.
    if os.path.commonpath([real_path, bucket_dir]) != bucket_dir:
        logger.warning(f"Path traversal escape blocked: {real_path}")
        raise _reject("Access denied: path traversal prohibited", status.HTTP_403_FORBIDDEN)
    return real_path


def resolve_storage_path(
    bucket: str,
    path: str,
    current_user: AuthenticatedUser,
) -> tuple:
    """
    Map a caller-supplied object path to an absolute file path.

    Returns ``(absolute_path, stored_relative_path)``.

    The caller's school prefix is imposed here rather than verified, so no
    client path convention can escape its tenant. Paths that already begin with
    the school id are left alone, which keeps objects written under the older
    ``{schoolId}/...`` convention reachable.
    """
    if "\0" in (path or "") or "\\" in (path or "") or "%2e" in (path or "").lower():
        logger.warning(f"Rejected suspicious storage path from {current_user.id}: {path!r}")
        raise _reject("Invalid storage path")

    segments = _clean_segments(path)

    if current_user.is_super_admin:
        # Platform administrators address the store directly (backups, imports).
        rel_segments = segments
    else:
        prefix = _tenant_prefix(current_user)
        rel_segments = segments if segments[0] == prefix else [prefix, *segments]

    rel_path = "/".join(rel_segments)
    return _confine(_bucket_dir(bucket), rel_path), rel_path


def _checked_media_type(filename: str) -> str:
    """Media type derived from the extension, never from the client's header."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise _reject(
            f"File type '{ext or filename}' is not allowed. Permitted: "
            + ", ".join(sorted(ALLOWED_EXTENSIONS))
        )
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def _file_headers(real_filepath: str) -> tuple:
    filename = os.path.basename(real_filepath)
    mime_type = mimetypes.guess_type(real_filepath)[0] or "application/octet-stream"
    # Anything that could carry script is handed over as a download rather than
    # rendered, so a stored file cannot execute on this origin.
    disposition = "inline" if mime_type in INLINE_SAFE_TYPES else "attachment"
    safe_name = filename.replace('"', "").replace("\r", "").replace("\n", "")
    return mime_type, {
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f'{disposition}; filename="{safe_name}"',
        # Belt and braces: even if something slips through as inline, deny it any
        # ability to run script or be framed.
        "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
        # Stored objects are immutable once written — a new upload gets a new
        # path — so let the browser keep them. "private" because the file belongs
        # to one tenant and must never sit in a shared proxy cache.
        "Cache-Control": "private, max-age=3600",
    }


# ─── Signed URLs ──────────────────────────────────────────────────────────────
#
# The file endpoint authenticates with a bearer token, which a browser cannot
# attach to an <img src>, a <video>, or a PDF renderer's image fetch. Every image
# in the product was therefore requested without credentials and answered with
# 401 — school logos, student photos, event galleries, letterheads.
#
# A signed URL carries its own proof in the query string: an HMAC over the exact
# object, the tenant it belongs to, and an expiry. Stateless, so it needs no
# storage, and scoped, so it cannot be edited to reach another school's file.

def _signing_key() -> bytes:
    from app.config import settings
    return (settings.secret_key or settings.supabase_jwt_secret or "").encode("utf-8")


def _signature(bucket: str, rel_path: str, expires_at: int, scope: str) -> str:
    message = "\n".join([bucket, rel_path, str(expires_at), scope]).encode("utf-8")
    return hmac.new(_signing_key(), message, hashlib.sha256).hexdigest()


def verify_signature(bucket: str, rel_path: str, expires_at: int,
                     scope: str, provided: str) -> bool:
    key = _signing_key()
    if not key or key == b"change-this-in-production":
        logger.error("No signing key configured; refusing to honour signed URLs")
        return False
    if expires_at < int(time.time()):
        return False
    return hmac.compare_digest(_signature(bucket, rel_path, expires_at, scope), provided)


class SignRequest(BaseModel):
    bucket: str
    path: str
    expires_in: int = SIGNED_URL_DEFAULT_TTL


@router.post("/sign")
async def create_signed_url(
    body: SignRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
):
    """
    Mint a time-limited URL for an object the caller can already read.

    Authorisation happens here, once, against the caller's session. The resulting
    link then works in an <img> tag or a PDF renderer, neither of which can send
    an Authorization header.
    """
    _, rel_path = resolve_storage_path(body.bucket, body.path, current_user)

    ttl = max(60, min(int(body.expires_in or SIGNED_URL_DEFAULT_TTL), SIGNED_URL_MAX_TTL))
    expires_at = int(time.time()) + ttl
    scope = "*" if current_user.is_super_admin else _tenant_prefix(current_user)

    return {
        "signedUrl": (
            f"/api/storage/signed/{body.bucket}/{rel_path}"
            f"?expires={expires_at}&scope={scope}"
            f"&signature={_signature(body.bucket, rel_path, expires_at, scope)}"
        ),
        "expires_at": expires_at,
        "expires_in": ttl,
    }


@router.get("/signed/{bucket}/{path:path}")
async def serve_signed_file(
    bucket: str,
    path: str,
    expires: int = Query(...),
    scope: str = Query(...),
    signature: str = Query(...),
):
    """
    Serve an object to a caller holding a valid signature.

    No session is required — the signature is the authorisation, and it was only
    issued after a session check in /sign.
    """
    rel_path = "/".join(_clean_segments(path))
    if not verify_signature(bucket, rel_path, expires, scope, signature):
        raise _reject("This link is invalid or has expired", status.HTTP_403_FORBIDDEN)

    real_filepath = _confine(_bucket_dir(bucket), rel_path)
    if not os.path.isfile(real_filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    mime_type, headers = _file_headers(real_filepath)
    return FileResponse(path=real_filepath, media_type=mime_type, headers=headers)


# ─── Session-authenticated access ─────────────────────────────────────────────

@router.get("/files/{bucket}/{path:path}")
async def serve_vps_storage_file(
    bucket: str,
    path: str,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Serve a stored object, scoped to the caller's school."""
    real_filepath, _ = resolve_storage_path(bucket, path, current_user)

    if not os.path.isfile(real_filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    mime_type, headers = _file_headers(real_filepath)
    return FileResponse(path=real_filepath, media_type=mime_type, headers=headers)


@router.post("/upload")
async def upload_vps_storage_file(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
    file: UploadFile = File(...),
    bucket: str = Form(...),
    path: str = Form(...),
):
    """
    Store an object under the caller's school prefix.

    The body is streamed to a temporary file and only moved into place once it is
    complete and within the size limit, so a truncated or oversized upload never
    leaves a partial object behind.
    """
    real_filepath, rel_path = resolve_storage_path(bucket, path, current_user)
    _checked_media_type(file.filename or path)

    os.makedirs(os.path.dirname(real_filepath), exist_ok=True)

    written = 0
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=os.path.dirname(real_filepath), delete=False
        ) as tmp:
            tmp_path = tmp.name
            while chunk := await file.read(_CHUNK):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise _reject(
                        f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit",
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    )
                tmp.write(chunk)
        os.chmod(tmp_path, 0o640)
        shutil.move(tmp_path, real_filepath)
        tmp_path = None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    logger.info(
        f"Stored {rel_path} in bucket {bucket} ({written} bytes) for user {current_user.id}"
    )

    return {
        "status": "success",
        "bucket": bucket,
        "path": rel_path,
        "size_bytes": written,
        "url": f"/api/storage/files/{bucket}/{rel_path}",
    }


@router.delete("/files/{bucket}/{path:path}")
async def delete_vps_storage_file(
    bucket: str,
    path: str,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
):
    """
    Delete a stored object.

    Staff may delete anything within their school. Students and parents may only
    delete objects stored under their own id — without this, any student could
    erase another pupil's coursework or a school's fee receipts.
    """
    real_filepath, rel_path = resolve_storage_path(bucket, path, current_user)

    if not current_user.is_super_admin:
        roles = set(current_user.roles or [])
        if not roles & STAFF_DELETE_ROLES:
            if str(current_user.id) not in rel_path.split("/"):
                logger.warning(
                    f"Blocked delete of {rel_path} by non-owner {current_user.id}"
                )
                raise _reject(
                    "You may only delete files you uploaded",
                    status.HTTP_403_FORBIDDEN,
                )

    if os.path.isfile(real_filepath):
        os.remove(real_filepath)
        logger.info(f"Deleted {rel_path} from bucket {bucket} by user {current_user.id}")

    return {"status": "deleted", "bucket": bucket, "path": rel_path}


@router.get("/list/{bucket}")
async def list_vps_storage_files(
    bucket: str,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
    prefix: Optional[str] = None,
):
    """List objects inside a bucket, scoped to the caller's school."""
    from app.utils.storage_security import list_school_files

    if current_user.is_super_admin:
        school_id = prefix.split("/")[0] if prefix else ""
        user_school = school_id
    else:
        school_id = _tenant_prefix(current_user)
        user_school = school_id

    category = None
    if prefix:
        segments = [s for s in prefix.split("/") if s]
        if len(segments) > 1:
            category = segments[1]

    try:
        return await list_school_files(bucket, school_id, user_school, category)
    except ValueError as e:
        raise _reject(str(e), status.HTTP_403_FORBIDDEN)


@router.get("/health")
async def vps_storage_health():
    """Health check for VPS storage subsystem."""
    exists = os.path.exists(STORAGE_ROOT)
    return {"status": "ok", "storage_root": STORAGE_ROOT, "exists": exists}
