"""Exercise immutable migrations and RLS under a non-owner role; roll back all DDL."""

import importlib.util
import re
import uuid
from pathlib import Path
from types import SimpleNamespace

from app.config import settings
from sqlalchemy import create_engine, text


def test_additive_migration_and_pooled_identity():
    engine = create_engine(
        settings.migration_database_url or settings.database_url,
        hide_parameters=True,
        pool_pre_ping=True,
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000 -c lock_timeout=5000",
        },
    )
    schema = "retail_test_" + uuid.uuid4().hex
    role = "retail_test_role_" + uuid.uuid4().hex[:12]
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            for filename in ["001_initial.py", "002_account_ownership.py"]:
                spec = importlib.util.spec_from_file_location(
                    "migration_test", Path("migrations/versions") / filename
                )
                migration = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(migration)
                migration.op = SimpleNamespace(
                    execute=lambda sql: conn.execute(
                        text(
                            re.sub(r"\bretail\b", schema, sql)
                            .replace(schema + ".user_id", "retail.user_id")
                            .replace(schema + ".maintenance", "retail.maintenance")
                        )
                    )
                )
                migration.upgrade()
                if filename.startswith("001"):
                    conn.execute(
                        text(
                            f"INSERT INTO {schema}.datasets VALUES (:id,'legacy','v1',:checksum,1,'{{}}',now())"
                        ),
                        {"id": uuid.UUID(int=10), "checksum": uuid.uuid4().hex},
                    )
            assert conn.execute(
                text(f"SELECT owner_id, is_shared FROM {schema}.datasets")
            ).one() == (None, False)
            conn.execute(text(f"CREATE ROLE {role} NOLOGIN"))
            conn.execute(text(f"GRANT {role} TO CURRENT_USER"))
            conn.execute(text(f"GRANT USAGE ON SCHEMA {schema} TO {role}"))
            conn.execute(
                text(
                    f"GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA {schema} TO {role}"
                )
            )
            for table in ["datasets", "products", "runs", "rules", "adjacencies"]:
                conn.execute(
                    text(
                        f"CREATE POLICY test_runtime ON {schema}.{table} TO {role} USING (true) WITH CHECK (true)"
                    )
                )
            conn.execute(text(f"UPDATE {schema}.datasets SET is_shared=true"))
            for user in [1, 2]:
                conn.execute(
                    text(
                        f"INSERT INTO {schema}.runs (run_id,dataset_id,min_support,min_confidence,min_lift,status,created_at,execution,itemsets,owner_id) VALUES (:id,:dataset,.02,.5,1,'Completed',now(),'{{}}','[]',:owner)"
                    ),
                    {
                        "id": uuid.UUID(int=100 + user),
                        "dataset": uuid.UUID(int=10),
                        "owner": uuid.UUID(int=user),
                    },
                )
            conn.execute(text(f"SET LOCAL ROLE {role}"))
            for user in [1, 2]:
                conn.execute(
                    text(
                        "SELECT set_config('retail.user_id',:uid,true),set_config('retail.maintenance','off',true)"
                    ),
                    {"uid": str(uuid.UUID(int=user))},
                )
                assert conn.execute(
                    text(f"SELECT run_id FROM {schema}.runs")
                ).scalars().all() == [uuid.UUID(int=100 + user)]
                assert (
                    conn.execute(
                        text(f"SELECT count(*) FROM {schema}.datasets")
                    ).scalar()
                    == 1
                )
            # No request identity means no private rows, even on the same connection.
            conn.execute(text("SELECT set_config('retail.user_id','',true)"))
            assert (
                conn.execute(text(f"SELECT count(*) FROM {schema}.runs")).scalar() == 0
            )
        finally:
            transaction.rollback()
    # Transaction-local identity is gone after rollback/pool reuse.
    with engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT NULLIF(current_setting('retail.user_id',true),'')")
            ).scalar()
            is None
        )
    engine.dispose()
