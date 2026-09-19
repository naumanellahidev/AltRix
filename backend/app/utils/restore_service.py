"""
Restore, and proving that restore works.

There was no restore capability of any kind. Dumps were produced (in theory),
stored, and rotated — and nothing could turn one back into a database. A backup
that has never been restored is a hypothesis, not a recovery plan, and the usual
way that hypothesis gets tested is during an outage, which is the worst possible
moment to discover the archive is unreadable or the encryption key is gone.

This module does three things:

``restore_backup``     turn a specific dump into a live database. Deliberately
                       explicit about its target, because pointing a restore at
                       production by accident destroys the thing you were trying
                       to save.
``run_restore_drill``  restore the newest dump into a scratch database, count
                       what came back, throw the scratch database away, and
                       record the result. Scheduled weekly.
``list_restorable``    what is actually available to restore from, including
                       whether each file needs the encryption key.
"""
import json
import logging
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse, urlunparse

from app.utils.backup_service import (
    BACKUP_SUFFIX,
    ENCRYPTED_SUFFIX,
    _backup_dir,
    write_drill_marker,
)
from app.utils.backup_storage import decrypt_file, is_encrypted

logger = logging.getLogger("app.restore")

PG_RESTORE_TIMEOUT_SECONDS = 3600  # 1 hour

#: Tables whose row counts are compared after a drill. If a restore "succeeds"
#: but these come back empty, it did not really work.
DRILL_SAMPLE_TABLES = ["schools", "students", "user_roles", "fee_invoices"]


class RestoreError(RuntimeError):
    pass


# ─── Inventory ────────────────────────────────────────────────────────────────

def list_restorable() -> list:
    """Every dump on local disk, newest first."""
    daily = _backup_dir()
    if not os.path.isdir(daily):
        return []

    out = []
    for name in sorted(os.listdir(daily), reverse=True):
        path = os.path.join(daily, name)
        if not os.path.isfile(path) or not name.startswith("backup_"):
            continue
        out.append({
            "name": name,
            "path": path,
            "size_bytes": os.path.getsize(path),
            "created_at": datetime.fromtimestamp(
                os.path.getmtime(path), tz=timezone.utc
            ).isoformat(),
            "encrypted": name.endswith(ENCRYPTED_SUFFIX) or is_encrypted(path),
        })
    return out


def newest_backup() -> Optional[dict]:
    items = list_restorable()
    return items[0] if items else None


# ─── Restore ──────────────────────────────────────────────────────────────────

def _pg_url(database_url: str) -> str:
    return database_url.replace("postgresql+asyncpg://", "postgresql://")


def _swap_database(pg_url: str, dbname: str) -> str:
    parts = urlparse(pg_url)
    return urlunparse(parts._replace(path=f"/{dbname}"))


def _redact(text: str, secret: str) -> str:
    return text.replace(secret, "<DATABASE_URL>") if secret else text


def restore_backup(
    backup_path: str,
    target_url: str,
    *,
    allow_production: bool = False,
    clean: bool = True,
) -> dict:
    """
    Restore ``backup_path`` into the database named by ``target_url``.

    ``allow_production`` must be passed explicitly to restore over the database
    the application is currently configured to use. Without that guard a
    mistyped target during an incident overwrites live data with an older copy —
    turning a recoverable problem into an unrecoverable one.
    """
    from app.config import settings

    if not os.path.isfile(backup_path):
        raise RestoreError(f"No such backup: {backup_path}")

    configured = _pg_url(settings.database_url or "")
    if configured and not allow_production:
        same = urlparse(target_url).path == urlparse(configured).path and \
               urlparse(target_url).hostname == urlparse(configured).hostname
        if same:
            raise RestoreError(
                "Refusing to restore over the live database. Pass "
                "allow_production=True (or --i-understand-this-overwrites-production) "
                "only when that is genuinely what you intend."
            )

    work_dir = tempfile.mkdtemp(prefix="altrix-restore-")
    plain_path = backup_path
    try:
        if is_encrypted(backup_path):
            logger.info("Backup is encrypted; decrypting before restore")
            plain_path = os.path.join(work_dir, "decrypted" + BACKUP_SUFFIX)
            decrypt_file(backup_path, plain_path)

        # Not --exit-on-error: pg_restore raises on benign things like an
        # extension that already exists, and aborting there would leave a
        # half-restored database. Errors are judged from the output below.
        cmd = [
            "pg_restore",
            "--dbname", target_url,
            "--no-owner",
            "--no-privileges",
            "--verbose",
        ]
        if clean:
            cmd += ["--clean", "--if-exists"]
        cmd.append(plain_path)

        logger.info(f"Restoring {os.path.basename(backup_path)} into target database")
        result = subprocess.run(
            cmd, capture_output=True, timeout=PG_RESTORE_TIMEOUT_SECONDS
        )
        stderr = _redact(result.stderr.decode("utf-8", errors="replace"), target_url)

        # pg_restore exits non-zero for warnings too, so judge on content.
        fatal = [ln for ln in stderr.splitlines() if "error:" in ln.lower()]
        if result.returncode != 0 and fatal:
            raise RestoreError(
                "pg_restore reported errors:\n" + "\n".join(fatal[:20])
            )

        logger.info("Restore completed")
        return {
            "status": "success",
            "backup": os.path.basename(backup_path),
            "warnings": len([l for l in stderr.splitlines() if "warning" in l.lower()]),
        }

    except subprocess.TimeoutExpired:
        raise RestoreError(
            f"pg_restore timed out after {PG_RESTORE_TIMEOUT_SECONDS}s"
        )
    except FileNotFoundError:
        raise RestoreError(
            "pg_restore is not installed on this host. The Docker image ships "
            "postgresql-client; run this inside the container."
        )
    finally:
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)


# ─── Drill ────────────────────────────────────────────────────────────────────

_SAFE_DB_NAME = re.compile(r"^[A-Za-z0-9_]{1,50}$")


def run_restore_drill() -> dict:
    """
    Prove the newest backup can actually be restored.

    Restores into a throwaway database, checks that recognisable data came back,
    then drops it. Records the outcome so the dashboard can show when recovery
    was last demonstrated rather than assumed.
    """
    from app.config import settings

    started = datetime.now(timezone.utc)
    newest = newest_backup()
    if not newest:
        result = {"status": "failed", "reason": "no backups exist",
                  "checked_at": started.isoformat()}
        write_drill_marker(result)
        return result

    scratch = f"altrix_drill_{started.strftime('%Y%m%d%H%M%S')}"
    assert _SAFE_DB_NAME.match(scratch)

    admin_url = _pg_url(settings.database_url or "")
    if not admin_url:
        result = {"status": "failed", "reason": "DATABASE_URL not configured",
                  "checked_at": started.isoformat()}
        write_drill_marker(result)
        return result

    maintenance_url = _swap_database(admin_url, "postgres")
    target_url = _swap_database(admin_url, scratch)

    try:
        _psql(maintenance_url, f'CREATE DATABASE "{scratch}"')
    except Exception as e:
        result = {
            "status": "failed",
            "reason": f"could not create a scratch database: {e}",
            "backup": newest["name"],
            "checked_at": started.isoformat(),
        }
        write_drill_marker(result)
        return result

    try:
        restore_backup(newest["path"], target_url,
                       allow_production=True,  # scratch db, not production
                       clean=False)

        counts = {}
        for table in DRILL_SAMPLE_TABLES:
            try:
                counts[table] = _scalar(target_url, f'SELECT count(*) FROM public."{table}"')
            except Exception:
                counts[table] = None

        restored_anything = any(v for v in counts.values() if v)
        result = {
            "status": "success" if restored_anything else "failed",
            "backup": newest["name"],
            "encrypted": newest["encrypted"],
            "row_counts": counts,
            "checked_at": started.isoformat(),
            "duration_seconds": round(
                (datetime.now(timezone.utc) - started).total_seconds(), 1
            ),
        }
        if not restored_anything:
            # A restore that completes but produces no rows is the failure mode
            # that looks most like success.
            result["reason"] = "restore completed but no rows were found"

    except Exception as e:
        result = {"status": "failed", "reason": str(e),
                  "backup": newest["name"], "checked_at": started.isoformat()}
    finally:
        try:
            _psql(maintenance_url, f'DROP DATABASE IF EXISTS "{scratch}"')
        except Exception as e:
            logger.error(f"Could not drop the scratch database {scratch}: {e}")
            result["cleanup_warning"] = f"scratch database {scratch} was left behind"

    write_drill_marker(result)
    if result["status"] != "success":
        logger.error(f"RESTORE DRILL FAILED: {result.get('reason')}")
    else:
        logger.info(f"Restore drill passed for {result['backup']}")
    return result


def _psql(url: str, statement: str) -> None:
    result = subprocess.run(
        ["psql", "--dbname", url, "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
         "-c", statement],
        capture_output=True, timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(
            _redact(result.stderr.decode("utf-8", errors="replace"), url)[:300]
        )


def _scalar(url: str, query: str) -> Optional[int]:
    result = subprocess.run(
        ["psql", "--dbname", url, "--no-psqlrc", "-tA", "-c", query],
        capture_output=True, timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(
            _redact(result.stderr.decode("utf-8", errors="replace"), url)[:300]
        )
    out = result.stdout.decode().strip()
    return int(out) if out.isdigit() else None
