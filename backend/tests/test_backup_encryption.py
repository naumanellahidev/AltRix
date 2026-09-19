"""
Backup encryption and off-box copy tests.

A dump of this database contains every student's name, address, guardian
contacts, medical notes and fee history. These cover the two properties that
matter: the file on disk is unreadable without the key, and it is genuinely the
same bytes when it comes back — because an encryption bug is only discovered
during a restore, when it is too late to do anything about it.
"""
import base64
import os

import pytest

from app.utils import backup_storage as bstore


KEY = base64.b64encode(b"0" * 32).decode()


@pytest.fixture
def keyed(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "backup_encryption_key", KEY)
    return KEY


@pytest.fixture
def unkeyed(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "backup_encryption_key", "")


# --- Round trip --------------------------------------------------------------

def test_encrypt_decrypt_returns_the_original_bytes(keyed, tmp_path):
    payload = os.urandom(200_000)
    src = tmp_path / "dump"; src.write_bytes(payload)
    enc = tmp_path / "dump.enc"
    dec = tmp_path / "dump.out"

    bstore.encrypt_file(str(src), str(enc))
    bstore.decrypt_file(str(enc), str(dec))

    assert dec.read_bytes() == payload, "a restore would produce a corrupt database"


def test_ciphertext_does_not_contain_the_plaintext(keyed, tmp_path):
    secret = b"Ayesha Khan, 12 Model Town, guardian +92 300 0000000"
    src = tmp_path / "dump"; src.write_bytes(secret * 100)
    enc = tmp_path / "dump.enc"
    bstore.encrypt_file(str(src), str(enc))
    assert secret not in enc.read_bytes()


def test_each_encryption_uses_a_fresh_nonce(keyed, tmp_path):
    """Reusing a nonce under one key breaks AES-GCM outright."""
    src = tmp_path / "dump"; src.write_bytes(b"same input")
    outs = []
    for i in range(5):
        out = tmp_path / f"e{i}.enc"
        bstore.encrypt_file(str(src), str(out))
        outs.append(out.read_bytes())
    assert len(set(outs)) == 5


# --- Tamper detection --------------------------------------------------------

def test_a_modified_backup_is_refused(keyed, tmp_path):
    """
    AES-GCM authenticates. A dump altered in the bucket must fail loudly rather
    than restore silently corrupted data.
    """
    src = tmp_path / "dump"; src.write_bytes(b"x" * 5000)
    enc = tmp_path / "dump.enc"
    bstore.encrypt_file(str(src), str(enc))

    blob = bytearray(enc.read_bytes())
    blob[-1] ^= 0x01
    enc.write_bytes(bytes(blob))

    with pytest.raises(Exception):
        bstore.decrypt_file(str(enc), str(tmp_path / "out"))


def test_decrypting_with_the_wrong_key_fails(keyed, tmp_path, monkeypatch):
    src = tmp_path / "dump"; src.write_bytes(b"payload" * 100)
    enc = tmp_path / "dump.enc"
    bstore.encrypt_file(str(src), str(enc))

    from app.config import settings
    monkeypatch.setattr(settings, "backup_encryption_key",
                        base64.b64encode(b"1" * 32).decode())
    with pytest.raises(Exception):
        bstore.decrypt_file(str(enc), str(tmp_path / "out"))


def test_encrypted_files_are_recognisable(keyed, tmp_path):
    """The restore path has to tell encrypted from plain without being told."""
    plain = tmp_path / "plain"; plain.write_bytes(b"PGDMP not encrypted")
    enc = tmp_path / "e.enc"
    bstore.encrypt_file(str(plain), str(enc))

    assert bstore.is_encrypted(str(enc)) is True
    assert bstore.is_encrypted(str(plain)) is False
    assert bstore.is_encrypted(str(tmp_path / "missing")) is False


# --- Key handling ------------------------------------------------------------

def test_no_key_means_no_encryption(unkeyed):
    assert bstore.encryption_available() is False


def test_missing_key_on_decrypt_says_why(unkeyed, tmp_path):
    f = tmp_path / "x.enc"; f.write_bytes(bstore.MAGIC + b"0" * 40)
    with pytest.raises(bstore.BackupKeyMissing) as exc:
        bstore.decrypt_file(str(f), str(tmp_path / "out"))
    assert "cannot be restored" in str(exc.value)


@pytest.mark.parametrize("bad", ["not-base64!!", base64.b64encode(b"short").decode()])
def test_a_malformed_key_is_rejected_not_ignored(monkeypatch, bad):
    """Silently skipping encryption because the key is malformed is worse."""
    from app.config import settings
    monkeypatch.setattr(settings, "backup_encryption_key", bad)
    assert bstore.encryption_available() is False


def test_generated_keys_are_the_right_size_and_unique():
    keys = {bstore.generate_key_b64() for _ in range(50)}
    assert len(keys) == 50
    for k in keys:
        assert len(base64.b64decode(k)) == 32


# --- Off-box copies ----------------------------------------------------------

@pytest.mark.asyncio
async def test_no_mirror_is_reported_but_download_still_offered(monkeypatch, tmp_path):
    """
    "Backups exist" and "backups would survive losing this host" are different
    claims. The second must not be implied when it is not true — but downloading
    from the dashboard always works, so this is a warning, not a dead end.
    """
    from app.config import settings
    monkeypatch.setattr(settings, "backup_offsite_target", "none")

    f = tmp_path / "b.dump"; f.write_bytes(b"x")
    result = await bstore.replicate_offsite(str(f), "daily/b.dump")

    assert result["replicated"] is False
    assert result["download_available"] is True
    assert "BACKUP_MIRROR_PATH" in result["reason"]


@pytest.mark.asyncio
async def test_mirror_writes_a_real_second_copy(monkeypatch, tmp_path):
    from app.config import settings
    mirror = tmp_path / "mirror"
    monkeypatch.setattr(settings, "backup_offsite_target", "path")
    monkeypatch.setattr(settings, "backup_mirror_path", str(mirror))

    payload = b"PGDMP" + b"x" * 500
    src = tmp_path / "backups" / "daily" / "b.dump"
    src.parent.mkdir(parents=True)
    src.write_bytes(payload)

    result = await bstore.replicate_offsite(str(src), "daily/b.dump")

    assert result["replicated"] is True
    copied = mirror / "daily" / "b.dump"
    assert copied.read_bytes() == payload, "the mirror must be byte-identical"


@pytest.mark.asyncio
async def test_mirror_pointing_at_the_backup_directory_is_refused(monkeypatch, tmp_path):
    """Copying a file next to itself is not a second copy."""
    from app.config import settings
    backups = tmp_path / "altrix-backups" / "daily"
    backups.mkdir(parents=True)
    src = backups / "b.dump"; src.write_bytes(b"x")

    monkeypatch.setattr(settings, "backup_offsite_target", "path")
    monkeypatch.setattr(settings, "backup_mirror_path", str(tmp_path / "altrix-backups"))

    result = await bstore.replicate_offsite(str(src), "daily/b.dump")
    assert result["replicated"] is False
    assert "not a second copy" in result["reason"]


@pytest.mark.asyncio
async def test_mirror_without_a_path_is_reported(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "backup_offsite_target", "path")
    monkeypatch.setattr(settings, "backup_mirror_path", "")
    f = tmp_path / "b.dump"; f.write_bytes(b"x")
    result = await bstore.replicate_offsite(str(f), "daily/b.dump")
    assert result["replicated"] is False
    assert "BACKUP_MIRROR_PATH" in result["reason"]


@pytest.mark.asyncio
async def test_unknown_target_is_reported(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "backup_offsite_target", "dropbox")
    f = tmp_path / "b.dump"; f.write_bytes(b"x")
    result = await bstore.replicate_offsite(str(f), "daily/b.dump")
    assert result["replicated"] is False
    assert "Unknown" in result["reason"]


@pytest.mark.asyncio
async def test_replication_failure_does_not_raise(monkeypatch, tmp_path):
    """
    A local backup that failed to mirror is still worth keeping; the caller
    records the failure rather than losing the dump to an exception.
    """
    from app.config import settings
    monkeypatch.setattr(settings, "backup_offsite_target", "path")

    def boom(*a, **k):
        raise RuntimeError("mirror volume unreachable")

    monkeypatch.setattr(bstore, "_replicate_to_path", boom)
    f = tmp_path / "b.dump"; f.write_bytes(b"x")

    result = await bstore.replicate_offsite(str(f), "daily/b.dump")
    assert result["replicated"] is False
    assert "mirror volume unreachable" in result["reason"]


def test_nothing_here_depends_on_a_hosted_service():
    """Backups run against this VPS and its Postgres, nothing else."""
    import inspect
    src = inspect.getsource(bstore).lower()
    assert "supabase" not in src
