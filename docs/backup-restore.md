# Backup and restore

Everything here runs against this VPS and its own Postgres. No hosted service is
involved, and nothing needs a third-party account.

Day to day you should not need this document: **Super Admin → Backups &
Recovery** does all of it from the dashboard.

## What was wrong

No database backup had ever been taken. Five independent faults, each one
sufficient on its own:

| # | Fault | Effect |
|---|---|---|
| 1 | `register_backup_tasks()` was never called, and the module was not in Celery's `include` | the task was never registered, so beat had nothing to run |
| 2 | the code called `_upload_backup()`; the function is `_upload_to_storage()` | every run raised `NameError` into a bare `except`, which returned `{"status": "error"}` — a value Celery reads as success |
| 3 | scheduled on a 24-hour *interval* behind an "off-peak hours" gate | a worker started at midday fired at midday daily and was skipped every time |
| 4 | `pg_dump` was not installed in the Docker image | `FileNotFoundError` on every run regardless of the above |
| 5 | `/var/lib/altrix/storage` was bind-mounted into **no** container | anything written there lived inside the container and was destroyed on the next deploy |

Fault 5 was not only a backup problem. That directory also holds **every
uploaded file** — student photos, documents, fee payment proofs, assignment
submissions, generated certificates. All of it was being lost on every deploy.

Three further gaps would have mattered the first time anyone needed a recovery:
dumps were **plaintext**, no copy ever **left the machine**, and there was **no
restore capability of any kind**.

## What happens now

**Daily at 21:00 UTC** (02:00 PKT) the Celery beat container runs a backup that:

1. runs `pg_dump --format=custom` to a temporary file, streaming to disk
2. refuses an empty dump, or one over 5 GB
3. verifies it with `pg_restore --list` — an archive that cannot be read is
   discarded rather than kept
4. encrypts it with AES-256-GCM
5. moves it to `/var/lib/altrix/storage/altrix-backups/daily/` on the mounted
   host volume, so it survives deploys
6. mirrors it to a second path, if one is configured
7. rotates to the newest 30
8. **raises** on failure, so Celery records it, retries, and alerts

**Daily at 09:00 UTC**, freshness is checked: no backups, backups older than the
configured threshold, or no off-server copy each raise an alert.

**Weekly, Sunday 22:30 UTC**, a restore drill restores the newest dump into a
scratch database, counts rows in `schools`, `students`, `user_roles` and
`fee_invoices`, then drops it. A restore that completes but returns no rows is
treated as a failure — that is the failure mode which looks most like success.

## Getting a copy off the server

This is the part that turns "we take backups" into "we could actually recover".

### The dashboard (no setup)

**Super Admin → Backups & Recovery → Download.**

Keep the file anywhere you like — a laptop, a NAS, another provider. To use it
later, **Upload** it on the same page and restore. That round trip needs no
shell access, no credentials and no external service.

Download gives you the encrypted file by default, which is what should be
stored. There is also a **Decrypted** option for a plain `pg_restore` archive if
you would rather not depend on holding the key — but that file is readable by
anyone who obtains it and contains every student's personal data, so treat it
accordingly.

### An automatic mirror (optional)

To have the second copy made without anyone remembering:

```bash
BACKUP_OFFSITE_TARGET=path
BACKUP_MIRROR_PATH=/mnt/backup-volume/altrix
```

Point it at another mounted disk, an NFS/SMB share, or a directory something
else syncs away. No credentials, no network client, nothing that can expire.
Pointing it at the backup directory itself is refused — a file next to itself is
not a second copy.

An S3-compatible target (`BACKUP_OFFSITE_TARGET=s3`, needs `boto3`) is supported
for anyone who wants it. Nothing requires it.

## Setup

### 1. Encryption key — required in production

Generate one:

```bash
docker exec -it altrix_backend python scripts/backup/restore.py genkey
```

Set it as `BACKUP_ENCRYPTION_KEY`.

> Keep a copy somewhere that survives losing this server, and **not** alongside
> the backups. Without this key an encrypted dump cannot be restored — losing it
> is equivalent to losing the backups. In production the backup refuses to run
> without it rather than writing personal data to disk in the clear.

### 2. Alert recipients

**Super Admin → Backups & Recovery → Backup alerts.** Add the addresses that
should hear about failures, and choose which events raise mail. They are stored
in the database, so changing them needs no redeploy.

`BACKUP_ALERT_EMAIL` still works as a fallback for a brand-new deployment that
has not opened the dashboard yet.

## Restoring

### From the dashboard

**Super Admin → Backups & Recovery → Restore.**

This restores into a **new recovery database beside the live one** and tells you
its name. Nothing live is touched. Inspect the recovered data, then decide.

That is almost always the right move: it costs minutes and it is reversible.

### Over the live database

Only once the recovery copy has been confirmed. Stop the application first so
nothing writes mid-restore:

```bash
docker stop altrix_backend altrix_celery_worker altrix_celery_beat

docker start altrix_backend
docker exec -it altrix_backend python scripts/backup/restore.py restore \
  --backup backup_20260917_210000_utc.dump.enc \
  --target "$DATABASE_URL" \
  --i-understand-this-overwrites-production

docker start altrix_celery_worker altrix_celery_beat
```

The flag is deliberately long. During an incident the instinct is to type fast,
and a restore aimed at the wrong database turns a recoverable problem into an
unrecoverable one.

### If the server is gone

On any host with `postgresql-client` and this repository:

```python
from app.utils.backup_storage import decrypt_file
decrypt_file("backup_20260917_210000_utc.dump.enc", "restored.dump")
```

```bash
createdb altrix_recovered
pg_restore --dbname "postgresql://user:pw@host/altrix_recovered" \
  --no-owner --no-privileges restored.dump
```

This is why the key must live somewhere other than the server.

## Command line

Everything the dashboard does is also available in the container, where
`pg_restore` and the key both live:

```bash
docker exec -it altrix_backend python scripts/backup/restore.py list
docker exec -it altrix_backend python scripts/backup/restore.py status
docker exec -it altrix_backend python scripts/backup/restore.py drill
docker exec -it altrix_backend python scripts/backup/restore.py genkey
```

## Checking it is working

**Super Admin → Backups & Recovery.** Four tiles, and all four should be green:

- **Latest backup** — under 24 hours old
- **Stored on this server** — a non-zero count
- **Encryption** — AES-256
- **Recovery proven** — a passing restore drill

"Recovery proven: Never tested" means no restore has ever been demonstrated on
this deployment. Run the drill; it is safe and takes a minute.

## What is still a judgement call

**Retention.** Thirty daily backups. If you need longer — for a regulator, or to
recover from damage discovered late — add weekly and monthly tiers.

**Point-in-time recovery.** These are daily snapshots, so worst case you lose up
to 24 hours of writes. Continuous WAL archiving is the fix; it is a
database-level change rather than an application one.

**Uploaded files.** The storage volume now persists across deploys, but only the
database is copied off the server. If the host is lost, uploaded documents are
lost with it. Pointing `BACKUP_MIRROR_PATH` at a volume that also receives
`/var/lib/altrix/storage` closes that gap.
