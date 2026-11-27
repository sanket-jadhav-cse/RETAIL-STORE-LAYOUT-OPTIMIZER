import io
import json
from pathlib import Path
from uuid import uuid4

import pytest
from app import worker
from app.config import settings
from app.mining.preprocessing import preprocess
from app.uploads import column_mapping, parse_file, suggest_mapping

pytest_plugins = ["test_api_postgres"]

EXAMPLES = Path(__file__).resolve().parents[2] / "frontend/public/examples"
MAPPING = {
    "InvoiceNo": "TransactionID",
    "StockCode": "ProductID",
    "Quantity": "Quantity",
    "Description": "ProductName",
    "InvoiceDate": "TransactionDate",
}


def test_description_and_customer_not_required():
    import pandas as pd

    baskets, products, summary = preprocess(
        pd.DataFrame(
            {"InvoiceNo": ["1", "2"], "StockCode": ["A", "B"], "Quantity": [1, 1]}
        )
    )
    assert baskets == [["A"], ["B"]]
    assert products == {"A": "A", "B": "B"}
    assert summary["basket_count"] == 2


def test_ambiguous_mapping_is_never_guessed():
    assert "InvoiceNo" not in suggest_mapping(
        ["InvoiceNo", "TransactionID", "ProductID", "Quantity"]
    )
    with pytest.raises(ValueError, match="only once"):
        column_mapping(
            ["InvoiceNo", "Quantity"],
            {
                "InvoiceNo": "InvoiceNo",
                "StockCode": "InvoiceNo",
                "Quantity": "Quantity",
            },
        )


@pytest.mark.parametrize("format", ["csv", "xlsx"])
def test_real_upload_mine_export_isolation_persistence(client, store, format):
    source = (EXAMPLES / f"synthetic-retail.{format}").read_bytes()
    preview = client.post(
        "/api/v1/datasets/preview", params={"format": format}, content=source
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["mapping"] == MAPPING
    assert len(preview.json()["sample"]) <= 8
    params = {
        "format": format,
        "name": f"SYNTHETIC QA {format}",
        "description": "Deterministic test only",
        "mapping": json.dumps(MAPPING),
    }
    response = client.post("/api/v1/datasets", params=params, content=source)
    assert response.status_code == 200, response.text
    d = response.json()
    dataset_id = d["dataset_id"]
    assert not d["is_shared"]
    assert d["basket_count"] == 100
    assert d["summary"]["original_records"] == 120
    assert d["summary"]["cleaned_records"] == 120
    assert d["summary"]["product_count"] == 3
    assert (
        client.post("/api/v1/datasets", params=params, content=source).json()[
            "dataset_id"
        ]
        == dataset_id
    )
    second = {"Authorization": "Bearer second-account"}
    assert (
        client.get(f"/api/v1/datasets/{dataset_id}/summary", headers=second).status_code
        == 404
    )
    assert (
        client.get(f"/api/v1/datasets/{dataset_id}/source", headers=second).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/datasets/{dataset_id}", headers=second, json={"name": "Stolen"}
        ).status_code
        == 404
    )
    assert client.get(f"/api/v1/datasets/{dataset_id}/source").content == source
    second_copy = client.post(
        "/api/v1/datasets", params=params, content=source, headers=second
    )
    assert second_copy.status_code == 200
    assert second_copy.json()["dataset_id"] != dataset_id
    assert (
        client.get(
            f"/api/v1/datasets/{second_copy.json()['dataset_id']}/summary"
        ).status_code
        == 404
    )

    key = str(uuid4())
    body = {
        "dataset_id": dataset_id,
        "name": "SYNTHETIC exact metrics",
        "min_support": 0.1,
        "min_confidence": 0.4,
        "min_lift": 1,
        "max_itemset_size": 2,
    }
    run = client.post("/api/v1/runs", json=body, headers={"Idempotency-Key": key})
    assert run.status_code == 202, run.text
    run_id = run.json()["run_id"]
    assert run.json()["status"] == "Queued"
    assert (
        client.post("/api/v1/runs", json=body, headers={"Idempotency-Key": key}).json()[
            "run_id"
        ]
        == run_id
    )
    assert (
        client.post(
            "/api/v1/runs",
            json={**body, "min_support": 0.2},
            headers={"Idempotency-Key": key},
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/datasets/{dataset_id}", json={"processing_status": "Archived"}
        ).status_code
        == 409
    )
    worker.run_job(run_id)
    saved = client.get(f"/api/v1/runs/{run_id}").json()
    assert saved["status"] == "Completed"
    assert saved["execution"]["itemset_count"] == 4
    assert saved["execution"]["rule_count"] == 2
    assert saved["execution"]["adjacency_count"] == 1
    pair = client.get(f"/api/v1/runs/{run_id}/adjacencies").json()["items"][0]
    assert pair["support"] == pytest.approx(0.2)
    assert pair["confidence_a_b"] == pytest.approx(2 / 3)
    assert pair["confidence_b_a"] == pytest.approx(0.5)
    assert pair["lift"] == pytest.approx(5 / 3)
    assert client.get(f"/api/v1/runs/{run_id}/rules").json()["total"] == 2
    csv = client.get(f"/api/v1/runs/{run_id}/report.csv")
    assert "Apples" in csv.text and "Bread" in csv.text
    for path in ["", "/rules", "/adjacencies", "/report", "/report.csv"]:
        assert (
            client.get(f"/api/v1/runs/{run_id}{path}", headers=second).status_code
            == 404
        )
    assert (
        client.patch(
            f"/api/v1/datasets/{dataset_id}", json={"name": "Renamed synthetic"}
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/v1/datasets/{dataset_id}", json={"processing_status": "Archived"}
        ).status_code
        == 200
    )
    assert client.post("/api/v1/runs", json=body).status_code == 409
    assert (
        client.get(f"/api/v1/runs/{run_id}/report").json()["recommendations"]["total"]
        == 1
    )


@pytest.mark.parametrize(
    "text,message",
    [
        ("", "empty"),
        ("InvoiceNo,StockCode,Quantity\n", "no transaction"),
        ("InvoiceNo,StockCode,StockCode\n1,A,1\n", "Duplicate"),
        ("InvoiceNo,StockCode,Quantity\n1,A,1,extra\n", "different number"),
    ],
)
def test_invalid_csv_bounded_validation(tmp_path, text, message):
    source = tmp_path / "bad.csv"
    source.write_text(text)
    with pytest.raises(ValueError, match=message):
        parse_file(source, "csv", {}, tmp_path / "output", preview=True)


def test_formula_corrupt_and_empty_cleaned(client, tmp_path):
    from openpyxl import Workbook

    book = Workbook()
    sheet = book.active
    sheet.append(["InvoiceNo", "StockCode", "Quantity"])
    sheet.append(["1", "A", "=1+1"])
    stream = io.BytesIO()
    book.save(stream)
    assert (
        client.post(
            "/api/v1/datasets/preview",
            params={"format": "xlsx"},
            content=stream.getvalue(),
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/datasets/preview", params={"format": "xlsx"}, content=b"broken"
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/datasets/preview", params={"format": "exe"}, content=b"not data"
        ).status_code
        == 422
    )
    source = b"InvoiceNo,StockCode,Quantity\nC1,A,1\n2,B,-1\n"
    response = client.post(
        "/api/v1/datasets",
        params={
            "format": "csv",
            "name": "Invalid cleaned data",
            "mapping": json.dumps(
                {
                    "InvoiceNo": "InvoiceNo",
                    "StockCode": "StockCode",
                    "Quantity": "Quantity",
                }
            ),
        },
        content=source,
    )
    assert response.status_code == 422
    assert "two valid" in response.json()["detail"]
    assert not list(settings.data_dir.glob(".upload-*"))


def test_upload_size_and_actual_workbook_expansion(client, monkeypatch):
    import zipfile

    monkeypatch.setattr(settings, "upload_max_bytes", 12)
    assert (
        client.post(
            "/api/v1/datasets/preview",
            params={"format": "csv"},
            content=b"A,B,C\n" + b"x" * 20,
        ).status_code
        == 413
    )
    monkeypatch.setattr(settings, "upload_max_bytes", 50 * 1024**2)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        output.writestr("xl/worksheets/sheet1.xml", b"0" * (121 * 1024**2))
    response = client.post(
        "/api/v1/datasets/preview",
        params={"format": "xlsx"},
        content=archive.getvalue(),
    )
    assert response.status_code == 422
    assert "expands" in response.json()["detail"]


def test_private_source_cleanup_retains_referenced_and_recent_files(tmp_path):
    import os

    from scripts.cleanup_uploads import candidates

    sources = tmp_path / "sources"
    sources.mkdir()
    referenced = "a" * 64
    orphan = "b" * 64
    for name in [referenced, orphan]:
        source = sources / f"{name}.csv"
        source.write_text("test")
        os.utime(source, (1, 1))
    recent = sources / ("c" * 64 + ".csv")
    recent.write_text("new")
    assert list(candidates(tmp_path, {referenced}, 1000)) == [sources / f"{orphan}.csv"]


def test_slow_upload_transfer_is_bounded_and_safe(tmp_path, monkeypatch):
    import asyncio
    from types import SimpleNamespace

    from app.main import receive_upload
    from fastapi import HTTPException

    async def stream():
        yield b"A,B,C\n"
        await asyncio.sleep(0.1)
        yield b"late"

    monkeypatch.setattr(settings, "upload_timeout_seconds", 0.01)
    with pytest.raises(HTTPException) as failure:
        asyncio.run(
            receive_upload(SimpleNamespace(stream=stream), tmp_path / "partial")
        )
    assert failure.value.status_code == 408


def test_workbook_uses_safe_xml_parser():
    from openpyxl.xml.functions import DEFUSEDXML

    assert DEFUSEDXML is True


def test_shared_dataset_cannot_be_renamed_archived_or_downloaded_as_private(
    client, store
):
    from app.models import Dataset

    with store.begin() as session:
        dataset = Dataset(
            name="Protected shared source",
            source="Shared fixture",
            version="v1",
            checksum=uuid4().hex,
            is_shared=True,
            basket_count=2,
            summary={},
        )
        session.add(dataset)
        session.flush()
        identifier = dataset.dataset_id
    assert (
        client.patch(
            f"/api/v1/datasets/{identifier}", json={"name": "Changed"}
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/datasets/{identifier}", json={"processing_status": "Archived"}
        ).status_code
        == 403
    )
    assert client.get(f"/api/v1/datasets/{identifier}/source").status_code == 403
    assert (
        client.get(f"/api/v1/datasets/{identifier}/summary").json()["name"]
        == "Protected shared source"
    )
