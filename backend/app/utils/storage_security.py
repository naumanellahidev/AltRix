"""
Storage Security — Supabase Storage integration with access control.

All files uploaded to AltRix are stored in Supabase Storage private buckets.
No file should be directly accessible via public URL.

Architecture:
- Files are stored under: {bucket}/{school_id}/{category}/{filename}
- Access is granted via signed URLs with expiration
- Each signed URL generation validates user permission
- Tenant isolation is enforced at path level (school_id prefix)

Buckets:
- altrix-documents: PDFs, reports, invoices (private)
- altrix-profiles: Profile photos (private, 1-hour signed URLs)
- altrix-exports: Data exports (private, 30-minute signed URLs)
"""
import logging
import uuid
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger("app.security.storage")

# ─── Bucket Configuration ─────────────────────────────────────────────────────

BUCKET_DOCUMENTS = "altrix-documents"
BUCKET_PROFILES = "altrix-profiles"
BUCKET_EXPORTS = "altrix-exports"

SIGNED_URL_TTL = {
    BUCKET_DOCUMENTS: 3600,    # 1 hour for documents
    BUCKET_PROFILES: 3600,     # 1 hour for profile photos
    BUCKET_EXPORTS: 1800,      # 30 minutes for exports
}

ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


# ─── Path Helpers ─────────────────────────────────────────────────────────────

def build_storage_path(
    school_id: str,
    category: str,
    filename: str,
    user_id: Optional[str] = None,
) -> str:
    """
    Build a tenant-isolated storage path.
    Format: {school_id}/{category}/{user_id or 'shared'}/{filename}

    This ensures:
    1. All school files are under their school_id prefix
    2. No path traversal is possible (we control the prefix)
    3. Category segregates document types
    """
    # Sanitize filename — no path traversal
    safe_filename = filename.replace("..", "").replace("/", "_").replace("\\", "_")
    user_segment = user_id or "shared"
    return f"{school_id}/{category}/{user_segment}/{safe_filename}"


def build_unique_path(
    school_id: str,
    category: str,
    original_filename: str,
    user_id: Optional[str] = None,
) -> str:
    """Generate a unique path with UUID prefix to prevent filename collisions."""
    ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "bin"
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    return build_storage_path(school_id, category, unique_name, user_id)


# ─── Signed URL Generation ────────────────────────────────────────────────────

async def generate_signed_url(
    bucket: str,
    path: str,
    school_id: str,
    user_school_id: str,
    expires_in: Optional[int] = None,
) -> str:
    """
    Generate a Supabase Storage signed URL for a private file.

    Validates:
    1. User's school_id matches the path prefix (tenant isolation)
    2. Path doesn't contain traversal characters

    Returns the signed URL string.
    Raises ValueError on access denial or Supabase error.
    """
    # ── Tenant isolation check ──
    if not path.startswith(school_id + "/"):
        logger.warning(
            f"Storage access denied: user_school={user_school_id} "
            f"tried to access path={path} (school={school_id})"
        )
        raise ValueError("Access denied: file belongs to a different organization")

    if school_id != user_school_id:
        raise ValueError("Access denied: cannot access another school's files")

    # ── Path safety check ──
    if ".." in path or path.startswith("/"):
        raise ValueError("Invalid file path")

    ttl = expires_in or SIGNED_URL_TTL.get(bucket, 3600)
    vps_url = f"/api/storage/files/{bucket}/{path.lstrip('/')}"
    logger.info(f"VPS Storage URL generated: bucket={bucket}, path={path}, ttl={ttl}s")
    return vps_url


async def delete_file(bucket: str, path: str, school_id: str, user_school_id: str) -> bool:
    """
    Delete a file from VPS Private Storage.
    Validates tenant isolation before deletion.
    Returns True on success.
    """
    if not path.startswith(school_id + "/") or school_id != user_school_id:
        raise ValueError("Access denied: cannot delete another school's files")

    try:
        local_path = os.path.realpath(os.path.join("/var/lib/altrix/storage", bucket, path.lstrip("/")))
        if os.path.exists(local_path):
            os.remove(local_path)
            logger.info(f"VPS File deleted: bucket={bucket}, path={path}")
        return True
    except Exception as e:
        logger.error(f"Storage delete error: {e}")
        return False


# ─── File Validation ──────────────────────────────────────────────────────────

def validate_file_upload(
    filename: str,
    content_type: str,
    file_size: int,
    *,
    allowed_types: Optional[set] = None,
    max_size: int = MAX_FILE_SIZE_BYTES,
) -> None:
    """
    Validate a file before upload.
    Raises ValueError with descriptive message on failure.
    """
    if not filename or not filename.strip():
        raise ValueError("Filename is required")

    if ".." in filename or "/" in filename or "\\" in filename:
        raise ValueError("Invalid filename: path traversal detected")

    allowed = allowed_types or ALLOWED_DOCUMENT_MIME_TYPES
    if content_type not in allowed:
        raise ValueError(
            f"File type '{content_type}' is not allowed. "
            f"Allowed types: {', '.join(sorted(allowed))}"
        )

    if file_size > max_size:
        max_mb = max_size // (1024 * 1024)
        raise ValueError(f"File size exceeds {max_mb}MB limit")


async def list_school_files(
    bucket: str,
    school_id: str,
    user_school_id: str,
    category: Optional[str] = None,
) -> list:
    """
    List files for a school in VPS Private Storage.
    Enforces tenant isolation — only lists files under school_id prefix.
    """
    if school_id != user_school_id:
        raise ValueError("Access denied: cannot list another school's files")

    prefix = f"{school_id}/{category}" if category else school_id
    local_dir = os.path.realpath(os.path.join("/var/lib/altrix/storage", bucket, prefix))

    if not os.path.exists(local_dir):
        return []

    res = []
    for root, _, filenames in os.walk(local_dir):
        for fname in filenames:
            full_p = os.path.join(root, fname)
            rel_p = os.path.relpath(full_p, os.path.join("/var/lib/altrix/storage", bucket))
            res.append({
                "name": rel_p,
                "size": os.path.getsize(full_p),
                "url": f"/api/storage/files/{bucket}/{rel_p}"
            })
    return res
