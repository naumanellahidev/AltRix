"""
Shared pytest setup.

Importing ``app.*`` builds the SQLAlchemy engine at module scope, which raises
if DATABASE_URL is unset. Tests therefore used to run only on a machine that
happened to have a populated backend/.env — which is a large part of why so
little of this codebase is covered. These placeholders make the suite runnable
anywhere; nothing here connects to a database.
"""
import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://test_user:test_pw@localhost:5432/test_db"
)
os.environ.setdefault(
    "SUPABASE_JWT_SECRET", "test_secret_for_jwt_verification_1234567890123456789012"
)
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-for-anything-real")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("CACHE_ENABLED", "false")
