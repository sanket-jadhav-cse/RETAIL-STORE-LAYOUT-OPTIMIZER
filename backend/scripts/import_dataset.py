import argparse
import hashlib
import json
import os
from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse
from uuid import UUID

from app.config import MaintenanceSession as Session
from app.config import settings
from app.datasets import UCI_CHECKSUM, UCI_METADATA
from app.mining.preprocessing import load, preprocess
from app.models import Dataset, Product
from sqlalchemy import select, text


def dataset_metadata(path, checksum, summary, name, description, source, source_url):
    if checksum == UCI_CHECKSUM:
        metadata = dict(UCI_METADATA)
    else:
        display_name = (
            name.strip()
            if name
            else path.stem.replace("_", " ").replace("-", " ").strip().title()[:200]
        )
        metadata = {
            "name": display_name or "Imported transaction dataset",
            "description": description.strip()[:1000] if description else None,
            "source": source or "Owner-provided transaction file",
            "source_url": source_url,
            "source_organization": None,
            "doi": None,
        }
    metadata.update(
        transaction_start=date.fromisoformat(summary["transaction_start"])
        if summary.get("transaction_start")
        else None,
        transaction_end=date.fromisoformat(summary["transaction_end"])
        if summary.get("transaction_end")
        else None,
        processing_status="Ready",
    )
    return metadata


def write_artifact(checksum, baskets):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    artifact = settings.data_dir / f"{checksum}.json"
    with NamedTemporaryFile(mode="w", dir=settings.data_dir, delete=False) as output:
        json.dump(baskets, output)
        temporary = output.name
    try:
        os.replace(temporary, artifact)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def refresh_existing(existing, checksum, baskets, products, summary, metadata):
    if existing.basket_count != len(baskets) or existing.summary.get(
        "product_count"
    ) != len(products):
        raise ValueError(
            "Recalculated dataset statistics differ; investigate before updating"
        )
    for key, value in metadata.items():
        if (
            checksum != UCI_CHECKSUM
            and existing.summary.get("metadata_version") == 1
            and key not in {"transaction_start", "transaction_end", "processing_status"}
        ):
            continue
        setattr(existing, key, value)
    existing.summary = summary
    if checksum == UCI_CHECKSUM:
        existing.is_shared = True
    print("Verified metadata/artifact:", existing.dataset_id)
    return existing.dataset_id


def import_dataset(
    path,
    *,
    name=None,
    description=None,
    source=None,
    source_url=None,
    owner_id=None,
    shared=False,
):
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    if name is not None and (not name.strip() or len(name.strip()) > 200):
        raise ValueError("Dataset name must contain 1–200 characters")
    if source_url and (
        urlparse(source_url).scheme != "https" or not urlparse(source_url).netloc
    ):
        raise ValueError("Source URL must use HTTPS")
    with Session() as session:
        existing = session.scalar(select(Dataset).where(Dataset.checksum == checksum))
        if (
            existing
            and existing.summary.get("metadata_version") == 1
            and (settings.data_dir / f"{checksum}.json").is_file()
        ):
            print("Already imported:", existing.dataset_id)
            return existing.dataset_id
    baskets, products, summary = preprocess(load(path))
    if not baskets:
        raise ValueError("No eligible baskets")
    metadata = dataset_metadata(
        path, checksum, summary, name, description, source, source_url
    )
    write_artifact(checksum, baskets)
    with Session.begin() as session:
        session.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(checksum[:15], 16)}
        )
        existing = session.scalar(select(Dataset).where(Dataset.checksum == checksum))
        if existing:
            return refresh_existing(
                existing, checksum, baskets, products, summary, metadata
            )
        dataset = Dataset(
            **metadata,
            version="sha256:" + checksum[:12],
            checksum=checksum,
            basket_count=len(baskets),
            summary=summary,
            owner_id=owner_id,
            is_shared=shared or checksum == UCI_CHECKSUM,
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
    parser.add_argument("--name")
    parser.add_argument("--description")
    parser.add_argument("--source")
    parser.add_argument("--source-url")
    parser.add_argument("--owner-id", type=UUID)
    parser.add_argument("--shared", action="store_true")
    args = vars(parser.parse_args())
    import_dataset(args.pop("path"), **args)
