"""Persist display names while retaining UUID identity and legacy restriction."""

from alembic import op

revision = "004"
down_revision = "003"


def upgrade():
    op.execute("ALTER TABLE retail.runs ADD COLUMN name VARCHAR(120)")
    op.execute("""UPDATE retail.runs r SET name=left('Market Basket Analysis · ' || d.name ||
        ' · ' || to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',120)
        FROM retail.datasets d WHERE d.dataset_id=r.dataset_id""")
    op.execute("ALTER TABLE retail.runs ALTER COLUMN name SET NOT NULL")
    op.execute(
        "ALTER TABLE retail.runs ADD CONSTRAINT run_name_length CHECK (char_length(trim(name)) BETWEEN 1 AND 120)"
    )


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; use a reviewed migration")
