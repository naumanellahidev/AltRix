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
    port: int = 10000
    debug: bool = False

    # Database
    database_url: str = ""
    db_pool_type: str = "queue"  # "queue" for persistent servers (EC2, ECS, VM) or "null" for serverless (Vercel)
    db_pool_size: int = 20
    db_pool_max_overflow: int = 50

    # Supabase
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:8080,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:8080,http://127.0.0.1:3000"

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

    # AI
    gemini_api_key: str = ""
    ollama_url: str = "http://localhost:11434"
    ollama_reasoning_model: str = "deepseek-r1"
    ollama_general_model: str = "qwen2.5"

    # Cloud AI Flexibility (Railway/Production)
    ai_provider: str = "ollama"  # "ollama", "openai", "openrouter", "groq", "deepseek"
    ai_api_key: str = ""
    ai_api_base: str = ""
    ai_reasoning_model: str = ""  # If set, overrides the provider default
    ai_general_model: str = ""    # If set, overrides the provider default

    # Sentry
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1
    sentry_profiles_sample_rate: float = 0.1

    # Rate Limiting
    rate_limit_login: str = "5/minute"
    rate_limit_password_reset: str = "3/5minutes"
    rate_limit_api: str = "100/minute"

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
