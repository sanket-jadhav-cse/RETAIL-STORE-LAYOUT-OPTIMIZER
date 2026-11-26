import argparse
import hashlib
import json
import os
from pathlib import Path

from app.config import Session, settings
from app.mining.preprocessing import load, preprocess
from app.models import Dataset, Product
from sqlalchemy import select


def import_dataset(path):
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    with Session() as session:
        existing = session.scalar(select(Dataset).where(Dataset.checksum == checksum))
        if existing and (settings.data_dir / f"{checksum}.json").is_file():
            print("Already imported:", existing.dataset_id)
            return existing.dataset_id
    baskets, products, summary = preprocess(load(path))
    if not baskets:
        raise ValueError("No eligible baskets")
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    artifact = settings.data_dir / f"{checksum}.json"
    temporary = artifact.with_suffix(".tmp")
    temporary.write_text(json.dumps(baskets))
    os.replace(temporary, artifact)
    with Session.begin() as session:
        existing = session.scalar(select(Dataset).where(Dataset.checksum == checksum))
        if existing:
            print("Repaired basket artifact:", existing.dataset_id)
            return existing.dataset_id
        dataset = Dataset(
            source="UCI Online Retail — Chen (2015), CC BY 4.0",
            version="2010-12-01–2011-12-09",
            checksum=checksum,
            basket_count=len(baskets),
            summary=summary,
        )
        session.add(dataset)
        session.flush()
        session.add_all(
            [
                Product(dataset_id=dataset.dataset_id, product_code=k, description=v)
                for k, v in products.items()
            ]
        )
        dataset_id = dataset.dataset_id
    print("Imported:", dataset_id)
    print(json.dumps(summary, indent=2))
    return dataset_id


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    import_dataset(parser.parse_args().path)
