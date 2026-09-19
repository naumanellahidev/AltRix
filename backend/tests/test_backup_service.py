"""
Backup service tests.

A backup system is only dangerous when it is quiet: this one had never produced
a single dump, and nothing anywhere said so. These tests cover the three faults
that caused that, and the guarantee that matters most — a dump that cannot be
restored is never kept and never reported as success.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest

from app.utils import backup_service as bs


@pytest.fixture
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr(bs, "STORAGE_ROOT", str(tmp_path))
    return tmp_path


@pytest.fixture
def off_peak(monkeypatch):
    monkeypatch.setattr(bs, "_in_off_peak_window", lambda _now: True)


def _fake_dump(tmp_path, content=b"PGDMP-fake-archive", name="dump.tmp"):
    p = tmp_path / name
    p.write_bytes(content)
    return str(p)


# --- The three faults that stopped backups running --------------------------

def test_the_name_the_caller_used_actually_exists():
    """
    run_backup used to call _upload_backup(), but the function was named
    _upload_to_storage. Every run raised NameError into a bare `except`, so it
    reported an error dict and nobody noticed.
    """
    assert callable(getattr(bs, "_upload_backup", None))
    assert callable(getattr(bs, "_upload_to_storage", None))
    assert bs._upload_backup is bs._store


def test_the_task_is_registered_with_celery():
    """It was never registered at all, so beat had nothing to schedule."""
    from app.celery_app import celery_app
    import app.tasks.backup_tasks  # noqa: F401

    assert "app.tasks.backup_tasks.run_daily_backup" in celery_app.tasks


def test_the_schedule_is_a_crontab_not_an_interval():
    """
    An interval fires relative to beat's start time, so a process restarted at
    midday would fire at midday daily and be rejected by the off-peak guard
    every single time.
    """
    from celery.schedules import crontab
    from app.celery_app import celery_app

    entry = celery_app.conf.beat_schedule["daily-db-backup"]
    assert isinstance(entry["schedule"], crontab)


def test_the_task_routes_to_a_queue_the_worker_consumes():
    """The deployed worker consumes default,emails,pdfs,ai."""
    from app.celery_app import celery_app

    route = celery_app.conf.task_routes["app.tasks.backup_tasks.*"]
    assert route["queue"] in {"default", "emails", "pdfs", "ai"}


# --- A bad dump is never kept and never called a success --------------------

@pytest.mark.asyncio
async def test_empty_dump_is_rejected(storage, off_peak, monkeypatch, tmp_path):
    async def _dump():
        return _fake_dump(tmp_path, content=b"")

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    with pytest.raises(RuntimeError, match="empty"):
        await bs.run_backup()


@pytest.mark.asyncio
async def test_oversized_dump_is_rejected(storage, off_peak, monkeypatch, tmp_path):
    monkeypatch.setattr(bs, "BACKUP_MAX_SIZE_BYTES", 10)

    async def _dump():
        return _fake_dump(tmp_path, content=b"x" * 100)

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    monkeypatch.setattr(bs, "_verify_dump", lambda p: True)
    with pytest.raises(RuntimeError, match="limit"):
        await bs.run_backup()


@pytest.mark.asyncio
async def test_unrestorable_dump_is_discarded_not_stored(storage, off_peak, monkeypatch, tmp_path):
    """
    An archive that pg_restore cannot read looks like protection right up until
    someone needs it. It must not be kept.
    """
    async def _dump():
        return _fake_dump(tmp_path, content=b"corrupted")

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    monkeypatch.setattr(bs, "_verify_dump", lambda p: False)

    with pytest.raises(RuntimeError, match="integrity"):
        await bs.run_backup()

    assert not os.path.exists(bs._backup_dir()) or not os.listdir(bs._backup_dir())


@pytest.mark.asyncio
async def test_failure_does_not_leave_the_temp_file_behind(storage, off_peak, monkeypatch, tmp_path):
    leftover = _fake_dump(tmp_path, content=b"corrupted")

    async def _dump():
        return leftover

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    monkeypatch.setattr(bs, "_verify_dump", lambda p: False)

    with pytest.raises(RuntimeError):
        await bs.run_backup()
    assert not os.path.exists(leftover)


@pytest.mark.asyncio
async def test_missing_dump_raises_rather_than_returning_an_error_dict(storage, off_peak, monkeypatch):
    """
    Returning {"status": "error"} reads as success to Celery, so nothing retries
    and nothing alerts. It has to raise.
    """
    async def _dump():
        return None

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    with pytest.raises(RuntimeError):
        await bs.run_backup()


# --- The happy path ----------------------------------------------------------

@pytest.mark.asyncio
async def test_a_good_dump_is_stored_with_a_truthful_extension(storage, off_peak, monkeypatch, tmp_path):
    async def _dump():
        return _fake_dump(tmp_path, content=b"PGDMP" + b"x" * 500)

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    monkeypatch.setattr(bs, "_verify_dump", lambda p: True)

    result = await bs.run_backup()
    assert result["status"] == "success"

    stored = os.listdir(bs._backup_dir())
    assert len(stored) == 1
    # --format=custom is a pg_restore archive, not gzipped SQL. Calling it
    # ".sql.gz" would send a restore runbook down the wrong path.
    assert stored[0].endswith(".dump")
    assert not stored[0].endswith(".sql.gz")


@pytest.mark.asyncio
async def test_peak_hours_skip_unless_forced(storage, monkeypatch, tmp_path):
    monkeypatch.setattr(bs, "_in_off_peak_window", lambda _now: False)

    async def _dump():
        return _fake_dump(tmp_path, content=b"PGDMP" + b"x" * 100)

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    monkeypatch.setattr(bs, "_verify_dump", lambda p: True)

    assert (await bs.run_backup())["status"] == "skipped"
    assert (await bs.run_backup(force=True))["status"] == "success"


def test_off_peak_window_covers_the_intended_hours():
    def at(hour):
        return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)

    assert bs._in_off_peak_window(at(21))
    assert bs._in_off_peak_window(at(2))
    assert not bs._in_off_peak_window(at(10))
    assert not bs._in_off_peak_window(at(20))


# --- Rotation and reporting --------------------------------------------------

def test_rotation_keeps_the_newest_and_drops_the_rest(storage, monkeypatch):
    monkeypatch.setattr(bs, "BACKUP_RETENTION_COUNT", 3)
    d = bs._backup_dir()
    os.makedirs(d, exist_ok=True)
    for i in range(6):
        p = os.path.join(d, f"backup_{i}.dump")
        open(p, "wb").write(b"x")
        os.utime(p, (1_600_000_000 + i * 60, 1_600_000_000 + i * 60))

    bs._rotate_old_backups()
    left = sorted(os.listdir(d))
    assert len(left) == 3
    assert left == ["backup_3.dump", "backup_4.dump", "backup_5.dump"]


@pytest.mark.asyncio
async def test_status_reports_when_nothing_has_ever_been_backed_up(storage):
    status = await bs.get_backup_status()
    assert status["available"] is False
    assert status["count"] == 0
    assert "warning" in status


@pytest.mark.asyncio
async def test_status_flags_a_stale_backup(storage):
    d = bs._backup_dir()
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "backup_old.dump")
    open(p, "wb").write(b"x")
    old = (datetime.now(timezone.utc) - timedelta(days=5)).timestamp()
    os.utime(p, (old, old))

    status = await bs.get_backup_status()
    assert status["available"] is True
    assert status["stale"] is True
    assert status["latest_age_hours"] > 48


@pytest.mark.asyncio
async def test_status_reports_offsite_honestly(storage, monkeypatch):
    """
    "Backups exist" and "backups would survive losing this host" are different
    claims. The dashboard must not imply the second when only the first is true.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "backup_offsite_target", "none")
    assert (await bs.get_backup_status())["offsite_configured"] is False

    monkeypatch.setattr(settings, "backup_offsite_target", "supabase")
    d = bs._backup_dir()
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "backup_x.dump.enc"), "wb").write(b"x")

    status = await bs.get_backup_status()
    assert status["offsite_configured"] is True
    assert status["offsite_target"] == "supabase"


@pytest.mark.asyncio
async def test_status_reports_whether_recovery_was_ever_proven(storage):
    """
    A backup nobody has restored is a hypothesis. The dashboard shows when a
    restore was last demonstrated rather than leaving it assumed.
    """
    status = await bs.get_backup_status()
    assert status["last_restore_drill"] is None

    bs.write_drill_marker({"status": "success", "checked_at": "2026-09-17T22:30:00Z"})
    assert (await bs.get_backup_status())["last_restore_drill"]["status"] == "success"


@pytest.mark.asyncio
async def test_production_refuses_to_store_an_unencrypted_dump(storage, off_peak, monkeypatch, tmp_path):
    """
    A dump holds every student's personal data. In production it is encrypted or
    it is not written.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "backup_encryption_key", "")

    async def _dump():
        return _fake_dump(tmp_path, content=b"PGDMP" + b"x" * 500)

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    monkeypatch.setattr(bs, "_verify_dump", lambda p: True)

    with pytest.raises(bs.BackupKeyMissing):
        await bs.run_backup()
    assert not os.path.exists(bs._backup_dir()) or not os.listdir(bs._backup_dir())


@pytest.mark.asyncio
async def test_a_stored_dump_is_encrypted_and_replicated(storage, off_peak, monkeypatch, tmp_path):
    import base64

    from app.config import settings

    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "backup_encryption_key",
                        base64.b64encode(b"0" * 32).decode())

    async def _dump():
        return _fake_dump(tmp_path, content=b"PGDMP" + b"x" * 500)

    calls = {}

    async def _replicate(path, name):
        calls["name"] = name
        return {"replicated": True, "target": "supabase", "location": f"supabase://{name}"}

    monkeypatch.setattr(bs, "_run_pg_dump", _dump)
    monkeypatch.setattr(bs, "_verify_dump", lambda p: True)
    monkeypatch.setattr(bs, "replicate_offsite", _replicate)

    result = await bs.run_backup()

    assert result["encrypted"] is True
    assert result["offsite"]["replicated"] is True
    stored = os.listdir(bs._backup_dir())
    assert stored[0].endswith(".dump.enc")
    # What left the machine is the encrypted file, not the plaintext dump.
    assert calls["name"].endswith(".dump.enc")
