"""Owner-only setup: create a scoped runtime login and save a local runtime URL."""

import os
import secrets
from pathlib import Path

from app.config import engine
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
url = engine.url.set(username="retail_app.gycudrddfpchdfmiqvny", password=password)
path = Path(__file__).resolve().parents[1] / ".env.runtime"
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as stream:
    stream.write("DATABASE_URL=" + url.render_as_string(hide_password=False) + "\n")
print(
    "Created retail_app role; runtime connection stored in ignored backend/.env.runtime"
)
