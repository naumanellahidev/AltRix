import os
import asyncio
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("db_permission_patcher")

async def patch():
    # Load .env file if present
    from dotenv import load_dotenv
    load_dotenv('/app/.env')
    
    # 1. Get database administrator URL
    admin_url = os.getenv("VPS_ADMIN_DATABASE_URL")
    if not admin_url:
        host = os.getenv("VPS_PG_HOST", "127.0.0.1")
        port = os.getenv("VPS_PG_PORT", "5432")
        db = os.getenv("VPS_PG_DATABASE", "altrix")
        user = os.getenv("VPS_PG_ADMIN_USER")
        password = os.getenv("VPS_PG_ADMIN_PASSWORD")
        if user and password:
            admin_url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
            
    if not admin_url:
        logger.error("Could not find admin database URL in environment or .env!")
        return

    # Auto-rewrite postgres:// or postgresql:// to postgresql+asyncpg:// for async pg driver compatibility
    if admin_url.startswith("postgresql://"):
        admin_url = admin_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif admin_url.startswith("postgres://"):
        admin_url = admin_url.replace("postgres://", "postgresql+asyncpg://", 1)
        
    # Auto-rewrite Docker gateway IPs to localhost (127.0.0.1) when running in host network mode
    for gw in ["172.17.0.1", "172.18.0.1", "172.19.0.1", "172.20.0.1"]:
        if f"@{gw}" in admin_url:
            admin_url = admin_url.replace(f"@{gw}", "@127.0.0.1")
            
    logger.info("Connecting to database using admin credentials...")
    try:
        engine = create_async_engine(admin_url)
        async with engine.begin() as conn:
            logger.info("Executing GRANT statements on auth schema...")
            await conn.execute(text("GRANT USAGE ON SCHEMA auth TO altrix_app;"))
            await conn.execute(text("GRANT SELECT ON ALL TABLES IN SCHEMA auth TO altrix_app;"))
            await conn.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO altrix_app;"))
            logger.info("Database permissions granted successfully!")
        await engine.dispose()
    except Exception as e:
        logger.error(f"Failed to execute schema permission grants: {e}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(patch())
