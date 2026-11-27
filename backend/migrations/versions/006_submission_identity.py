"""Persist idempotent mining submissions without modifying historical runs."""

from alembic import op

revision = "006"
down_revision = "005"


def upgrade():
    op.execute("ALTER TABLE retail.runs ADD COLUMN submission_key UUID")
    op.execute(
        "CREATE UNIQUE INDEX ix_runs_owner_submission ON retail.runs (owner_id, submission_key) WHERE submission_key IS NOT NULL"
    )


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; use a reviewed migration")
