"""Index measured account history and rate-limit query patterns."""

from alembic import op

revision = "005"
down_revision = "004"


def upgrade():
    op.execute(
        "CREATE INDEX ix_runs_owner_created ON retail.runs (owner_id,created_at DESC,run_id DESC) WHERE owner_id IS NOT NULL"
    )


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; use a reviewed migration")
