"""
AltRix Migration Runner
Applies database migrations from app/scripts/migrations/ using SQLAlchemy async connection.
Runs statements with isolation_level="AUTOCOMMIT" to support CREATE INDEX CONCURRENTLY.
"""
import os
import re
import asyncio
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("migration_runner")


def get_db_url() -> str:
    url = settings.database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not configured.")
    
    # Auto-rewrite postgres:// or postgresql:// to postgresql+asyncpg:// for async pg driver compatibility
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


async def run_sql_file(conn, file_path: str):
    logger.info(f"Reading migration file: {file_path}")
    if not os.path.exists(file_path):
        logger.error(f"Migration file not found: {file_path}")
        raise FileNotFoundError(f"Migration file {file_path} not found")

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Clean SQL comments and split statements by semicolon
    # Remove single line comments
    content_clean = re.sub(r'--.*$', '', content, flags=re.MULTILINE)
    
    # Split by semicolon, but ignore semicolons inside single or double quotes if any (though simple splitting is fine for our files)
    statements = content_clean.split(';')

    for statement in statements:
        stmt = statement.strip()
        if not stmt:
            continue
        
        try:
            logger.info(f"Executing statement: {stmt[:120]}...")
            await conn.execute(text(stmt))
            logger.info("Statement executed successfully")
        except Exception as e:
            logger.error(f"Failed to execute statement: {stmt}\nError: {e}")
            raise e


async def main():
    logger.info("Starting database migrations...")
    url = get_db_url()
    
    # Create async engine with autocommit to allow CREATE INDEX CONCURRENTLY
    engine = create_async_engine(
        url,
        isolation_level="AUTOCOMMIT",
        echo=False
    )
    
    # Resolve migrations directory relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    migrations_dir = os.path.join(script_dir, "migrations")
    
    # List of migration files to apply in order
    migration_files = [
        "001_fix_schema_drift.sql",
        "002_add_indexes.sql",
        "003_create_legacy_tables.sql"
    ]
    
    try:
        async with engine.begin() as conn:
            for file_name in migration_files:
                file_path = os.path.join(migrations_dir, file_name)
                logger.info(f"Applying migration: {file_name}")
                await run_sql_file(conn, file_path)
        logger.info("Database migrations applied successfully!")
    except Exception as e:
        logger.critical(f"Database migration process failed: {e}")
        raise SystemExit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
