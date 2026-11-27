"""Create the single root .env without echoing or hardcoding project credentials."""

import os
from getpass import getpass
from pathlib import Path

from app.config import Settings
from sqlalchemy import URL

path = Path(__file__).resolve().parents[2] / ".env"
if path.exists():
    raise SystemExit(
        "Root .env already exists; edit it privately instead of overwriting"
    )
host = input("Supabase Session Pooler host: ").strip()
username = input("Database username (including project suffix): ").strip()
database = input("Database name [postgres]: ").strip() or "postgres"
port = int(input("Session Pooler port [5432]: ").strip() or "5432")
password = getpass("Database password: ")
public_url = input("Public Supabase project URL: ").strip()
public_key = input("Public Supabase publishable/anon key: ").strip()
if not all([host, username, password, public_url, public_key]):
    raise SystemExit("Connection details and public Auth settings are required")
Settings(_env_file=None, supabase_url=public_url, supabase_publishable_key=public_key)
url = URL.create(
    "postgresql+psycopg",
    username=username,
    password=password,
    host=host,
    port=port,
    database=database,
    query={"sslmode": "require"},
)
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as stream:
    stream.write("DATABASE_URL=" + url.render_as_string(hide_password=False) + "\n")
    stream.write(f"SUPABASE_URL={public_url}\nSUPABASE_PUBLISHABLE_KEY={public_key}\n")
    stream.write(
        "API_BASE_URL=http://localhost:8000\nCORS_ALLOWED_ORIGINS=http://localhost:5173\n"
    )
print("Saved root .env with owner-only permissions. No credentials displayed.")
