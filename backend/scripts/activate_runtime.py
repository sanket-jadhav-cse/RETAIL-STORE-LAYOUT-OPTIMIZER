"""Activate a staged least-privilege runtime URL in the single root environment."""

from pathlib import Path

from dotenv import dotenv_values, set_key, unset_key

path = Path(__file__).resolve().parents[2] / ".env"
config = dotenv_values(path)
runtime = config.get("RUNTIME_DATABASE_URL")
if not runtime:
    raise SystemExit(
        "No staged runtime URL. Existing installations need no activation; new installations run configure_role.py first."
    )
if not config.get("MIGRATION_DATABASE_URL"):
    set_key(path, "MIGRATION_DATABASE_URL", config["DATABASE_URL"])
set_key(path, "DATABASE_URL", runtime)
unset_key(path, "RUNTIME_DATABASE_URL")
path.chmod(0o600)
print(
    "Runtime role activated; migration credential remains only in the ignored root .env."
)
