from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
    )
    database_url: str = "postgresql+psycopg://localhost/retail"
    cors_allowed_origins: str = "http://localhost:5173"
    operator_token: str = ""
    migration_database_url: str = ""
    data_dir: Path = Path(__file__).resolve().parents[2] / "data/processed"
    mining_timeout_seconds: int = 300
    mining_memory_mb: int = 2048


settings = Settings()
url = make_url(settings.database_url).set(drivername="postgresql+psycopg")
if (
    url.host
    and "supabase.com" in url.host
    and url.query.get("sslmode") not in ("require", "verify-full")
):
    raise ValueError("Supabase connections require SSL")
engine = create_engine(
    url, pool_pre_ping=True, pool_size=5, max_overflow=0, hide_parameters=True
)
Session = sessionmaker(engine, expire_on_commit=False)
