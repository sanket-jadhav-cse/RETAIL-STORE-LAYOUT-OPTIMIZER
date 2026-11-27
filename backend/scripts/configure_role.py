"""Owner-only setup: create a scoped runtime login and save a local runtime URL."""

import secrets
from pathlib import Path

from app.config import engine
from dotenv import set_key
from sqlalchemy import text

password = secrets.token_urlsafe(40)
role = "retail_app"
with engine.begin() as conn:
    if conn.scalar(text("SELECT 1 FROM pg_roles WHERE rolname=:role"), {"role": role}):
        raise SystemExit("retail_app already exists; refusing to change its password")
    # Password is generated exclusively from the URL-safe alphabet; never logged.
    conn.exec_driver_sql(f"CREATE ROLE retail_app LOGIN PASSWORD '{password}'")
    conn.execute(text("GRANT USAGE ON SCHEMA retail TO retail_app"))
    conn.execute(
        text(
            "GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA retail TO retail_app"
        )
    )
    conn.execute(text("REVOKE ALL ON retail.alembic_version FROM retail_app"))
    conn.execute(
        text(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA retail GRANT SELECT, INSERT, UPDATE ON TABLES TO retail_app"
        )
    )
    # Defense in depth: not exposed through public Data API, and API roles get no grants.
    for table in ("datasets", "products", "runs", "rules", "adjacencies"):
        conn.execute(text(f"ALTER TABLE retail.{table} ENABLE ROW LEVEL SECURITY"))
        conn.execute(
            text(
                f"CREATE POLICY runtime_access ON retail.{table} TO retail_app USING (true) WITH CHECK (true)"
            )
        )
    conn.execute(text("GRANT EXECUTE ON FUNCTION retail.mining_busy() TO retail_app"))
# Preserve the Session Pooler's project suffix without embedding a project ID.
username = engine.url.username or ""
suffix = "." + username.split(".", 1)[1] if "." in username else ""
url = engine.url.set(username="retail_app" + suffix, password=password)
path = Path(__file__).resolve().parents[2] / ".env"
set_key(path, "RUNTIME_DATABASE_URL", url.render_as_string(hide_password=False))
path.chmod(0o600)
print(
    "Created runtime role; staged its connection in the ignored root .env. Run activate_runtime.py next."
)
