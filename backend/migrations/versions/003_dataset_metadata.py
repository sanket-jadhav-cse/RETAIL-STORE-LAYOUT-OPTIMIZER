"""Add source-specific dataset metadata. Counts/dates are recalculated by import."""

from alembic import op

revision = "003"
down_revision = "002"


def upgrade():
    op.execute("""ALTER TABLE retail.datasets
      ADD COLUMN name VARCHAR(200) NOT NULL DEFAULT 'Imported transaction dataset',
      ADD COLUMN description VARCHAR(1000), ADD COLUMN source_organization VARCHAR(200),
      ADD COLUMN source_url VARCHAR(500), ADD COLUMN doi VARCHAR(200),
      ADD COLUMN transaction_start DATE, ADD COLUMN transaction_end DATE,
      ADD COLUMN processing_status VARCHAR(30) NOT NULL DEFAULT 'Ready'""")
    # Frozen verified checksum identifies this workbook, not arbitrary imports.
    op.execute("""UPDATE retail.datasets SET name='UCI Online Retail Dataset',
      description='UK-based online retail transaction data used for frequent-pattern mining and product-adjacency analysis.',
      source_organization='UCI Machine Learning Repository',
      source_url='https://archive.ics.uci.edu/dataset/352/online+retail',
      doi='https://doi.org/10.24432/C5BW33', is_shared=true
      WHERE checksum='43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d'""")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; use a reviewed migration")
