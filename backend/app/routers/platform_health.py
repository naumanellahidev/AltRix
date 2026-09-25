"""
The platform's health, measured.

The System Health page showed numbers typed into its source: CPU "4.8%",
memory "128MB / 1024MB", "12 active connections", a table list claiming
1,420 students and 28,400 attendance rows, a "94.2%" cache hit rate, and a
"diagnostic probe" that waited 1.2 seconds and then drew a random latency.
None of it came from the server it described.

This returns what the server and the database report at the moment of the
request. The page measures latency itself, by timing requests to /api/health.
Platform owner only.
"""
import os
import shutil
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.dependencies import CurrentUser, DbSession

router = APIRouter(prefix="/platform", tags=["Platform health"])

#: Above this many (estimated) rows a table is not counted outright.
EXACT_COUNT_LIMIT = 200_000


def _meminfo() -> Dict[str, int]:
    """Total and available memory in bytes, from /proc/meminfo (Linux)."""
    out: Dict[str, int] = {}
    try:
        with open("/proc/meminfo", encoding="ascii") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                if key in ("MemTotal", "MemAvailable"):
                    out[key] = int(rest.strip().split()[0]) * 1024
    except OSError:
        pass
    return out


def _process_rss() -> Optional[int]:
    """This API process's resident memory in bytes."""
    try:
        with open("/proc/self/status", encoding="ascii") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) * 1024
    except OSError:
        return None
    return None


@router.post("/maintenance/analyze")
async def analyze_database(current_user: CurrentUser, db: DbSession):
    """
    Refresh the planner's statistics for every table (ANALYZE).

    The database page's "Vacuum & Clean" button waited 1.5 seconds and then
    announced "re-indexed 4 indexes … reclaimed 4.2 MB" without touching the
    database. This does the part that is safe while the school is working —
    fresh statistics, which the row estimates on these pages depend on (they
    read 0 for a table of 29 invoices) — and reports what it did.
    """
    if not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform owner only.")
    import time

    started = time.monotonic()
    tables = int((await db.execute(text(
        "SELECT count(*) FROM pg_stat_user_tables WHERE schemaname = 'public'"
    ))).scalar() or 0)
    await db.execute(text("ANALYZE"))
    await db.commit()
    return {"tables_analyzed": tables, "seconds": round(time.monotonic() - started, 2)}


@router.get("/health-metrics")
async def platform_health_metrics(current_user: CurrentUser, db: DbSession):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform owner only.")

    from app.utils.health import build_health_response

    health = await build_health_response(include_deps=True)

    db_stats = (await db.execute(text(
        """
        SELECT pg_database_size(current_database()) AS size_bytes,
               (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections,
               (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') AS active,
               (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
               (SELECT round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 1)
                  FROM pg_stat_database WHERE datname = current_database()) AS cache_hit_pct,
               (SELECT count(*) FROM pg_stat_user_tables WHERE schemaname = 'public') AS tables
        """
    ))).mappings().first()

    tables = (await db.execute(text(
        """
        SELECT t.relname AS table,
               t.n_live_tup AS rows,
               pg_total_relation_size(t.relid) AS size_bytes,
               (SELECT count(*) FROM pg_index i WHERE i.indrelid = t.relid) AS indexes,
               t.seq_scan, coalesce(t.idx_scan, 0) AS idx_scan,
               greatest(t.last_analyze, t.last_autoanalyze) AS last_analyzed
          FROM pg_stat_user_tables t
         WHERE t.schemaname = 'public'
         ORDER BY pg_total_relation_size(t.relid) DESC
         LIMIT 15
        """
    ))).mappings().all()

    queue_length: Optional[int] = None
    try:
        from app.cache import get_redis
        redis = await get_redis()
        if redis:
            queue_length = int(await redis.llen("celery"))
    except Exception:
        queue_length = None

    mem = _meminfo()
    disk = shutil.disk_usage("/")
    try:
        load = os.getloadavg()
    except OSError:
        load = None

    # The statistics' row estimate is only as fresh as the last ANALYZE — it
    # read 0 for a table of 29 invoices — so the rows are counted outright,
    # except on a very large table, where the estimate is kept and labelled.
    table_rows: List[Dict[str, Any]] = []
    for t in tables:
        row = dict(t)
        row["last_analyzed"] = row["last_analyzed"].isoformat() if row["last_analyzed"] else None
        row["rows_exact"] = False
        if (row["rows"] or 0) < EXACT_COUNT_LIMIT and str(row["table"]).replace("_", "").isalnum():
            try:
                row["rows"] = int((await db.execute(text(f'SELECT count(*) FROM public."{row["table"]}"'))).scalar() or 0)
                row["rows_exact"] = True
            except Exception:
                await db.rollback()
        table_rows.append(row)

    return {
        "status": health.get("status"),
        "version": health.get("version"),
        "commit": health.get("commit"),
        "uptime_seconds": health.get("uptime_seconds"),
        "dependencies": health.get("dependencies"),
        "server": {
            "cpu_count": os.cpu_count(),
            "load_average": list(load) if load else None,
            "memory_total_bytes": mem.get("MemTotal"),
            "memory_available_bytes": mem.get("MemAvailable"),
            "api_process_rss_bytes": _process_rss(),
            "disk_total_bytes": disk.total,
            "disk_free_bytes": disk.free,
        },
        "database": dict(db_stats) if db_stats else None,
        "tables": table_rows,
        "task_queue_length": queue_length,
    }
