#!/usr/bin/env python3
"""
AltRix — restore a database backup.

Run inside the backend container, which is where pg_restore and the encryption
key both live:

    docker exec -it altrix_backend python scripts/backup/restore.py list
    docker exec -it altrix_backend python scripts/backup/restore.py drill
    docker exec -it altrix_backend python scripts/backup/restore.py restore \
        --backup backup_20260917_210000_utc.dump.enc \
        --target "postgresql://user:pw@host:5432/altrix_recovered"

Restoring over the live database is possible but requires saying so explicitly
with --i-understand-this-overwrites-production. During an incident the instinct
is to type fast, and a restore aimed at the wrong database turns a recoverable
problem into an unrecoverable one.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))


def _fmt_size(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def cmd_list(_args):
    from app.utils.restore_service import list_restorable

    items = list_restorable()
    if not items:
        print("No backups found.")
        print("Checked: /var/lib/altrix/storage/altrix-backups/daily")
        print()
        print("If this is unexpected, confirm the storage volume is mounted:")
        print("  docker inspect altrix_backend | grep -A3 altrix/storage")
        return 1

    print(f"{len(items)} backup(s), newest first:\n")
    for it in items:
        lock = "encrypted" if it["encrypted"] else "PLAINTEXT"
        print(f"  {it['name']}")
        print(f"      {_fmt_size(it['size_bytes'])}  ·  {it['created_at']}  ·  {lock}")
    return 0


def cmd_status(_args):
    import asyncio
    from app.utils.backup_service import get_backup_status

    print(json.dumps(asyncio.run(get_backup_status()), indent=2))
    return 0


def cmd_drill(_args):
    from app.utils.restore_service import run_restore_drill

    print("Restoring the newest backup into a scratch database…")
    result = run_restore_drill()
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "success" else 1


def cmd_restore(args):
    from app.utils.restore_service import list_restorable, restore_backup, RestoreError

    path = args.backup
    if not os.path.isabs(path):
        match = [i for i in list_restorable() if i["name"] == path]
        if not match:
            print(f"No backup named {path!r}. Run 'list' to see what is available.")
            return 1
        path = match[0]["path"]

    if not args.target:
        print("--target is required: the connection string to restore INTO.")
        return 1

    try:
        result = restore_backup(
            path,
            args.target,
            allow_production=args.i_understand_this_overwrites_production,
            clean=not args.no_clean,
        )
    except RestoreError as e:
        print(f"Restore failed: {e}")
        return 1

    print(json.dumps(result, indent=2))
    return 0


def cmd_genkey(_args):
    from app.utils.backup_storage import generate_key_b64

    print(generate_key_b64())
    print()
    print("Store this as BACKUP_ENCRYPTION_KEY.")
    print("Keep a copy somewhere that survives losing this server, and NOT")
    print("alongside the backups — without it an encrypted dump cannot be read.")
    return 0


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="show available backups")
    sub.add_parser("status", help="backup health as the dashboard sees it")
    sub.add_parser("drill", help="prove the newest backup restores")
    sub.add_parser("genkey", help="generate a BACKUP_ENCRYPTION_KEY")

    r = sub.add_parser("restore", help="restore a backup into a database")
    r.add_argument("--backup", required=True, help="file name from 'list', or a path")
    r.add_argument("--target", help="connection string to restore INTO")
    r.add_argument("--no-clean", action="store_true",
                   help="do not drop existing objects first")
    r.add_argument("--i-understand-this-overwrites-production",
                   action="store_true",
                   help="required to restore over the configured live database")

    args = ap.parse_args()
    return {
        "list": cmd_list, "status": cmd_status, "drill": cmd_drill,
        "restore": cmd_restore, "genkey": cmd_genkey,
    }[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
