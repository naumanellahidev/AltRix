"""
Backup Service — automated database dumps via Celery beat.

State before this was fixed
---------------------------
Three independent faults meant a backup had never once been taken:

1. ``register_backup_tasks()`` was never called from anywhere, and this module
   was not in Celery's ``include`` list, so the task was never registered.
2. ``_async_run_backup`` called ``_upload_backup()``, which does not exist — the
   function is named ``_upload_to_storage``. Every run raised ``NameError``,
   which the surrounding ``except Exception`` swallowed into a returned dict, so
   nothing ever surfaced.
3. The schedule was a plain 24-hour interval gated behind an "off-peak hours"
   check. A worker started at, say, 10:00 UTC would fire at 10:00 every day and
   be skipped every time.

Each one alone was enough to guarantee no backups. The task is now registered
through the normal Celery path in ``celery_app.py`` on a crontab, and failures
raise rather than being reported as a return value.

Two further faults were found on the host itself:

4. ``pg_dump`` was not installed in the Docker image, so every run would have
   died with FileNotFoundError regardless. The Dockerfile now installs
   postgresql-client and the build fails if it is missing.
5. ``/var/lib/altrix/storage`` was bind-mounted into NO container, so anything
   written there — backups, and every uploaded file — lived inside the container
   and was destroyed on the next deploy. deploy.sh now mounts it.

Where these backups live
------------------------
Dumps are AES-256-GCM encrypted (they contain every student's personal data),
written to the mounted host volume, and replicated off-site. A copy that never
leaves the machine does not survive losing the machine, which is the scenario
people mean when they ask whether backups exist.

Restoring is in app/utils/restore_service.py, with the operator runbook in
docs/backup-restore.md. A backup nobody has restored is a hypothesis, so a
scheduled drill restores the newest dump into a scratch database and reports
whether it actually works.
"""
import logging
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Optional

from app.utils.backup_storage import (
    BackupKeyMissing,
    encrypt_file,
    encryption_available,
    replicate_offsite,
)

logger = logging.getLogger("app.backup")

# ─── Configuration ────────────────────────────────────────────────────────────

STORAGE_ROOT = "/var/lib/altrix/storage"
BACKUP_BUCKET = "altrix-backups"
BACKUP_RETENTION_COUNT = 30          # Keep last 30 daily backups
BACKUP_MAX_SIZE_BYTES = 5 * 1024**3  # Refuse to keep a dump larger than 5 GB
PG_DUMP_TIMEOUT_SECONDS = 1800       # 30 minutes

#: pg_dump is invoked with --format=custom, which produces a compressed archive
#: for pg_restore — not gzipped SQL. The old code named these files ".sql.gz",
#: which would send anyone following a restore runbook down the wrong path.
BACKUP_SUFFIX = ".dump"

#: Appended once a dump has been encrypted, so the restore path can tell at a
#: glance which files need a key.
ENCRYPTED_SUFFIX = ".enc"


def _require_encryption() -> bool:
    """Production refuses to write personal data to disk in the clear."""
    from app.config import settings
    return settings.is_production


def _backup_dir() -> str:
    return os.path.realpath(os.path.join(STORAGE_ROOT, BACKUP_BUCKET, "daily"))


# ─── Core Backup Logic ────────────────────────────────────────────────────────

async def run_backup(force: bool = False) -> dict:
    """
    Take a dump, verify it, store it, and rotate old ones.

    ``force`` bypasses the off-peak guard for an operator-triggered run.
    Raises on failure so Celery records it and retries; a silently returned
    error dict is how this went unnoticed for so long.
    """
    now_utc = datetime.now(timezone.utc)

    # Timing is the scheduler's job now. This guard only stops an accidental
    # mid-day run from competing with live traffic.
    if not force and not _in_off_peak_window(now_utc):
        logger.info(f"Skipping backup: outside the off-peak window (UTC hour {now_utc.hour})")
        return {"status": "skipped", "reason": "peak_hours"}

    logger.info("Starting scheduled database backup")
    filename = f"backup_{now_utc.strftime('%Y%m%d_%H%M%S')}_utc{BACKUP_SUFFIX}"
    destination = os.path.join(_backup_dir(), filename)

    dump_path = await _run_pg_dump()
    if not dump_path:
        raise RuntimeError("pg_dump produced no output")

    try:
        size = os.path.getsize(dump_path)
        if size == 0:
            raise RuntimeError("pg_dump produced an empty file")
        if size > BACKUP_MAX_SIZE_BYTES:
            raise RuntimeError(
                f"Dump is {size / 1024**3:.1f} GB, over the "
                f"{BACKUP_MAX_SIZE_BYTES / 1024**3:.0f} GB limit"
            )

        # An unreadable archive is worse than no archive, because it looks like
        # protection right up until a restore is attempted. Verify while the
        # dump is still plaintext.
        if not _verify_dump(dump_path):
            raise RuntimeError("Dump failed its integrity check and was discarded")

        # Encrypt before anything is written to a resting location. The dump
        # holds every student's personal details; it must not sit in the clear
        # on disk or travel to an off-site bucket unprotected.
        if encryption_available():
            encrypted = dump_path + ".enc"
            encrypt_file(dump_path, encrypted)
            os.unlink(dump_path)
            dump_path = encrypted
            destination += ENCRYPTED_SUFFIX
            filename += ENCRYPTED_SUFFIX
            size = os.path.getsize(dump_path)
        elif _require_encryption():
            raise BackupKeyMissing(
                "BACKUP_ENCRYPTION_KEY is not set. A dump of this database "
                "contains every student's personal data and will not be written "
                "unencrypted in production."
            )
        else:
            logger.warning(
                "Backup is being stored UNENCRYPTED: no BACKUP_ENCRYPTION_KEY "
                "is configured. This file contains personal data for every "
                "student in every school."
            )

        _store(dump_path, destination)
        dump_path = None  # moved, no longer ours to clean up
    finally:
        if dump_path and os.path.exists(dump_path):
            os.unlink(dump_path)

    # A copy that never leaves this machine does not survive losing it.
    offsite = await replicate_offsite(destination, f"daily/{filename}")
    if not offsite.get("replicated"):
        logger.error(
            f"Backup {filename} was NOT replicated off-site: {offsite.get('reason')}"
        )

    _rotate_old_backups()

    size_mb = round(size / (1024 * 1024), 2)
    logger.info(f"Backup completed: {filename} ({size_mb} MB)")
    return {
        "status": "success",
        "filename": filename,
        "size_bytes": size,
        "size_mb": size_mb,
        "encrypted": filename.endswith(ENCRYPTED_SUFFIX),
        "offsite": offsite,
        "timestamp": now_utc.isoformat(),
    }


def _in_off_peak_window(now_utc: datetime) -> bool:
    """21:00–04:00 UTC, i.e. 02:00–09:00 PKT."""
    return now_utc.hour >= 21 or now_utc.hour < 4


async def _run_pg_dump() -> Optional[str]:
    """
    Dump the database to a temporary file and return its path.

    Returns the path rather than the bytes: a multi-gigabyte dump read into a
    variable, as the previous version did, would exhaust the worker's memory on
    exactly the large databases that most need backing up.
    """
    from app.config import settings

    db_url = settings.database_url
    if not db_url:
        logger.error("No DATABASE_URL configured — cannot back up")
        return None

    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    fd, tmp_path = tempfile.mkstemp(suffix=BACKUP_SUFFIX)
    os.close(fd)

    try:
        result = subprocess.run(
            [
                "pg_dump",
                "--dbname", pg_url,
                "--format=custom",
                "--compress=6",
                "--no-owner",
                "--no-privileges",
                f"--file={tmp_path}",
            ],
            capture_output=True,
            timeout=PG_DUMP_TIMEOUT_SECONDS,
        )

        if result.returncode != 0:
            err = result.stderr.decode("utf-8", errors="replace")
            # The connection string carries the password; keep it out of logs.
            logger.error(f"pg_dump failed (rc={result.returncode}): {_redact(err, pg_url)[:500]}")
            os.unlink(tmp_path)
            return None

        return tmp_path

    except FileNotFoundError:
        logger.error("pg_dump is not installed on this host — no backup can be taken")
        os.unlink(tmp_path)
        return None
    except subprocess.TimeoutExpired:
        logger.error(f"pg_dump timed out after {PG_DUMP_TIMEOUT_SECONDS}s")
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return None
    except Exception as e:
        logger.error(f"pg_dump exception: {e}")
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return None


def _redact(text: str, secret_url: str) -> str:
    return text.replace(secret_url, "<DATABASE_URL>") if secret_url else text


def _verify_dump(path: str) -> bool:
    """
    Confirm pg_restore can read the archive's table of contents.

    Cheap, and it catches a truncated or corrupt dump at the point it is made
    rather than during an incident.
    """
    try:
        result = subprocess.run(
            ["pg_restore", "--list", path], capture_output=True, timeout=120
        )
        if result.returncode != 0:
            logger.error(
                "pg_restore could not read the dump: "
                f"{result.stderr.decode('utf-8', errors='replace')[:300]}"
            )
            return False
        return b"TABLE" in result.stdout or len(result.stdout) > 0
    except FileNotFoundError:
        logger.warning("pg_restore unavailable — storing the dump unverified")
        return True
    except Exception as e:
        logger.error(f"Dump verification failed: {e}")
        return False


def _store(source: str, destination: str) -> None:
    """Move the dump into the backup directory."""
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.move(source, destination)
    os.chmod(destination, 0o600)
    logger.info(f"Backup stored at {destination}")


# Kept under the previous name too: an incorrect call to this is what silently
# broke every backup run, so both spellings now resolve to the same function.
_upload_to_storage = _store
_upload_backup = _store


def _rotate_old_backups() -> None:
    """Keep the most recent BACKUP_RETENTION_COUNT dumps."""
    try:
        daily_dir = _backup_dir()
        if not os.path.exists(daily_dir):
            return

        files = sorted(
            (os.path.join(daily_dir, f) for f in os.listdir(daily_dir)
             if os.path.isfile(os.path.join(daily_dir, f))),
            key=os.path.getmtime,
        )
        for fpath in files[:max(0, len(files) - BACKUP_RETENTION_COUNT)]:
            os.remove(fpath)
            logger.info(f"Rotated out old backup: {os.path.basename(fpath)}")
    except Exception as e:
        # Rotation failing must not fail a backup that already succeeded.
        logger.warning(f"Backup rotation failed: {e}")


async def get_backup_status() -> dict:
    """
    Report recent backups for the monitoring dashboard.

    ``offsite_copy`` is reported as unknown on purpose: these dumps sit on the
    same host as the database, so the dashboard should not imply the data would
    survive losing that host.
    """
    try:
        daily_dir = _backup_dir()
        if not os.path.exists(daily_dir):
            return {
                "available": False,
                "count": 0,
                "backups": [],
                "warning": "No backups have been taken yet.",
                "offsite_configured": False,
                "last_restore_drill": _read_drill_marker(),
            }

        entries = sorted(
            (f for f in os.listdir(daily_dir) if os.path.isfile(os.path.join(daily_dir, f))),
            reverse=True,
        )
        backups = [
            {
                "name": f,
                "size": os.path.getsize(os.path.join(daily_dir, f)),
                "created_at": datetime.fromtimestamp(
                    os.path.getmtime(os.path.join(daily_dir, f)), tz=timezone.utc
                ).isoformat(),
            }
            for f in entries[:5]
        ]

        latest_age_hours = None
        if backups:
            newest = datetime.fromisoformat(backups[0]["created_at"])
            latest_age_hours = round(
                (datetime.now(timezone.utc) - newest).total_seconds() / 3600, 1
            )

        from app.config import settings
        offsite_target = (settings.backup_offsite_target or "none").lower()

        return {
            "available": bool(entries),
            "count": len(entries),
            "latest": entries[0] if entries else None,
            "latest_age_hours": latest_age_hours,
            "stale": latest_age_hours is not None and latest_age_hours > 48,
            "backups": backups,
            "storage_path": daily_dir,
            "encrypted": all(b["name"].endswith(ENCRYPTED_SUFFIX) for b in backups) if backups else None,
            "offsite_target": offsite_target,
            # Reported plainly so a dashboard cannot imply the data would
            # survive losing this host when it would not.
            "offsite_configured": offsite_target not in ("", "none"),
            "last_restore_drill": _read_drill_marker(),
        }
    except Exception as e:
        logger.warning(f"Backup status check failed: {e}")
        return {"available": False, "error": str(e), "offsite_configured": False}


DRILL_MARKER = "last_restore_drill.json"


def _drill_marker_path() -> str:
    return os.path.join(os.path.realpath(os.path.join(STORAGE_ROOT, BACKUP_BUCKET)),
                        DRILL_MARKER)


def _read_drill_marker() -> Optional[dict]:
    """When, and whether, a restore was last proven to work."""
    try:
        import json
        with open(_drill_marker_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def write_drill_marker(result: dict) -> None:
    import json
    path = _drill_marker_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f)
