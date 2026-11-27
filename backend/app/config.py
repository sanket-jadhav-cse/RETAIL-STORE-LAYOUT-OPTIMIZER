from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.orm import sessionmaker


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
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
    pool_size=5,
    max_overflow=0,
    pool_timeout=10,
    pool_recycle=900,
    connect_args={
        "connect_timeout": 10,
        "options": "-c statement_timeout=30000 -c lock_timeout=5000",
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
