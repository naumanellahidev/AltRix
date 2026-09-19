"""
Backup encryption and off-box copies.

Everything here runs against this VPS and its Postgres. There is no dependency
on any hosted service.

Two problems this solves.

*Dumps were plaintext.* A dump of this database contains every student's name,
address, guardian contact details, medical notes and fee history. Sitting
unencrypted on the server's disk, anyone who reaches that filesystem has the
entire customer base's personal data. Dumps are now AES-256-GCM encrypted.

*Dumps never left the machine.* A copy beside the database protects against a
dropped table; it does not protect against losing the host, which is what people
mean when they ask whether backups exist. Getting a copy off the box happens two
ways, and both are always available:

1. **Download** from the Super Admin dashboard. The operator keeps the file
   wherever they choose, and can upload it back to restore. This needs no
   third-party account and no extra credentials.
2. **Automatic mirror** to a second path — another mounted disk, an NFS share, a
   rsync target — set with ``BACKUP_MIRROR_PATH``. Optional, and useful when you
   want the copy made without anyone remembering to click.

An S3-compatible target is also supported for anyone who wants it, but nothing
requires it.

The encryption key is needed to restore, so it must be stored somewhere that
survives losing the server and somewhere other than the backups themselves.
docs/backup-restore.md covers this.
"""
import base64
import logging
import os
import secrets
import shutil
from typing import Optional

logger = logging.getLogger("app.backup.storage")

#: AES-GCM nonce length. 96 bits is the size the mode is defined for.
NONCE_BYTES = 12

#: Written at the head of every encrypted file so the restore path can tell an
#: encrypted dump from a plain one without being told.
MAGIC = b"ALTRIXENC1"


class BackupKeyMissing(RuntimeError):
    """Raised when encryption is required but no key is configured."""


def generate_key_b64() -> str:
    """Generate a fresh 256-bit key, base64-encoded. For operator use."""
    return base64.b64encode(secrets.token_bytes(32)).decode()


def _load_key() -> Optional[bytes]:
    from app.config import settings

    raw = (getattr(settings, "backup_encryption_key", "") or "").strip()
    if not raw:
        return None
    try:
        key = base64.b64decode(raw)
    except Exception as e:
        raise BackupKeyMissing(f"BACKUP_ENCRYPTION_KEY is not valid base64: {e}")
    if len(key) != 32:
        raise BackupKeyMissing(
            f"BACKUP_ENCRYPTION_KEY must decode to 32 bytes, got {len(key)}"
        )
    return key


def encryption_available() -> bool:
    try:
        return _load_key() is not None
    except BackupKeyMissing:
        return False


def encrypt_file(source: str, destination: str) -> None:
    """
    Encrypt ``source`` to ``destination`` with AES-256-GCM.

    The file is held in memory for the AEAD operation, which is bounded by the
    same 5 GB ceiling the backup enforces. Beyond that this would need chunked
    framing rather than a larger machine.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _load_key()
    if key is None:
        raise BackupKeyMissing("No BACKUP_ENCRYPTION_KEY configured")

    nonce = secrets.token_bytes(NONCE_BYTES)
    with open(source, "rb") as f:
        plaintext = f.read()

    ciphertext = AESGCM(key).encrypt(nonce, plaintext, MAGIC)

    with open(destination, "wb") as out:
        out.write(MAGIC)
        out.write(nonce)
        out.write(ciphertext)
    os.chmod(destination, 0o600)


def is_encrypted(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(len(MAGIC)) == MAGIC
    except OSError:
        return False


def decrypt_file(source: str, destination: str) -> None:
    """Reverse of :func:`encrypt_file`. Used by restore and by download."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _load_key()
    if key is None:
        raise BackupKeyMissing(
            "This backup is encrypted but no BACKUP_ENCRYPTION_KEY is configured. "
            "Without the key the dump cannot be restored."
        )

    with open(source, "rb") as f:
        blob = f.read()

    if not blob.startswith(MAGIC):
        raise ValueError("Not an AltRix encrypted backup")

    nonce = blob[len(MAGIC):len(MAGIC) + NONCE_BYTES]
    ciphertext = blob[len(MAGIC) + NONCE_BYTES:]
    plaintext = AESGCM(key).decrypt(nonce, ciphertext, MAGIC)

    with open(destination, "wb") as out:
        out.write(plaintext)
    os.chmod(destination, 0o600)


# ─── Off-box copies ───────────────────────────────────────────────────────────

async def replicate_offsite(local_path: str, object_name: str) -> dict:
    """
    Make a copy that does not depend on this server's disk.

    Returns a result dict rather than raising: a backup that exists locally but
    failed to mirror is still worth keeping, and the caller records the failure
    so the dashboard can show that off-box protection is not currently working.

    Downloading from the dashboard is always available and needs no
    configuration, so "no mirror configured" is a warning rather than an error.
    """
    from app.config import settings

    target = (getattr(settings, "backup_offsite_target", "") or "none").strip().lower()

    try:
        if target in ("", "none"):
            return {
                "replicated": False,
                "target": "none",
                "download_available": True,
                "reason": (
                    "No automatic mirror configured. Backups can still be "
                    "downloaded from the Super Admin dashboard and kept off the "
                    "server; set BACKUP_MIRROR_PATH to have that copy made "
                    "automatically."
                ),
            }
        if target in ("path", "mirror", "local"):
            return _replicate_to_path(local_path, object_name)
        if target == "s3":
            return await _replicate_s3(local_path, object_name)
        return {"replicated": False, "target": target,
                "reason": f"Unknown BACKUP_OFFSITE_TARGET '{target}'"}
    except Exception as e:
        logger.error(f"Off-box replication to {target} failed: {e}")
        return {"replicated": False, "target": target, "reason": str(e)}


def _replicate_to_path(local_path: str, object_name: str) -> dict:
    """
    Copy to a second filesystem path.

    Intended for a separate mounted volume, an NFS/SMB share, or a directory that
    something else syncs away. Deliberately simple: no credentials, no network
    client, nothing that can expire.
    """
    from app.config import settings

    root = (getattr(settings, "backup_mirror_path", "") or "").strip()
    if not root:
        return {"replicated": False, "target": "path",
                "reason": "BACKUP_MIRROR_PATH is not set"}

    if os.path.realpath(root) == os.path.realpath(
        os.path.dirname(os.path.dirname(local_path))
    ):
        return {"replicated": False, "target": "path",
                "reason": ("BACKUP_MIRROR_PATH points at the backup directory "
                           "itself, which is not a second copy")}

    destination = os.path.join(root, object_name)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.copy2(local_path, destination)
    os.chmod(destination, 0o600)

    size = os.path.getsize(destination)
    logger.info(f"Backup mirrored to {destination} ({size} bytes)")
    return {"replicated": True, "target": "path", "location": destination,
            "bytes": size}


async def _replicate_s3(local_path: str, object_name: str) -> dict:
    """Upload to any S3-compatible endpoint. Entirely optional."""
    try:
        import boto3
    except ImportError:
        return {"replicated": False, "target": "s3",
                "reason": "boto3 is not installed; add it to requirements.txt"}

    import asyncio

    from app.config import settings

    bucket = getattr(settings, "backup_offsite_bucket", "")
    if not bucket:
        return {"replicated": False, "target": "s3",
                "reason": "BACKUP_OFFSITE_BUCKET not configured"}

    def _put():
        client = boto3.client(
            "s3",
            endpoint_url=getattr(settings, "backup_s3_endpoint", "") or None,
            aws_access_key_id=getattr(settings, "backup_s3_access_key", "") or None,
            aws_secret_access_key=getattr(settings, "backup_s3_secret_key", "") or None,
            region_name=getattr(settings, "backup_s3_region", "") or None,
        )
        client.upload_file(local_path, bucket, object_name)

    # boto3 is synchronous; keep it off the event loop.
    await asyncio.get_running_loop().run_in_executor(None, _put)

    logger.info(f"Backup replicated to s3://{bucket}/{object_name}")
    return {"replicated": True, "target": "s3",
            "location": f"s3://{bucket}/{object_name}",
            "bytes": os.path.getsize(local_path)}
