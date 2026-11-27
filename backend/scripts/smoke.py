"""Authenticated HTTP verification; writes only ignored evidence by default.

Use --run-id for read-only checks, or --create-run to create one private run.
The access token is read from RETAIL_ACCESS_TOKEN or a hidden terminal prompt.
"""

import argparse
import getpass
import json
import os
import time
from pathlib import Path
from uuid import UUID

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api/v1")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--run-id", type=UUID)
    action.add_argument("--create-run", action="store_true")
    parser.add_argument("--dataset-id", type=UUID)
    parser.add_argument("--expect-baseline", action="store_true")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "test-results/improvements/after/live-smoke.json",
    )
    args = parser.parse_args()
    token = os.environ.get("RETAIL_ACCESS_TOKEN") or getpass.getpass(
        "Supabase access token: "
    )
    if not token.strip():
        parser.error("A verified account access token is required")
    evidence = {"authenticated": True, "requests": []}
    with httpx.Client(
        base_url=args.base_url.rstrip("/") + "/",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    ) as client:

        def request(method, path, expected=200, **kwargs):
            started = time.perf_counter()
            response = client.request(method, path, **kwargs)
            evidence["requests"].append(
                {
                    "method": method,
                    "path": path,
                    "status": response.status_code,
                    "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
                }
            )
            if response.status_code != expected:
                raise RuntimeError(
                    f"{method} {path} returned HTTP {response.status_code}; response body withheld"
                )
            return response

        assert request("GET", "health").json()["status"] == "ok"
        assert request("GET", "account").json()["email_verified"]
        datasets = request("GET", "datasets").json()
        if not datasets:
            raise RuntimeError("No authorized datasets available")
        dataset = next(
            (
                d
                for d in datasets
                if not args.dataset_id or d["dataset_id"] == str(args.dataset_id)
            ),
            None,
        )
        if dataset is None:
            raise RuntimeError("Selected dataset is unavailable")
        run_id = (
            str(args.run_id)
            if args.run_id
            else request(
                "POST",
                "runs",
                expected=202,
                json={
                    "dataset_id": dataset["dataset_id"],
                    "name": "Baseline Market Basket Analysis",
                    "min_support": 0.02,
                    "min_confidence": 0.5,
                    "min_lift": 1,
                    "max_itemset_size": 3,
                },
            ).json()["run_id"]
        )
        deadline = time.monotonic() + 330
        while True:
            run = request("GET", f"runs/{run_id}").json()
            if run["status"] in {"Completed", "Failed"}:
                break
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    "Mining did not complete within verification deadline"
                )
            time.sleep(2)
        if run["status"] != "Completed":
            raise RuntimeError(
                "Mining failed; inspect the authorized run in the application"
            )
        for suffix in ("rules", "adjacencies", "report", "itemsets", "report.csv"):
            response = request("GET", f"runs/{run_id}/{suffix}")
            if suffix == "report":
                report = response.json()
        request("GET", "runs", params={"search": run["name"], "page_size": 10})
        if args.expect_baseline:
            assert report["dataset"]["doi"] == "https://doi.org/10.24432/C5BW33"
            assert (
                run["min_support"],
                run["min_confidence"],
                run["min_lift"],
                run["max_itemset_size"],
            ) == (0.02, 0.5, 1, 3)
            assert (
                report["dataset"]["basket_count"],
                report["dataset"]["summary"]["product_count"],
            ) == (20728, 3829)
            assert (
                run["execution"]["itemset_count"],
                run["execution"]["rule_count"],
                run["execution"]["adjacency_count"],
            ) == (358, 52, 38)
        evidence.update({"run": run, "report": report})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2))
    print(
        f"Verified authenticated account, catalog, history and all five result routes. Evidence: {args.output}"
    )


if __name__ == "__main__":
    main()
