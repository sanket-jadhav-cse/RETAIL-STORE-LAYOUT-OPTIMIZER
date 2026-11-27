from pathlib import Path

import jwt
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.orm import sessionmaker


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
        hide_input_in_errors=True,
    )
    database_url: str = "postgresql+psycopg://localhost/retail"
    cors_allowed_origins: str = "http://localhost:5173"
    operator_token: str = ""
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    mining_runs_per_hour: int = 6
    migration_database_url: str = ""
    data_dir: Path = Path(__file__).resolve().parents[2] / "data/processed"
    mining_timeout_seconds: int = 300
    mining_memory_mb: int = 2048
    database_pool_size: int = Field(default=5, ge=1, le=20)
    database_max_overflow: int = Field(default=0, ge=0, le=5)
    database_pool_timeout: int = Field(default=10, ge=1, le=60)
    database_pool_recycle: int = Field(default=900, ge=60, le=3600)
    database_connect_timeout: int = Field(default=10, ge=1, le=60)
    database_statement_timeout_ms: int = Field(default=30000, ge=1000, le=120000)
    database_lock_timeout_ms: int = Field(default=5000, ge=100, le=30000)
    scheduler_reconnect_max_seconds: int = Field(default=30, ge=1, le=60)

    @field_validator("supabase_publishable_key")
    @classmethod
    def public_auth_key(cls, value):
        if value.startswith("sb_secret_"):
            raise ValueError("Use a public Supabase publishable or anon key")
        if value.count(".") == 2:
            # Classify a legacy API key only; this does NOT authenticate a user.
            try:
                role = jwt.decode(value, options={"verify_signature": False}).get(
                    "role"
                )
            except jwt.PyJWTError:
                raise ValueError("Invalid public Supabase API key") from None
            if role != "anon":
                raise ValueError("Only an anon JWT API key is permitted here")
        return value


settings = Settings()
url = make_url(settings.database_url).set(drivername="postgresql+psycopg")
if (
    url.host
    and "supabase.com" in url.host
    and url.query.get("sslmode") not in ("require", "verify-full")
):
    raise ValueError("Supabase connections require SSL")
engine = create_engine(
    url,
    pool_pre_ping=True,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_timeout=settings.database_pool_timeout,
    pool_recycle=settings.database_pool_recycle,
    connect_args={
        "connect_timeout": settings.database_connect_timeout,
        "options": f"-c statement_timeout={settings.database_statement_timeout_ms} -c lock_timeout={settings.database_lock_timeout_ms}",
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
        "tcp_user_timeout": 20000,
    },
    hide_parameters=True,
)
Session = sessionmaker(engine, expire_on_commit=False)
MaintenanceSession = sessionmaker(
    engine, expire_on_commit=False, info={"maintenance": True}
)


@event.listens_for(OrmSession, "after_begin")
def transaction_identity(session, transaction, connection):
    # SET LOCAL is reset by PostgreSQL at commit/rollback, including pooled reuse.
    connection.execute(
        text(
            "SELECT set_config('retail.user_id', :uid, true), "
            "set_config('retail.maintenance', :maintenance, true)"
        ),
        {
            "uid": str(session.info.get("user_id", "")),
            "maintenance": "on" if session.info.get("maintenance") else "off",
        },
    )
