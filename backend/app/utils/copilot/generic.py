"""
A source for every other school-scoped table, so nothing is unanswerable.

The curated registry covers the modules schools use every day. The database
holds about two hundred school-scoped tables; the rest — hostel mess menus,
alumni donations, installment plans, sports scorecards — are read from
``information_schema`` once and turned into sources automatically: keywords
from the table's own name, a handful of columns that are safe and useful to
show, a count and the latest rows.

These are for school leadership only. A table nobody has looked at closely may
hold something only they should see, so the safe default is the narrow one.
Credentials, sessions, gateway settings, audit trails and internal plumbing
are never offered at all (``registry.DENYLIST``), and no id, token, hash or
secret column is ever selected.
"""
import logging
import time
from typing import Dict, List, Tuple

from sqlalchemy import text

from app.utils.copilot.params import COMMON_STOPWORDS
from app.utils.copilot.registry import (
    DENYLIST, GOV, SENSITIVE_COLUMN, Col, Source, curated_tables, pk,
)

logger = logging.getLogger("app.copilot.generic")

_CACHE: Tuple[Tuple[Source, ...], float] = ((), 0.0)
CACHE_SECONDS = 3600

#: Column names worth showing first, in this order.
_PREFER = (
    "name", "full_name", "title", "subject", "label", "item_name", "room_number", "route_name",
    "status", "stage", "type", "category", "priority", "amount", "total", "quantity", "score",
    "marks", "points", "date", "start_date", "end_date", "due_date", "event_date",
)
_SHOWN_TYPES = {
    "text", "character varying", "character", "numeric", "integer", "bigint", "smallint",
    "double precision", "real", "date", "timestamp with time zone", "timestamp without time zone",
    "boolean", "USER-DEFINED",
}


#: Words in table names too general to route a question on their own.
_VAGUE = COMMON_STOPWORDS | {
    "school", "schools", "settings", "setting", "logs", "items", "view", "principal", "types",
}


def _kind(data_type: str, column: str) -> str:
    if data_type == "boolean":
        return "bool"
    if data_type == "date":
        return "date"
    if data_type.startswith("timestamp"):
        return "datetime"
    if data_type in ("numeric", "double precision", "real"):
        return "money" if any(k in column for k in ("amount", "fee", "fare", "price", "salary", "cost",
                                                   "balance", "fine", "donation", "paid")) else "number"
    if data_type in ("integer", "bigint", "smallint"):
        return "number"
    return "text"


def _safe(column: str) -> bool:
    c = column.lower()
    if c == "id" or c.endswith("_id") or c in ("school_id", "campus_id"):
        return False
    if c.endswith("_url") or c.endswith("_urls") or c.endswith("_json") or c in ("metadata", "payload", "raw"):
        return False
    return not any(bad in c for bad in SENSITIVE_COLUMN)


def _keywords(table: str) -> Tuple[str, ...]:
    parts = [p for p in table.split("_") if p and p not in ("hr", "ai", "crm")]
    out = {" ".join(parts), table.replace("_", " ")}
    for p in parts:
        # A single word from the name is a keyword only if it says something:
        # "school" alone would send "school ka haal" to school_branding.
        if len(p) >= 4 and p not in _VAGUE:
            out.add(p)
            if p.endswith("s") and len(p) > 4:
                out.add(p[:-1])
    return tuple(sorted(o for o in out if o))


def build(columns_by_table: Dict[str, List[Tuple[str, str]]]) -> Tuple[Source, ...]:
    """Sources from ``{table: [(column, data_type), …]}``. Pure, for tests."""
    curated = curated_tables()
    sources: List[Source] = []
    for table, cols in sorted(columns_by_table.items()):
        if table in curated or table in DENYLIST:
            continue
        names = {c for c, _ in cols}
        if "school_id" not in names:
            continue
        usable = [(c, t) for c, t in cols if t in _SHOWN_TYPES and _safe(c)]
        if not usable:
            continue

        def rank(item):
            col = item[0]
            for i, pref in enumerate(_PREFER):
                if col == pref or col.endswith(pref):
                    return i
            return len(_PREFER) + 1

        shown = sorted(usable, key=rank)[:6]
        columns = tuple(
            Col(c.replace("_", " ").capitalize(), f"t.{c}::text" if t == "USER-DEFINED" else f"t.{c}", _kind(t, c))
            for c, t in shown
        )
        date_col = None
        if "created_at" in names:
            date_col = pk("t.created_at")
        else:
            dated = next((c for c, t in cols if t == "date"), None)
            date_col = f"t.{dated}" if dated else None
        text_cols = tuple(f"t.{c}" for c, t in shown if t in ("text", "character varying", "character"))
        label = table.replace("_", " ")
        sources.append(Source(
            key=f"generic:{table}", module=label.title(), title=label, title_ur=label,
            keywords=_keywords(table), frm=f"{table} t", columns=columns, roles=GOV,
            order_by="t.created_at DESC NULLS LAST" if "created_at" in names else "1",
            date_col=date_col, name_cols=text_cols[:3],
            count_noun=label, count_noun_ur=label, generic=True,
        ))
    return tuple(sources)


async def generic_sources(db) -> Tuple[Source, ...]:
    """Every uncurated school-scoped table as a source, read once an hour."""
    global _CACHE
    cached, at = _CACHE
    if cached and time.monotonic() - at < CACHE_SECONDS:
        return cached
    try:
        rows = (await db.execute(text(
            """
            SELECT c.table_name, c.column_name, c.data_type
            FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_name = c.table_name AND t.table_schema = c.table_schema
            WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
              AND c.table_name IN (
                SELECT table_name FROM information_schema.columns
                WHERE table_schema = 'public' AND column_name = 'school_id')
            ORDER BY c.table_name, c.ordinal_position
            """
        ))).all()
    except Exception as exc:  # the curated sources still answer without these
        logger.warning("Could not read the schema for generic Copilot sources: %s", exc)
        # A failed statement leaves the transaction aborted; without this the
        # curated query that follows would fail too.
        await db.rollback()
        return cached
    by_table: Dict[str, List[Tuple[str, str]]] = {}
    for table, column, data_type in rows:
        by_table.setdefault(table, []).append((column, data_type))
    _CACHE = (build(by_table), time.monotonic())
    return _CACHE[0]
