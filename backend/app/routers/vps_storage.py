"""
VPS Private Storage Access Router — Secure file streaming, upload, delete & authorization.
Base Path: /api/storage
"""
import os, mimetypes, logging
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_with_roles, AuthenticatedUser, get_db

logger = logging.getLogger("app.routers.vps_storage")

router = APIRouter(prefix="/storage", tags=["Storage"])

STORAGE_ROOT = "/var/lib/altrix/storage"

def validate_and_resolve_path(bucket: str, path: str, current_user: AuthenticatedUser) -> str:
    """Helper to enforce path traversal safety and tenant isolation."""
    if ".." in path or "\\" in path or "%2e" in path.lower() or "\0" in path or ".." in bucket or "/" in bucket:
        logger.warning(f"Path traversal blocked for user {current_user.id}: bucket={bucket}, path={path}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid storage path"
        )

    bucket_dir = os.path.realpath(os.path.join(STORAGE_ROOT, bucket))
    real_filepath = os.path.realpath(os.path.join(bucket_dir, path.lstrip("/")))

    if not real_filepath.startswith(bucket_dir):
        logger.warning(f"Path traversal escape attempt blocked: {real_filepath}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access denied: path traversal prohibited"
        )

    path_segments = [s for s in path.lstrip("/").split("/") if s]
    if not path_segments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid object path")

    path_school_id = path_segments[0]
    if not current_user.is_super_admin:
        user_school = str(current_user.school_id) if current_user.school_id else ""
        if user_school and path_school_id != user_school:
            logger.warning(f"Cross-tenant storage access attempt blocked: user {current_user.id} (school {user_school}) attempted path in school {path_school_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: cross-tenant access prohibited"
            )

    return real_filepath


@router.get("/files/{bucket}/{path:path}")
async def serve_vps_storage_file(
    bucket: str,
    path: str,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Secure file retrieval endpoint for VPS private storage.
    Enforces authentication, tenant isolation, and path traversal protection.
    """
    real_filepath = validate_and_resolve_path(bucket, path, current_user)

    if not os.path.isfile(real_filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    mime_type, _ = mimetypes.guess_type(real_filepath)
    mime_type = mime_type or "application/octet-stream"
    filename = os.path.basename(real_filepath)

    return FileResponse(
        path=real_filepath,
        media_type=mime_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'inline; filename="{filename}"'
        }
    )


@router.post("/upload")
async def upload_vps_storage_file(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
    file: UploadFile = File(...),
    bucket: str = Form(...),
    path: str = Form(...),
):
    """
    Secure file upload endpoint for VPS private storage.
    Writes object to /var/lib/altrix/storage/{bucket}/{path}
    """
    real_filepath = validate_and_resolve_path(bucket, path, current_user)

    os.makedirs(os.path.dirname(real_filepath), exist_ok=True)
    content = await file.read()

    with open(real_filepath, "wb") as f:
        f.write(content)

    os.chmod(real_filepath, 0o640)
    logger.info(f"File uploaded to VPS storage: bucket={bucket}, path={path}, bytes={len(content)}")

    return {
        "status": "success",
        "bucket": bucket,
        "path": path,
        "size_bytes": len(content),
        "url": f"/api/storage/files/{bucket}/{path.lstrip('/')}"
    }


@router.delete("/files/{bucket}/{path:path}")
async def delete_vps_storage_file(
    bucket: str,
    path: str,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user_with_roles)],
):
    """
    Secure file deletion endpoint for VPS private storage.
    """
    real_filepath = validate_and_resolve_path(bucket, path, current_user)

    if os.path.exists(real_filepath):
        os.remove(real_filepath)
        logger.info(f"File deleted from VPS storage: bucket={bucket}, path={path}")

    return {"status": "deleted", "bucket": bucket, "path": path}


@router.get("/health")
async def vps_storage_health():
    """Health check for VPS storage subsystem."""
    exists = os.path.exists(STORAGE_ROOT)
    return {"status": "ok", "storage_root": STORAGE_ROOT, "exists": exists}
