"""
Database engine and session management using SQLAlchemy asyncio.
Connects to the existing Supabase PostgreSQL instance.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


def build_engine(database_url: str | None = None):
    """Build the async SQLAlchemy engine."""
    url = database_url or settings.database_url
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not configured. "
            "Copy backend/.env.example to backend/.env and fill in your values."
        )
    
    # Auto-rewrite postgres:// or postgresql:// to postgresql+asyncpg:// for async pg driver compatibility
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        
    # Auto-rewrite Docker gateway IPs to localhost (127.0.0.1) when running in host network mode,
    # since PostgreSQL on the host listens on 127.0.0.1 and iptables blocks docker bridge traffic.
    for gw in ["172.17.0.1", "172.18.0.1", "172.19.0.1", "172.20.0.1"]:
        if f"@{gw}" in url:
            url = url.replace(f"@{gw}", "@127.0.0.1")
    
    # Configure pooling strategy based on configuration settings
    poolclass = NullPool if settings.db_pool_type.lower() == "null" else None
    
    pool_kwargs = {}
    if poolclass is None:
        pool_kwargs["pool_size"] = settings.db_pool_size
        pool_kwargs["max_overflow"] = settings.db_pool_max_overflow
        # Without a timeout a request waits forever for a free connection, so a
        # slow query turns into a hung worker rather than a failed request.
        pool_kwargs["pool_timeout"] = settings.db_pool_timeout_seconds
        # Proxies drop idle connections; recycling first avoids the stale
        # connection surfacing as a failed query after a quiet period.
        pool_kwargs["pool_recycle"] = settings.db_pool_recycle_seconds
        
    # Disable prepared statements cache if using pgpooler/pgbouncer (Transaction mode)
    # Supabase Transaction Pooler uses port 6543
    # Bounded waits: connecting, and any single statement on the wire. Without
    # them a query on a connection whose network path had died never returned.
    connect_args = {
        "timeout": settings.db_connect_timeout_seconds,
        "command_timeout": settings.db_command_timeout_seconds,
    }
    if "6543" in url:
        connect_args["prepared_statement_cache_size"] = 0
        
    return create_async_engine(
        url,
        echo=settings.is_development,
        pool_pre_ping=True,
        poolclass=poolclass,
        connect_args=connect_args,
        **pool_kwargs
    )



engine = build_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield an async database session."""
    from app.utils.db_session_context import (
        apply_identity_to_session, clear_identity_from_session,
    )

    async with AsyncSessionLocal() as session:
        # Publish who is asking before any query runs, so Postgres row-level
        # security has an identity to evaluate. Done unconditionally — an
        # anonymous request writes empty values — so a pooled connection can
        # never inherit the previous caller's identity.
        await apply_identity_to_session(session)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await clear_identity_from_session(session)
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager version for use outside FastAPI dependency injection
    (background tasks, Celery workers, startup hooks).

    These run with no request identity, so the session is explicitly marked
    anonymous rather than inheriting whatever a pooled connection last held.
    """
    from app.utils.db_session_context import (
        apply_identity_to_session, clear_identity_from_session,
    )

    async with AsyncSessionLocal() as session:
        await apply_identity_to_session(session)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await clear_identity_from_session(session)
            await session.close()
