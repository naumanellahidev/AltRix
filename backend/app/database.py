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
    
    # Configure pooling strategy based on configuration settings
    poolclass = NullPool if settings.db_pool_type.lower() == "null" else None
    
    pool_kwargs = {}
    if poolclass is None:
        pool_kwargs["pool_size"] = settings.db_pool_size
        pool_kwargs["max_overflow"] = settings.db_pool_max_overflow
        
    return create_async_engine(
        url,
        echo=settings.is_development,
        pool_pre_ping=True,
        poolclass=poolclass,
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
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager version for use outside FastAPI dependency injection."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
