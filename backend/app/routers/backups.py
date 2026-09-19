"""
Backup and restore management for the Super Admin dashboard.

Everything here runs against this VPS and its own Postgres — there is no hosted
service involved.

The download and upload endpoints are the point of this module. Getting a copy
of the database off the server used to require shell access; now an operator can
take one from the dashboard, keep it wherever they like, and upload it back to
restore. That is what makes "we have off-site backups" true without depending on
anyone else's infrastructure.

Every endpoint is platform-wide and guarded at the router.
"""
import asyncio
import logging
import os
import shutil
import tempfile
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.dependencies import CurrentUser, DbSession
from app.utils.permissions import require_super_admin

logger = logging.getLogger("app.routers.backups")

router = APIRouter(
    prefix="/super_admin/backups",
    tags=["Super Admin Backups"],
    dependencies=[Depends(require_super_admin())],
)

#: Uploads are streamed in fixed chunks so a large restore file cannot exhaust
#: the worker's memory, the same rule the storage router follows.
_CHUNK = 4 * 1024 * 1024
MAX_UPLOAD_BYTES = 5 * 1024**3  # matches the backup size ceiling


class BackupSettingsIn(BaseModel):
    alert_emails: list[str] | str = Field(default_factory=list)
    alert_on_failure: bool = True
    alert_on_stale: bool = True
    alert_on_missing_offsite: bool = True
    alert_on_drill_failure: bool = True
    stale_after_hours: int = 48


class RestoreRequest(BaseModel):
    backup: str
    target_url: Optional[str] = None
    # Restoring over the live database is possible but never the default: a
    # mistyped target during an incident turns a recoverable problem into an
    # unrecoverable one.
    overwrite_production: bool = False


def _safe_name(name: str) -> str:
    """Reject anything that is not a plain file name in the backup directory."""
    cleaned = os.path.basename((name or "").strip())
    if not cleaned or cleaned != name.strip() or cleaned.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid backup name")
    return cleaned


def _resolve(name: str) -> str:
    from app.utils.backup_service import _backup_dir

    path = os.path.join(_backup_dir(), _safe_name(name))
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="No such backup")
    return path


# ─── Inventory and health ─────────────────────────────────────────────────────

@router.get("")
async def list_backups():
    """Every backup on this server, newest first, with overall health."""
    from app.utils.backup_service import get_backup_status
    from app.utils.restore_service import list_restorable

    status_info = await get_backup_status()
    return {
        "backups": [
            {k: v for k, v in item.items() if k != "path"}
            for item in list_restorable()
        ],
        "health": status_info,
    }


@router.get("/health")
async def backup_health():
    from app.utils.backup_service import get_backup_status

    return await get_backup_status()


# ─── Taking one ───────────────────────────────────────────────────────────────

@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
async def run_backup_now(background: BackgroundTasks):
    """
    Take a backup immediately, ignoring the off-peak window.

    Runs in the background: a full dump can take minutes and holding an HTTP
    request open for it would simply time out.
    """
    from app.utils.backup_service import run_backup

    async def _run():
        try:
            result = await run_backup(force=True)
            logger.info(f"Manual backup finished: {result.get('filename')}")
        except Exception as e:
            logger.error(f"Manual backup failed: {e}")

    background.add_task(_run)
    return {
        "status": "started",
        "message": "Backup started. Refresh in a minute to see it listed.",
    }


# ─── Getting a copy off the server ────────────────────────────────────────────

@router.get("/{name}/download")
async def download_backup(name: str, decrypt: bool = Query(False)):
    """
    Download a backup.

    This is how a copy leaves the server without any third-party account. Keep
    the file somewhere other than this machine; it is the difference between
    surviving a lost host and not.

    By default the encrypted file is sent as-is, which is what should be stored.
    ``decrypt=true`` returns a plain pg_restore archive for someone who would
    rather not depend on holding the key — at the cost of the file then being
    readable by anyone who obtains it, and it contains every student's personal
    data.
    """
    from app.utils.backup_storage import BackupKeyMissing, decrypt_file, is_encrypted

    path = _resolve(name)
    filename = os.path.basename(path)

    if decrypt and is_encrypted(path):
        work_dir = tempfile.mkdtemp(prefix="altrix-dl-")
        plain = os.path.join(work_dir, filename.replace(".enc", ""))
        try:
            decrypt_file(path, plain)
        except BackupKeyMissing as e:
            shutil.rmtree(work_dir, ignore_errors=True)
            raise HTTPException(status_code=409, detail=str(e))
        except Exception as e:
            shutil.rmtree(work_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Could not decrypt: {e}")

        logger.warning(
            f"Backup {filename} downloaded DECRYPTED — the file contains personal "
            "data for every student and is readable by anyone who obtains it."
        )
        return FileResponse(
            plain,
            media_type="application/octet-stream",
            filename=os.path.basename(plain),
            background=_cleanup_task(work_dir),
        )

    return FileResponse(
        path, media_type="application/octet-stream", filename=filename,
        headers={"X-Altrix-Encrypted": "true" if is_encrypted(path) else "false"},
    )


def _cleanup_task(directory: str):
    from starlette.background import BackgroundTask

    return BackgroundTask(lambda: shutil.rmtree(directory, ignore_errors=True))


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_backup(file: UploadFile = File(...)):
    """
    Put a previously downloaded backup back on the server so it can be restored.

    This closes the loop: download, keep it safe, upload, restore — with no
    shell access and no external service.
    """
    from app.utils.backup_service import _backup_dir
    from app.utils.backup_storage import is_encrypted

    name = _safe_name(file.filename or "")
    if not (name.endswith(".dump") or name.endswith(".dump.enc")):
        raise HTTPException(
            status_code=400,
            detail="Expected a .dump or .dump.enc file produced by this system",
        )

    target_dir = _backup_dir()
    os.makedirs(target_dir, exist_ok=True)
    destination = os.path.join(target_dir, name)
    if os.path.exists(destination):
        raise HTTPException(
            status_code=409,
            detail=f"{name} already exists on the server",
        )

    written = 0
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=target_dir, delete=False) as tmp:
            tmp_path = tmp.name
            while chunk := await file.read(_CHUNK):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File exceeds the 5 GB limit",
                    )
                tmp.write(chunk)

        if written == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty")

        os.chmod(tmp_path, 0o600)
        shutil.move(tmp_path, destination)
        tmp_path = None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    logger.info(f"Backup {name} uploaded ({written} bytes)")
    return {
        "status": "uploaded",
        "name": name,
        "size_bytes": written,
        "encrypted": is_encrypted(destination),
    }


@router.delete("/{name}")
async def delete_backup(name: str):
    path = _resolve(name)
    os.remove(path)
    logger.warning(f"Backup {os.path.basename(path)} deleted by an administrator")
    return {"status": "deleted", "name": os.path.basename(path)}


# ─── Restoring ────────────────────────────────────────────────────────────────

@router.post("/verify/{name}")
async def verify_backup(name: str):
    """
    Check a backup is readable without restoring it.

    Cheap, and it answers "is this file any good" before an incident makes the
    question urgent.
    """
    from app.utils.backup_service import _verify_dump
    from app.utils.backup_storage import BackupKeyMissing, decrypt_file, is_encrypted

    path = _resolve(name)
    work_dir = tempfile.mkdtemp(prefix="altrix-verify-")
    try:
        check_path = path
        if is_encrypted(path):
            check_path = os.path.join(work_dir, "plain.dump")
            try:
                decrypt_file(path, check_path)
            except BackupKeyMissing as e:
                return {"readable": False, "reason": str(e)}
            except Exception as e:
                return {"readable": False,
                        "reason": f"Decryption failed - the file may be corrupt: {e}"}

        ok = await asyncio.to_thread(_verify_dump, check_path)
        return {
            "readable": bool(ok),
            "encrypted": is_encrypted(path),
            "reason": None if ok else "pg_restore could not read this archive",
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@router.post("/drill", status_code=status.HTTP_202_ACCEPTED)
async def run_drill(background: BackgroundTasks):
    """
    Prove the newest backup restores, into a scratch database.

    Safe to run whenever: it never touches the live database.
    """
    from app.utils.restore_service import run_restore_drill

    background.add_task(lambda: run_restore_drill())
    return {
        "status": "started",
        "message": "Restore drill started. The result appears under backup health.",
    }


@router.post("/restore")
async def restore(body: RestoreRequest, current_user: CurrentUser):
    """
    Restore a backup.

    Without ``target_url`` this restores into a freshly created recovery
    database beside the live one and returns its name, so the data can be
    inspected before anything irreversible happens. That is almost always the
    right move: it costs minutes and it can be undone.
    """
    from app.config import settings
    from app.utils.restore_service import (
        RestoreError, _pg_url, _psql, _swap_database, restore_backup,
    )

    path = _resolve(body.backup)

    if body.target_url:
        target = body.target_url
        created = None
    else:
        from datetime import datetime, timezone

        admin_url = _pg_url(settings.database_url or "")
        if not admin_url:
            raise HTTPException(status_code=503, detail="DATABASE_URL is not configured")
        created = f"altrix_recovery_{datetime.now(timezone.utc):%Y%m%d%H%M%S}"
        try:
            await asyncio.to_thread(
                _psql, _swap_database(admin_url, "postgres"),
                f'CREATE DATABASE "{created}"'
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Could not create a recovery database: {e}"
            )
        target = _swap_database(admin_url, created)

    logger.warning(
        f"Restore of {body.backup} started by {current_user.id} "
        f"(overwrite_production={body.overwrite_production})"
    )

    try:
        result = await asyncio.to_thread(
            restore_backup, path, target,
            allow_production=body.overwrite_production or created is not None,
            clean=True,
        )
    except RestoreError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result["recovery_database"] = created
    if created:
        result["next_step"] = (
            f"Restored into '{created}' beside the live database. Inspect it, and "
            "if it is what you want, repeat with overwrite_production=true."
        )
    return result


# ─── Alert settings (Super Admin > Emails) ────────────────────────────────────

@router.get("/settings/alerts")
async def read_alert_settings(db: DbSession):
    from app.utils.backup_settings import get_backup_settings

    return await get_backup_settings(db)


@router.put("/settings/alerts")
async def write_alert_settings(body: BackupSettingsIn, db: DbSession):
    from app.utils.backup_settings import save_backup_settings

    return await save_backup_settings(db, body.model_dump())
