"""
AltRix School ERP SaaS — FastAPI Backend
Configuration management using Pydantic Settings
"""
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_env: str = "development"
    app_name: str = "AltRix School ERP API"
    app_version: str = "1.0.0"
    secret_key: str = "change-this-in-production"
    port: int = 8000
    debug: bool = False

    # Database
    database_url: str = ""
    db_pool_type: str = "queue"  # "queue" for persistent servers (EC2, ECS, VM) or "null" for serverless (Vercel)

    # Connection budget.
    #
    # Each process opens up to pool_size + max_overflow connections, and three
    # processes run on this host (API, Celery worker, Celery beat). At the old
    # 20 + 50 that is 210 connections against a Postgres whose default
    # max_connections is 100 — so under load the pool would exhaust the server
    # and every process would start failing to connect at once.
    #
    # 10 + 15 keeps the worst case at 75 across all three, inside the default,
    # with headroom for psql and the backup job. Raise both together with
    # max_connections if you raise either.
    db_pool_size: int = 10
    db_pool_max_overflow: int = 15

    # Recycle before most proxies and firewalls drop an idle connection,
    # otherwise the first query after a quiet period fails.
    db_pool_recycle_seconds: int = 1800
    db_pool_timeout_seconds: int = 30

    # JWT Verification Key
    supabase_jwt_secret: str = ""

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:8080,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:8080,http://127.0.0.1:3000"
    # Optional anchored regex for white-label tenant domains, e.g.
    #   r"https://[a-z0-9-]+\.myschools\.example"
    # Never point this at a shared hosting suffix such as .vercel.app: combined
    # with credentialed requests that would let anyone deploying there read
    # authenticated responses.
    cors_origin_regex: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_pool_size: int = 10
    cache_ttl_seconds: int = 300
    cache_enabled: bool = True

    # JWT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # JazzCash
    jazzcash_merchant_id: str = ""
    jazzcash_password: str = ""
    jazzcash_integrity_salt: str = ""
    jazzcash_return_url: str = ""
    jazzcash_api_url: str = "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/"

    # AI (Local Ollama Inference Engine - 100% Free & Private)
    gemini_api_key: str = ""
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_api_key: str = ""
    ollama_reasoning_model: str = "glm-5.3"
    ollama_general_model: str = "glm-5.3"

    # Cloud AI Flexibility
    ai_provider: str = "ollama"  # "ollama", "openrouter", "groq", "deepseek"
    ai_api_key: str = ""
    ai_api_base: str = ""
    ai_reasoning_model: str = ""  # If set, overrides the provider default
    ai_general_model: str = ""    # If set, overrides the provider default

    # Whether the app applies schema DDL when it boots.
    # Empty means "decide from app_env": off in production, where several
    # containers start at once and would race each other for table locks.
    run_startup_ddl: str = ""

    # Backups
    #
    # A dump of this database contains every student's personal details, so it
    # is encrypted at rest. The key must be stored somewhere that survives
    # losing the server AND somewhere other than the backups themselves --
    # without it an encrypted dump cannot be restored. Generate one with:
    #   python -c "import base64,secrets;print(base64.b64encode(secrets.token_bytes(32)).decode())"
    backup_encryption_key: str = ""

    # Where an automatic second copy goes.
    #
    # Getting a backup off this server is always possible by downloading it from
    # the Super Admin dashboard, which needs no configuration at all. This
    # setting only controls whether a copy is ALSO made without anyone asking.
    #
    #   none  - download-only (the dashboard still works)
    #   path  - copy to BACKUP_MIRROR_PATH: another mounted disk, an NFS share,
    #           or a directory something else syncs away. No credentials, no
    #           network client, nothing that can expire.
    #   s3    - any S3-compatible endpoint, for anyone who wants it
    backup_offsite_target: str = "none"       # none | path | s3
    backup_mirror_path: str = ""
    backup_offsite_bucket: str = "altrix-backups"
    backup_s3_endpoint: str = ""
    backup_s3_access_key: str = ""
    backup_s3_secret_key: str = ""
    backup_s3_region: str = ""

    # Fallback alert address. The real setting lives in the database so it can
    # be changed from the Super Admin dashboard without a redeploy; this is only
    # used if that has never been set.
    backup_alert_email: str = ""

    # Sentry
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1
    sentry_profiles_sample_rate: float = 0.1

    # Rate Limiting
    rate_limit_login: str = "5/minute"
    rate_limit_password_reset: str = "3/5minutes"
    # Per signed-in user (the limiter keys on the token subject), not per
    # school and not per IP. One principal opening the dashboard costs well
    # over a hundred calls - the prefetch alone fans out across a dozen
    # tables - so a 100/minute ceiling meant the first page load of the day
    # answered 429 and the dashboard came up empty. Login and password reset
    # keep their own much tighter limits above, which is where brute force
    # actually matters.
    rate_limit_api: str = "600/minute"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
