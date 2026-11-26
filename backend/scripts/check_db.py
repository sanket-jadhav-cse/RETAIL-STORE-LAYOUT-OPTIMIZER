from app.config import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        print("SELECT 1:", conn.scalar(text("SELECT 1")))
        print("Client TLS:", conn.connection.driver_connection.pgconn.ssl_in_use)
        print(
            "Schemas:",
            conn.execute(
                text(
                    "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' ORDER BY 1"
                )
            )
            .scalars()
            .all(),
        )
        print(
            "Retail tables:",
            conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema='retail'"
                )
            )
            .scalars()
            .all(),
        )
except Exception as exc:
    print(
        "Connection failed:",
        type(exc).__name__,
        "(details withheld to protect credentials)",
    )
    raise SystemExit(1)
