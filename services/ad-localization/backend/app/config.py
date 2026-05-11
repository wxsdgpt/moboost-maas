from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[".env", "../.env", "../../.env"],
        env_file_encoding="utf-8",
        env_prefix="ADLOC_",
        case_sensitive=False,
        extra="ignore",
    )

    # core
    app_env: Literal["dev", "test", "staging", "prod"] = "dev"
    app_name: str = "ad-localization"
    log_level: str = "INFO"

    # db
    database_url: str = "postgresql+psycopg://postgres:dev123@localhost:5432/ad_localization"
    database_url_sync: str | None = None
    db_echo: bool = False

    # auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 60
    jwt_refresh_ttl_days: int = 14

    # service-to-service auth (from moboost-maas proxy)
    service_token: str | None = None  # ADLOC_SERVICE_TOKEN — shared secret for proxy auth

    # storage
    storage_driver: Literal["local", "s3"] = "local"
    storage_local_root: Path = Path("./storage")
    s3_bucket: str | None = None
    s3_region: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_endpoint_url: str | None = None

    # AI providers (Phase 3)
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    google_project_id: str | None = None
    vertex_location: str = "us-central1"

    # OpenRouter (OpenAI-compatible gateway; preferred path for everything).
    # Model ids are intentionally empty — user fills them in Admin → API keys.
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = ""
    openrouter_vision_model: str = ""
    openrouter_image_edit_model: str = ""
    openrouter_video_model: str = ""
    # Second-opinion reviewers paired with each generator (video has none).
    openrouter_text_review_model: str = ""
    openrouter_image_review_model: str = ""
    openrouter_site_url: str = "http://localhost:3000"
    openrouter_app_name: str = "ad-localization"

    # CORS
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"

    @property
    def sync_database_url(self) -> str:
        return self.database_url_sync or self.database_url.replace("+asyncpg", "").replace(
            "+psycopg", ""
        ) or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
