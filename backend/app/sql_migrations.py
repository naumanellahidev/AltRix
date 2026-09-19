"""
Versioned SQL migrations, applied once each by the deploy step.

The deploy ran only the schema bootstrap; the SQL migrations
(the old supabase/migrations folder) were never applied on the VPS by
anything, so a schema change shipped in a migration reached production only if
someone ran it by hand. The migrations written for this Postgres live in
``backend/sql_migrations`` — inside the backend build context, so they are in
the image the deploy builds — and this applies them in order, records each in
``public.app_sql_migrations``, and never runs one twice.

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
    """backend/sql_migrations: /app/sql_migrations in the image."""
    configured = os.getenv("SQL_MIGRATIONS_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[1] / "sql_migrations"


def _asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def apply_sql_migrations(database_url: Optional[str] = None) -> List[str]:
    """Apply every listed migration not yet recorded. Returns the names applied."""
    import asyncpg

    if database_url is None:
        # The engine's own URL: it carries the host rewrites database.py applies
        # (the Docker gateway address becomes 127.0.0.1 on the VPS).
        from app.database import engine

        database_url = engine.url.render_as_string(hide_password=False)
    dsn = _asyncpg_dsn(database_url)
    folder = migrations_dir()
    conn = await asyncpg.connect(dsn, timeout=30)
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
