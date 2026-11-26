"""Keep migration credential local; use least-privilege runtime for application."""

from pathlib import Path

from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
config = dotenv_values(root / ".env")
runtime = dotenv_values(root / ".env.runtime")
if not config.get("MIGRATION_DATABASE_URL"):
    config["MIGRATION_DATABASE_URL"] = config["DATABASE_URL"]
config["DATABASE_URL"] = runtime["DATABASE_URL"]
with (root / ".env").open("w") as stream:
    for key, value in config.items():
        stream.write(f"{key}={value}\n")
print("Runtime role activated; migration credential remains local and ignored.")
