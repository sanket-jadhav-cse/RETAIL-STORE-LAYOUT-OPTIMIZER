"""Immutable initial PostgreSQL retail schema."""

from alembic import op

revision = "001"
down_revision = None


def upgrade():
    op.execute("CREATE SCHEMA IF NOT EXISTS retail")
    op.execute("REVOKE ALL ON SCHEMA retail FROM PUBLIC")
    op.execute(
        "\nCREATE TABLE retail.datasets (\n\tdataset_id UUID NOT NULL, \n\tsource VARCHAR NOT NULL, \n\tversion VARCHAR NOT NULL, \n\tchecksum VARCHAR NOT NULL, \n\tbasket_count INTEGER NOT NULL, \n\tsummary JSONB NOT NULL, \n\timported_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (dataset_id), \n\tUNIQUE (checksum)\n)\n\n"
    )
    op.execute(
        "\nCREATE TABLE retail.products (\n\tdataset_id UUID NOT NULL, \n\tproduct_code VARCHAR NOT NULL, \n\tdescription VARCHAR NOT NULL, \n\tPRIMARY KEY (dataset_id, product_code), \n\tFOREIGN KEY(dataset_id) REFERENCES retail.datasets (dataset_id)\n)\n\n"
    )
    op.execute(
        "\nCREATE TABLE retail.runs (\n\trun_id UUID NOT NULL, \n\tdataset_id UUID NOT NULL, \n\tmin_support FLOAT NOT NULL, \n\tmin_confidence FLOAT NOT NULL, \n\tmin_lift FLOAT NOT NULL, \n\tmax_itemset_size INTEGER, \n\tstatus VARCHAR NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tcompleted_at TIMESTAMP WITH TIME ZONE, \n\terror VARCHAR, \n\texecution JSONB NOT NULL, \n\titemsets JSONB NOT NULL, \n\tPRIMARY KEY (run_id), \n\tUNIQUE (run_id, dataset_id), \n\tCHECK (status IN ('Queued','Running','Completed','Failed')), \n\tCHECK (min_support > 0 AND min_support <= 1), \n\tCHECK (min_confidence > 0 AND min_confidence <= 1), \n\tCHECK (min_lift >= 0), \n\tFOREIGN KEY(dataset_id) REFERENCES retail.datasets (dataset_id)\n)\n\n"
    )
    op.execute("CREATE INDEX ix_retail_runs_dataset_id ON retail.runs (dataset_id)")
    op.execute("CREATE INDEX ix_retail_runs_status ON retail.runs (status)")
    op.execute(
        "\nCREATE TABLE retail.adjacencies (\n\tadjacency_id UUID NOT NULL, \n\trun_id UUID NOT NULL, \n\tdataset_id UUID NOT NULL, \n\tproduct_a VARCHAR NOT NULL, \n\tproduct_b VARCHAR NOT NULL, \n\tsupport FLOAT NOT NULL, \n\tconfidence_a_b FLOAT, \n\tconfidence_b_a FLOAT, \n\tlift FLOAT NOT NULL, \n\trank INTEGER NOT NULL, \n\trationale VARCHAR NOT NULL, \n\tPRIMARY KEY (adjacency_id), \n\tFOREIGN KEY(run_id, dataset_id) REFERENCES retail.runs (run_id, dataset_id), \n\tFOREIGN KEY(dataset_id, product_a) REFERENCES retail.products (dataset_id, product_code), \n\tFOREIGN KEY(dataset_id, product_b) REFERENCES retail.products (dataset_id, product_code), \n\tUNIQUE (run_id, product_a, product_b), \n\tUNIQUE (run_id, rank), \n\tCHECK (product_a < product_b)\n)\n\n"
    )
    op.execute(
        "CREATE INDEX ix_retail_adjacencies_run_id ON retail.adjacencies (run_id)"
    )
    op.execute(
        "\nCREATE TABLE retail.rules (\n\trule_id UUID NOT NULL, \n\trun_id UUID NOT NULL, \n\tantecedent JSONB NOT NULL, \n\tconsequent JSONB NOT NULL, \n\tsupport FLOAT NOT NULL, \n\tconfidence FLOAT NOT NULL, \n\tlift FLOAT NOT NULL, \n\tPRIMARY KEY (rule_id), \n\tFOREIGN KEY(run_id) REFERENCES retail.runs (run_id)\n)\n\n"
    )
    op.execute("CREATE INDEX ix_retail_rules_run_id ON retail.rules (run_id)")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; use a reviewed migration")
