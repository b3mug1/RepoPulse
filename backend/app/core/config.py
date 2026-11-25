from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = True
    app_secret_key: str = ""

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "analyzer"
    postgres_password: str = "analyzer_secret"
    postgres_db: str = "github_analyzer"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def sync_database_url(self) -> str:
        """Used by Alembic and Celery (synchronous drivers)."""
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    redis_url: str = "redis://localhost:6379/0"

    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    github_token: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    tokenharbor_api_key: str = ""
    tokenharbor_base_url: str = "https://tokenharbor.ai/v1"
    tokenharbor_model: str = "glm-5.3-flash"

    rate_limit_per_minute: int = 30
    trusted_proxies: str = ""
    max_request_body_bytes: int = 65536
    cors_origins: str = "http://localhost:4200,http://localhost:5173"

    def validate_production(self) -> None:
        if self.app_env != "production":
            return
        errors: list[str] = []
        insecure_placeholders = {"change-me", "change-me-in-production", "analyzer_secret", "secret", "default"}
        if len(self.app_secret_key) < 32 or self.app_secret_key.lower() in insecure_placeholders:
            errors.append("APP_SECRET_KEY (>= 32 chars, non-default)")
        if not self.postgres_password or self.postgres_password.lower() in insecure_placeholders:
            errors.append("POSTGRES_PASSWORD (non-default)")
        if self.app_debug:
            errors.append("APP_DEBUG must be false")
        if "*" in [o.strip() for o in self.cors_origins.split(",")]:
            errors.append("CORS_ORIGINS must not contain '*'")
        if errors:
            raise RuntimeError(
                "Production requires a secure configuration: " + ", ".join(errors)
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
