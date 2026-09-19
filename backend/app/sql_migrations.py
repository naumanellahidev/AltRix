"""
Versioned SQL migrations, applied once each by the deploy step.

The deploy ran only the schema bootstrap; the SQL migrations under
supabase/migrations were never applied on the VPS by anything, so a schema
change shipped in a migration reached production only if someone ran it by
hand. This applies an explicit, ordered list of them — each idempotent and
written for this Postgres, not for Supabase — and records every one it applies
in ``public.app_sql_migrations`` so it runs once.

A migration that fails stops the deploy (the old containers keep serving),
rather than starting new code against a half-migrated database.
"""
import hashlib
import logging
import os
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("app.sql_migrations")

# In order. Append only; never edit a file once it has been applied.
MIGRATIONS: List[str] = [
    "20260918000000_database_hardening.sql",
    "20260918010000_unified_invoice_numbering.sql",
    "20261027000000_hr_contract_reference_numbers.sql",
    "20261028000000_exam_seating_sessions.sql",
]


def migrations_dir() -> Path:
    """Where the .sql files are: the image copy, or the repo in development."""
    configured = os.getenv("SQL_MIGRATIONS_DIR")
    if configured:
        return Path(configured)
    image = Path("/app/sql_migrations")
    if image.is_dir():
        return image
    return Path(__file__).resolve().parents[2] / "supabase" / "migrations"


def _asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def apply_sql_migrations(database_url: Optional[str] = None) -> List[str]:
    """Apply every listed migration not yet recorded. Returns the names applied."""
    import asyncpg

    from app.config import settings

    dsn = _asyncpg_dsn(database_url or settings.database_url)
    folder = migrations_dir()
    conn = await asyncpg.connect(dsn)
    applied_now: List[str] = []
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS public.app_sql_migrations (
                name       TEXT PRIMARY KEY,
                checksum   TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        done = {r["name"]: r["checksum"] for r in await conn.fetch("SELECT name, checksum FROM public.app_sql_migrations")}
        for name in MIGRATIONS:
            path = folder / name
            if not path.is_file():
                raise FileNotFoundError(f"migration {name} not found in {folder}")
            sql = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(sql.encode("utf-8")).hexdigest()
            if name in done:
                if done[name] != checksum:
                    logger.warning("Migration %s changed after it was applied; not re-running it", name)
                continue
            logger.info("Applying migration %s", name)
            # Simple-query protocol: the file carries its own BEGIN/COMMIT.
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO public.app_sql_migrations (name, checksum) VALUES ($1, $2)",
                name,
                checksum,
            )
            applied_now.append(name)
    finally:
        await conn.close()
    logger.info("SQL migrations: %d applied, %d already in place", len(applied_now), len(MIGRATIONS) - len(applied_now))
    return applied_now
