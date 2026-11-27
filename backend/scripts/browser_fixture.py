"""Export aggregate-only offline browser regression data. Never used by the app."""

import json
from pathlib import Path
from uuid import UUID

from app.config import MaintenanceSession
from app.main import pair_dict, rule_dict
from app.models import Adjacency, AssociationRule, Dataset, MiningRun, Product
from app.schemas import DatasetOut, RunOut
from sqlalchemy import select

with MaintenanceSession() as session:
    dataset = session.scalar(select(Dataset).order_by(Dataset.imported_at).limit(1))
    run = session.scalar(
        select(MiningRun)
        .where(
            MiningRun.dataset_id == dataset.dataset_id, MiningRun.status == "Completed"
        )
        .order_by(MiningRun.created_at.desc())
        .limit(1)
    )
    labels = dict(
        session.execute(
            select(Product.product_code, Product.description).where(
                Product.dataset_id == dataset.dataset_id
            )
        ).all()
    )
    ds = DatasetOut.model_validate(dataset).model_dump(mode="json")
    ds["latest_run_id"] = str(run.run_id)
    output = dict(
        dataset=ds,
        run=RunOut.model_validate(run).model_dump(mode="json"),
        rules=[
            rule_dict(row, labels)
            for row in session.scalars(
                select(AssociationRule)
                .where(AssociationRule.run_id == run.run_id)
                .order_by(AssociationRule.lift.desc())
            )
        ],
        pairs=[
            {
                k: str(v) if isinstance(v, UUID) else v
                for k, v in pair_dict(row, labels).items()
            }
            for row in session.scalars(
                select(Adjacency)
                .where(Adjacency.run_id == run.run_id)
                .order_by(Adjacency.rank)
            )
        ],
    )
path = (
    Path(__file__).resolve().parents[2]
    / "test-results/improvements/browser-fixture.json"
)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(output))
print(
    "Exported offline aggregate browser regression fixture; no customer, account or credential data"
)
