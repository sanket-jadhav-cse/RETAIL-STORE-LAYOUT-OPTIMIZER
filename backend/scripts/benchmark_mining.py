"""Full UCI FP-Growth benchmark with fresh child processes and RSS sampling.

Usage: OJT_BENCH_SAMPLES=3 OJT_BACKEND_PID=<pid> python benchmark_mining.py output.json
The backend PID is optional; missing backend samples are reported as unavailable.
"""

import hashlib
import json
import os
import resource
import subprocess
import sys
import time
from pathlib import Path

if "--child" in sys.argv:
    start = time.perf_counter()
    from app.config import settings
    from app.mining.pipeline import mine

    imported = time.perf_counter()
    from app.datasets import UCI_CHECKSUM

    artifact = settings.data_dir / f"{UCI_CHECKSUM}.json"
    baskets = json.loads(artifact.read_text())
    loaded = time.perf_counter()
    result = mine(baskets)
    finished = time.perf_counter()
    payload = {k: result[k] for k in ["itemsets", "rules", "adjacencies"]}
    print(
        json.dumps(
            dict(
                baskets=len(baskets),
                products=len(set(p for b in baskets for p in b)),
                counts=[len(result[k]) for k in payload],
                sha256=hashlib.sha256(
                    json.dumps(payload, sort_keys=True).encode()
                ).hexdigest(),
                import_seconds=imported - start,
                load_seconds=loaded - imported,
                mining_seconds=finished - loaded,
                wall_seconds=finished - start,
                peak_rss_mb=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
            )
        )
    )
else:

    def rss(pid):
        try:
            return (
                int(
                    next(
                        line.split()[1]
                        for line in Path(f"/proc/{pid}/status").read_text().splitlines()
                        if line.startswith("VmRSS:")
                    )
                )
                / 1024
            )
        except (FileNotFoundError, StopIteration):
            return 0

    results = []
    for i in range(int(os.environ.get("OJT_BENCH_SAMPLES", "3"))):
        env = {**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"}
        process = subprocess.Popen(
            [sys.executable, __file__, "--child"],
            stdout=subprocess.PIPE,
            text=True,
            env=env,
        )
        peak = 0
        backend_pid = int(os.environ.get("OJT_BACKEND_PID", "0"))
        backend_alive = rss(backend_pid) > 0
        while process.poll() is None:
            peak = max(
                peak,
                rss(process.pid) + rss(int(os.environ.get("OJT_BACKEND_PID", "0"))),
            )
            time.sleep(0.05)
        raw = process.communicate()[0]
        if process.returncode:
            raise RuntimeError("Benchmark child failed")
        sample = json.loads(raw)
        sample["sampled_backend_plus_child_rss_mb"] = (
            peak if backend_alive and rss(backend_pid) > 0 else None
        )
        results.append(sample)
        print(json.dumps(sample), flush=True)
    Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True)
    Path(sys.argv[1]).write_text(json.dumps(results, indent=2))
