"""Add ownership without assigning any legacy records to new accounts."""

from alembic import op

revision = "002"
down_revision = "001"
SCHEMA = "retail"


def upgrade():
    s = SCHEMA
    op.execute(
        f"ALTER TABLE {s}.datasets ADD COLUMN owner_id UUID, ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(f"ALTER TABLE {s}.runs ADD COLUMN owner_id UUID")
    # Existing runtime_access policies stay in place; this RESTRICTIVE policy
    # intersects them and prevents their broad grants from bypassing ownership.
    maintenance = "current_setting('retail.maintenance', true) = 'on'"
    identity = "NULLIF(current_setting('retail.user_id', true), '')::uuid"
    for table in ("datasets", "products", "runs", "rules", "adjacencies"):
        if table == "datasets":
            read = f"is_shared OR owner_id = {identity}"
            write = f"NOT is_shared AND owner_id = {identity}"
        elif table == "products":
            read = f"EXISTS (SELECT 1 FROM {s}.datasets d WHERE d.dataset_id = products.dataset_id AND (d.is_shared OR d.owner_id = {identity}))"
            write = f"EXISTS (SELECT 1 FROM {s}.datasets d WHERE d.dataset_id = products.dataset_id AND NOT d.is_shared AND d.owner_id = {identity})"
        elif table == "runs":
            read = write = f"owner_id = {identity}"
        else:
            read = write = (
                f"EXISTS (SELECT 1 FROM {s}.runs r WHERE r.run_id = {table}.run_id AND r.owner_id = {identity})"
            )
        op.execute(f"ALTER TABLE {s}.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY account_isolation ON {s}.{table} AS RESTRICTIVE USING (({maintenance}) OR ({read})) WITH CHECK (({maintenance}) OR ({write}))"
        )
    # A boolean reveals no private run data; keeps global bounded concurrency
    # effective even when RLS correctly hides another account's active job.
    op.execute(f"""CREATE FUNCTION {s}.mining_busy() RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
        AS 'SELECT EXISTS (SELECT 1 FROM {s}.runs WHERE status IN (''Queued'', ''Running''))'""")
    op.execute(f"REVOKE ALL ON FUNCTION {s}.mining_busy() FROM PUBLIC")
    op.execute(f"""DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='retail_app') THEN
        GRANT EXECUTE ON FUNCTION {s}.mining_busy() TO retail_app;
        END IF; END $$""")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; use a reviewed migration")
