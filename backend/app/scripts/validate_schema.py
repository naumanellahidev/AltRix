"""
AltRix Schema Validator
Compares SQLAlchemy ORM model definitions against the live Supabase database.
Run: python -m app.scripts.validate_schema
"""
import asyncio
import logging
from typing import Dict, List, Set, Tuple

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import engine, Base

# Import all models to register them
import app.models.core          # noqa
import app.models.academic      # noqa
import app.models.people        # noqa
import app.models.attendance    # noqa
import app.models.admissions    # noqa
import app.models.exams         # noqa
import app.models.finance       # noqa
import app.models.messaging     # noqa
import app.models.misc          # noqa
import app.models.campus        # noqa

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("schema_validator")


async def get_db_tables_and_columns(conn) -> Dict[str, Set[str]]:
    """Return {table_name: {col_name, ...}} for the public schema."""
    result = await conn.execute(text("""
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
    """))
    db_schema: Dict[str, Set[str]] = {}
    for row in result.fetchall():
        tbl, col = row[0], row[1]
        db_schema.setdefault(tbl, set()).add(col)
    return db_schema


async def get_db_indexes(conn) -> Dict[str, List[str]]:
    """Return {table_name: [index_name, ...]} for the public schema."""
    result = await conn.execute(text("""
        SELECT tablename, indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
    """))
    indexes: Dict[str, List[str]] = {}
    for row in result.fetchall():
        tbl, idx = row[0], row[1]
        indexes.setdefault(tbl, []).append(idx)
    return indexes


async def validate():
    """Main validation routine."""
    logger.info("Connecting to database for schema validation...")

    async with engine.connect() as conn:
        db_schema = await get_db_tables_and_columns(conn)
        db_indexes = await get_db_indexes(conn)

    # Collect ORM-defined tables and columns
    orm_tables: Dict[str, Dict] = {}
    mapper_registry = Base.registry.mappers
    for mapper in mapper_registry:
        table = mapper.persist_selectable
        tbl_name = table.name
        orm_cols = {col.name: col for col in table.columns}
        orm_tables[tbl_name] = orm_cols

    missing_tables: List[str] = []
    missing_columns: Dict[str, List[str]] = {}
    extra_tables: List[str] = []

    logger.info(f"\n{'='*60}")
    logger.info(f"ORM defines {len(orm_tables)} tables")
    logger.info(f"Database has {len(db_schema)} tables (public schema)")
    logger.info(f"{'='*60}\n")

    # Tables in ORM but missing in DB
    for tbl in orm_tables:
        if tbl not in db_schema:
            missing_tables.append(tbl)
        else:
            for col in orm_tables[tbl]:
                if col not in db_schema[tbl]:
                    missing_columns.setdefault(tbl, []).append(col)

    # Tables in DB but not in ORM (informational only)
    for tbl in db_schema:
        if tbl not in orm_tables:
            extra_tables.append(tbl)

    # Report
    if missing_tables:
        logger.error(f"\n🔴 MISSING TABLES ({len(missing_tables)}):")
        for t in missing_tables:
            logger.error(f"  - {t}")
    else:
        logger.info("✅ All ORM tables exist in database")

    if missing_columns:
        logger.error(f"\n🔴 MISSING COLUMNS:")
        for tbl, cols in missing_columns.items():
            for col in cols:
                logger.error(f"  - {tbl}.{col}")
    else:
        logger.info("✅ All ORM columns exist in database")

    if extra_tables:
        logger.info(f"\n📋 EXTRA DB TABLES (not in ORM, informational):")
        for t in sorted(extra_tables):
            logger.info(f"  - {t}")

    # Generate fix SQL
    fix_sqls: List[str] = []
    for tbl in missing_tables:
        fix_sqls.append(f"-- TODO: CREATE TABLE {tbl} (...) -- see ORM model for definition")

    for tbl, cols in missing_columns.items():
        for col_name in cols:
            col = orm_tables[tbl][col_name]
            col_type = str(col.type)
            nullable = "NULL" if col.nullable else "NOT NULL"
            fix_sqls.append(
                f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col_name} {col_type} {nullable};"
            )

    if fix_sqls:
        logger.info(f"\n📝 SUGGESTED FIX SQL:")
        for sql in fix_sqls:
            logger.info(f"  {sql}")

    if not missing_tables and not missing_columns:
        logger.info("\n🎉 Schema validation PASSED — no drift detected!")
    else:
        logger.error("\n❌ Schema validation FAILED — see issues above")

    return {
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
        "extra_tables": extra_tables,
    }


if __name__ == "__main__":
    asyncio.run(validate())
