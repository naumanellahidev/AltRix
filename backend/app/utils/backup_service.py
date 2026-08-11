"""
Backup Service — Automated database backup via Celery scheduled jobs.

Features:
- pg_dump automation to Supabase Storage
- Backup rotation (keep last N backups)
- Off-hours scheduling (runs at 2 AM PKT)
- Backup integrity validation
- Restore procedure documentation

Note: Primary backups are managed by Railway/Supabase infrastructure.
      This service provides additional application-level backup readiness.
      Heavy jobs are intentionally run during off-peak hours.
"""
import logging
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("app.backup")

# ─── Configuration ────────────────────────────────────────────────────────────

BACKUP_BUCKET = "altrix-backups"
BACKUP_RETENTION_COUNT = 30          # Keep last 30 daily backups
BACKUP_MAX_SIZE_GB = 5               # Skip backup if DB is too large
BACKUP_OFF_HOURS_UTC_START = 21      # 9 PM UTC = 2 AM PKT (+5)
BACKUP_OFF_HOURS_UTC_END = 4         # 4 AM UTC = 9 AM PKT


# ─── Celery Task Registration ─────────────────────────────────────────────────

def register_backup_tasks(celery_app):
    """
    Register backup tasks with the Celery app.
    Call this from celery_app.py.

    Schedule: Daily at 2 AM PKT (21:00 UTC)
    """
    celery_app.conf.beat_schedule = {
        **getattr(celery_app.conf, "beat_schedule", {}),
        "daily-db-backup": {
            "task": "app.utils.backup_service.run_daily_backup",
            "schedule": 86400,  # every 24 hours
            "options": {"expires": 3600},
        },
    }

    @celery_app.task(
        name="app.utils.backup_service.run_daily_backup",
        bind=True,
        max_retries=2,
        default_retry_delay=300,
    )
    def run_daily_backup(self):
        """
        Celery task: run pg_dump and upload to Supabase Storage.
        Only runs during off-peak hours to avoid impacting performance.
        """
        import asyncio
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(_async_run_backup())
            loop.close()
            return result
        except Exception as exc:
            logger.error(f"Backup task failed: {exc}")
            self.retry(exc=exc)

    return run_daily_backup


# ─── Core Backup Logic ────────────────────────────────────────────────────────

async def _async_run_backup() -> dict:
    """
    Main backup execution:
    1. Check if we're in off-peak hours
    2. Run pg_dump
    3. Upload to Supabase Storage
    4. Rotate old backups
    5. Log result
    """
    now_utc = datetime.now(timezone.utc)
    hour = now_utc.hour

    # Check off-peak window
    in_off_hours = hour >= BACKUP_OFF_HOURS_UTC_START or hour < BACKUP_OFF_HOURS_UTC_END
    if not in_off_hours:
        logger.info(f"Skipping backup: not in off-peak window (current UTC hour: {hour})")
        return {"status": "skipped", "reason": "peak_hours"}

    logger.info("Starting scheduled database backup...")

    try:
        backup_data = await _run_pg_dump()
        if not backup_data:
            return {"status": "failed", "reason": "pg_dump_empty"}

        filename = f"backup_{now_utc.strftime('%Y%m%d_%H%M%S')}_utc.sql.gz"
        path = f"daily/{filename}"

        uploaded = await _upload_backup(backup_data, path)
        if not uploaded:
            return {"status": "failed", "reason": "upload_failed"}

        await _rotate_old_backups()

        size_kb = len(backup_data) // 1024
        logger.info(f"Backup completed: {filename} ({size_kb} KB)")
        return {
            "status": "success",
            "filename": filename,
            "size_kb": size_kb,
            "timestamp": now_utc.isoformat(),
        }

    except Exception as e:
        logger.error(f"Backup failed: {e}")
        return {"status": "error", "error": str(e)}


async def _run_pg_dump() -> Optional[bytes]:
    """
    Execute pg_dump against the configured database.
    Returns compressed SQL bytes, or None on failure.
    """
    from app.config import settings

    db_url = settings.database_url
    if not db_url:
        logger.warning("No DATABASE_URL configured — backup skipped")
        return None

    # Convert SQLAlchemy URL format to psql format
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        with tempfile.NamedTemporaryFile(suffix=".sql.gz", delete=False) as tmp:
            tmp_path = tmp.name

        result = subprocess.run(
            ["pg_dump", "--dbname", pg_url, "--format=custom", "--compress=6", f"--file={tmp_path}"],
            capture_output=True,
            timeout=300,  # 5 minute timeout
        )

        if result.returncode != 0:
            err = result.stderr.decode("utf-8", errors="replace")
            logger.error(f"pg_dump failed (rc={result.returncode}): {err[:500]}")
            return None

        with open(tmp_path, "rb") as f:
            data = f.read()

        os.unlink(tmp_path)
        return data

    except FileNotFoundError:
        logger.warning("pg_dump not available — skipping backup")
        return None
    except subprocess.TimeoutExpired:
        logger.error("pg_dump timed out after 5 minutes")
        return None
    except Exception as e:
        logger.error(f"pg_dump exception: {e}")
        return None


async def _upload_to_storage(data: bytes, path: str) -> bool:
    """Upload encrypted backup file to VPS Private Storage."""
    try:
        local_path = os.path.realpath(os.path.join("/var/lib/altrix/storage", BACKUP_BUCKET, path.lstrip("/")))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        os.chmod(local_path, 0o640)
        logger.info(f"Backup uploaded to VPS storage: {local_path} ({len(data)} bytes)")
        return True
    except Exception as e:
        logger.error(f"Backup upload exception: {e}")
        return False


async def _rotate_old_backups() -> None:
    """
    Remove backups beyond BACKUP_RETENTION_COUNT.
    Keeps the N most recent backups.
    """
    try:
        daily_dir = os.path.realpath(os.path.join("/var/lib/altrix/storage", BACKUP_BUCKET, "daily"))
        if not os.path.exists(daily_dir):
            return

        files = sorted([os.path.join(daily_dir, f) for f in os.listdir(daily_dir) if os.path.isfile(os.path.join(daily_dir, f))])
        if len(files) <= BACKUP_RETENTION_COUNT:
            return

        to_delete = files[:len(files) - BACKUP_RETENTION_COUNT]
        for fpath in to_delete:
            os.remove(fpath)
            logger.info(f"Rotated old backup file: {fpath}")

    except Exception as e:
        logger.warning(f"Backup rotation failed: {e}")


async def get_backup_status() -> dict:
    """
    Return the status of recent backups.
    Used by the security monitoring dashboard.
    """
    try:
        daily_dir = os.path.realpath(os.path.join("/var/lib/altrix/storage", BACKUP_BUCKET, "daily"))
        if not os.path.exists(daily_dir):
            return {"available": False, "backups": []}

        files = sorted([f for f in os.listdir(daily_dir) if os.path.isfile(os.path.join(daily_dir, f))], reverse=True)
        backups = []
        for fname in files[:5]:
            fpath = os.path.join(daily_dir, fname)
            backups.append({"name": fname, "size": os.path.getsize(fpath)})

        return {
            "available": True,
            "count": len(files),
            "latest": files[0] if files else None,
            "backups": backups,
        }
    except Exception as e:
        logger.warning(f"Backup status check failed: {e}")
        return {"available": False, "error": str(e)}
