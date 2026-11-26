"""Run from backend: python scripts/setup_env.py. Password never echoed."""

import os
import secrets
from getpass import getpass
from pathlib import Path

from sqlalchemy import URL

path = Path(__file__).resolve().parents[1] / ".env"
if path.exists():
    raise SystemExit(".env already exists; edit it locally rather than overwriting")
password = getpass("Supabase database password: ")
if not password:
    raise SystemExit("Password is required")
url = URL.create(
    "postgresql+psycopg",
    username="postgres.gycudrddfpchdfmiqvny",
    password=password,
    host="aws-1-ap-northeast-1.pooler.supabase.com",
    port=5432,
    database="postgres",
    query={"sslmode": "require"},
)
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as stream:
    stream.write("DATABASE_URL=" + url.render_as_string(hide_password=False) + "\n")
    stream.write(
        "OPERATOR_TOKEN="
        + secrets.token_urlsafe(32)
        + "\nCORS_ALLOWED_ORIGINS=http://localhost:5173\n"
    )
print("Saved backend/.env with owner-only permissions. No credentials displayed.")
