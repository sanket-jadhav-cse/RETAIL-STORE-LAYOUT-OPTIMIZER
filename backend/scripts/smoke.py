"""Real HTTP workflow; creates one run but performs no destructive operations."""

import json
import time

import httpx
from app.config import settings

with httpx.Client(base_url="http://127.0.0.1:8000/api/v1", timeout=30) as client:
    assert client.get("/health").status_code == 200
    dataset = client.get("/datasets").json()[0]
    response = client.post(
        "/runs",
        json={
            "dataset_id": dataset["dataset_id"],
            "min_support": 0.02,
            "min_confidence": 0.5,
            "min_lift": 1,
            "max_itemset_size": 3,
        },
        headers={"Authorization": f"Bearer {settings.operator_token}"},
    )
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    for _ in range(160):
        run = client.get(f"/runs/{run_id}").json()
        if run["status"] in ("Completed", "Failed"):
            break
        time.sleep(2)
    print(json.dumps(run, indent=2))
    assert run["status"] == "Completed"
    for suffix in ("rules", "adjacencies", "report", "itemsets", "report.csv"):
        response = client.get(f"/runs/{run_id}/{suffix}")
        assert response.status_code == 200, (suffix, response.text)
    report = client.get(f"/runs/{run_id}/report").json()
    from pathlib import Path

    (Path(__file__).resolve().parents[2] / "docs/evaluation-results.json").write_text(
        json.dumps(report, indent=2)
    )
    print("All result endpoints verified. Run:", run_id)
