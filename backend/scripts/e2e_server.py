"""Loopback-only real API/worker fixture with a disposable local PostgreSQL DB.

Authentication is replaced ONLY in this test launcher. The application verifier
is unchanged. Never run this launcher against Supabase or expose it publicly.
"""

import os
import tempfile
import uuid


def serve():
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    admin_url = make_url(
        os.environ.get(
            "RETAIL_E2E_ADMIN_URL",
            "postgresql+psycopg://sanket@127.0.0.1:55432/postgres",
        )
    )
    if admin_url.host != "127.0.0.1":
        raise SystemExit("E2E database must be on loopback")
    name = "retailatlas_e2e_" + uuid.uuid4().hex
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f"CREATE DATABASE {name}"))
    with tempfile.TemporaryDirectory(prefix="retailatlas-e2e-") as directory:
        os.environ["DATABASE_URL"] = admin_url.set(database=name).render_as_string(
            hide_password=False
        )
        os.environ["DATA_DIR"] = directory
        os.environ["CORS_ALLOWED_ORIGINS"] = "http://localhost:5175"
        os.environ["MINING_RUNS_PER_HOUR"] = "30"
        from app import main
        from app.auth import Identity
        from app.config import engine
        from app.models import Base
        from fastapi import Header, HTTPException

        with engine.begin() as connection:
            connection.execute(text("CREATE SCHEMA retail"))
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE FUNCTION retail.mining_busy() RETURNS boolean LANGUAGE sql AS 'SELECT EXISTS (SELECT 1 FROM retail.runs WHERE status IN (''Queued'',''Running''))'"
                )
            )

        def identity(authorization: str | None = Header(default=None)):
            if authorization and authorization.endswith(".test-fixture-signature"):
                account = 1
            elif authorization == "Bearer isolated-e2e-second-account":
                account = 2
            else:
                raise HTTPException(401, "Test identity required")
            return Identity(
                uuid.UUID(int=account), f"planner{account}@example.invalid", {}
            )

        main.app.dependency_overrides[main.current_user] = identity
        import uvicorn

        try:
            uvicorn.run(main.app, host="127.0.0.1", port=8001, access_log=False)
        finally:
            engine.dispose()
            # Drop only this launcher's newly generated loopback database.
            with admin.connect() as connection:
                connection.execute(
                    text(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:name"
                    ),
                    {"name": name},
                )
                connection.execute(text(f"DROP DATABASE {name}"))
            admin.dispose()


if __name__ == "__main__":
    serve()
