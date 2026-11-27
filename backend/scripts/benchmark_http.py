"""Bounded authenticated HTTP latency samples; includes Auth and DB network hops.

RETAIL_ACCESS_TOKEN is read privately, never written to evidence. No mining is submitted.
"""

import argparse
import getpass
import json
import os
import statistics
import time
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api/v1/")
    parser.add_argument("--samples", type=int, default=7, choices=range(3, 21))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get("RETAIL_ACCESS_TOKEN") or getpass.getpass(
        "Supabase access token: "
    )
    if not token:
        parser.error("A verified account bearer token is required")
    with httpx.Client(
        base_url=args.base_url.rstrip("/") + "/",
        headers={"Authorization": "Bearer " + token},
        timeout=30,
    ) as client:
        response = client.get(
            "runs",
            params={
                "status": "Completed",
                "search": "Baseline Market Basket",
                "page_size": 1,
            },
        )
        response.raise_for_status()
        runs = response.json()["items"]
        if not runs:
            raise RuntimeError("An authorized completed baseline run is required")
        run = runs[0]
        paths = [
            "datasets",
            f"datasets/{run['dataset_id']}/summary",
            "runs?search=Baseline%20Market%20Basket",
            f"runs/{run['run_id']}",
            f"runs/{run['run_id']}/rules",
            f"runs/{run['run_id']}/report",
        ]
        results = {}
        for path in paths:
            samples = []
            for _ in range(args.samples):
                start = time.perf_counter()
                try:
                    response = client.get(path)
                    status = response.status_code
                except httpx.HTTPError:
                    status = "transport_error"
                samples.append(
                    {
                        "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
                        "status": status,
                    }
                )
            successful = [s["elapsed_ms"] for s in samples if s["status"] == 200]
            results[path] = {
                "samples": samples,
                "success_count": len(successful),
                "median_success_ms": statistics.median(successful)
                if successful
                else None,
            }
            print(
                path.split("?")[0],
                "successful samples:",
                len(successful),
                "/",
                args.samples,
                flush=True,
            )
    evidence = {
        "context": "Actual authenticated localhost API to Supabase; includes verified Auth user calls, network round trips, SQLAlchemy and serialization. Not comparable to the original public API as an authentication-free latency percentage. Server SQL execution time is measured separately.",
        "api": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
