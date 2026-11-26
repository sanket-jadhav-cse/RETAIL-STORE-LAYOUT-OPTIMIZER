"""Single process scheduler, PostgreSQL advisory lock, bounded child process."""

import json
import multiprocessing
import os
import resource
import threading
import time
from uuid import UUID

from app.config import Session, engine, settings
from app.models import Adjacency, AssociationRule, Dataset, MiningRun, now
from sqlalchemy import select, text, update

LOCK_ID = 240410700193


def execute(run_id):
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["OMP_NUM_THREADS"] = "1"
    # An address-space cap plus parent wall-clock watchdog bounds expensive mining.
    resource.setrlimit(resource.RLIMIT_AS, (settings.mining_memory_mb * 1024**2,) * 2)
    run_job(run_id)


def run_job(run_id):
    from app.mining.pipeline import mine

    with Session() as session:
        run = session.get(MiningRun, UUID(run_id))
        dataset = session.get(Dataset, run.dataset_id)
        baskets = json.loads(
            (settings.data_dir / f"{dataset.checksum}.json").read_text()
        )
        result = mine(
            baskets,
            run.min_support,
            run.min_confidence,
            run.min_lift,
            run.max_itemset_size,
        )
        session.add_all(
            [AssociationRule(run_id=run.run_id, **r) for r in result["rules"]]
        )
        session.add_all(
            [
                Adjacency(run_id=run.run_id, dataset_id=run.dataset_id, **r)
                for r in result["adjacencies"]
            ]
        )
        run.itemsets = result["itemsets"]
        run.execution = dict(
            itemset_count=len(result["itemsets"]),
            rule_count=len(result["rules"]),
            adjacency_count=len(result["adjacencies"]),
            elapsed_seconds=result["elapsed_seconds"],
            peak_rss_mb=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
            algorithm="mlxtend FP-Growth",
            denominator=len(baskets),
        )
        run.status = "Completed"
        run.completed_at = now()
        session.commit()


class Runner:
    def __init__(self):
        self.stop_event = threading.Event()
        self.connection = None
        self.thread = None
        self.ready = False

    def start(self):
        self.connection = engine.connect()
        acquired = self.connection.scalar(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": LOCK_ID}
        )
        self.connection.commit()
        if not acquired:
            self.connection.close()
            raise RuntimeError("Only one application worker is supported")
        with Session.begin() as session:
            session.execute(
                update(MiningRun)
                .where(MiningRun.status.in_(["Queued", "Running"]))
                .values(
                    status="Failed",
                    error="Interrupted by application restart; submit a new run.",
                    completed_at=now(),
                )
            )
        self.ready = True
        self.thread = threading.Thread(target=self.loop, daemon=True)
        self.thread.start()

    def loop(self):
        while not self.stop_event.wait(0.5):
            # Stop scheduling if the advisory-lock connection has been lost.
            try:
                self.connection.execute(text("SELECT 1"))
                self.connection.commit()
                with Session.begin() as session:
                    run = session.scalar(
                        select(MiningRun)
                        .where(MiningRun.status == "Queued")
                        .order_by(MiningRun.created_at)
                        .limit(1)
                    )
                    if not run:
                        continue
                    run.status = "Running"
                    run_id = run.run_id
                child = multiprocessing.get_context("spawn").Process(
                    target=execute, args=(str(run_id),)
                )
                child.start()
                deadline = time.monotonic() + settings.mining_timeout_seconds
                while (
                    child.is_alive()
                    and time.monotonic() < deadline
                    and not self.stop_event.wait(0.2)
                ):
                    pass
                if child.is_alive():
                    child.terminate()
                child.join()
                with Session.begin() as session:
                    run = session.get(MiningRun, run_id)
                    if run.status != "Completed":
                        run.status = "Failed"
                        run.error = "Mining interrupted or resource limit exceeded. Increase support or reduce itemset size."
                        run.completed_at = now()
            except Exception:
                self.ready = False
                return

    def close(self):
        self.ready = False
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=10)
        if self.connection:
            try:
                self.connection.execute(
                    text("SELECT pg_advisory_unlock(:key)"), {"key": LOCK_ID}
                )
                self.connection.commit()
            finally:
                self.connection.close()
