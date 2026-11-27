"""Single process scheduler, PostgreSQL advisory lock, bounded child process."""

import json
import multiprocessing
import os
import resource
import threading
import time
from uuid import UUID

from app.config import MaintenanceSession as Session
from app.config import engine, settings
from app.models import Adjacency, AssociationRule, Dataset, MiningRun, now
from sqlalchemy import select, text, update
from sqlalchemy.exc import SQLAlchemyError

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
            started_at=run.execution.get("started_at"),
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
        if self.ready or (self.thread and self.thread.is_alive()):
            raise RuntimeError("Mining scheduler already running")
        self.stop_event.clear()
        try:
            self.acquire_lock()
            self.ready = True
            self.thread = threading.Thread(target=self.loop, daemon=True)
            self.thread.start()
        except BaseException:
            self.close()
            raise

    def acquire_lock(self):
        self.connection = engine.connect()
        acquired = self.connection.scalar(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": LOCK_ID}
        )
        self.connection.commit()
        if not acquired:
            raise RuntimeError("Only one application worker is supported")
        # Only the exclusive scheduler may recover interrupted work. Never
        # reset another live scheduler's jobs while waiting to reacquire.
        with Session.begin() as session:
            session.execute(
                update(MiningRun)
                .where(MiningRun.status.in_(["Queued", "Running"]))
                .values(
                    status="Failed",
                    error="Interrupted by application restart or connection loss; submit a new run.",
                    completed_at=now(),
                )
            )

    def reconnect(self):
        self.ready = False
        self.release_connection()
        delay = 1
        while not self.stop_event.wait(delay):
            try:
                self.acquire_lock()
                if self.stop_event.is_set():
                    self.release_connection()
                    return
                self.ready = True
                return
            except Exception:
                self.release_connection()
                delay = min(delay * 2, settings.scheduler_reconnect_max_seconds)

    def ensure_lock(self):
        # A reconnected session must not silently continue without its lock.
        held = self.connection.scalar(
            text("""SELECT EXISTS (SELECT 1 FROM pg_locks
            WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted AND objsubid=1
            AND classid::bigint=:high AND objid::bigint=:low)"""),
            {"high": LOCK_ID >> 32, "low": LOCK_ID & 0xFFFFFFFF},
        )
        self.connection.commit()
        if not held:
            raise RuntimeError("Mining scheduler lock lost")

    @staticmethod
    def stop_child(child):
        if child.is_alive():
            child.terminate()
            child.join(timeout=3)
        if child.is_alive():
            child.kill()
            child.join(timeout=3)
        else:
            child.join()
        if child.is_alive():
            raise RuntimeError("Mining process did not stop")

    def loop(self):
        while not self.stop_event.wait(0.5):
            child = None
            failed = False
            try:
                self.ensure_lock()
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
                    run.execution = {"started_at": now().isoformat()}
                    run_id = run.run_id
                child = multiprocessing.get_context("spawn").Process(
                    target=execute, args=(str(run_id),)
                )
                child.start()
                deadline = time.monotonic() + settings.mining_timeout_seconds
                next_heartbeat = time.monotonic() + 2
                while (
                    child.is_alive()
                    and time.monotonic() < deadline
                    and not self.stop_event.wait(0.2)
                ):
                    if time.monotonic() >= next_heartbeat:
                        self.ensure_lock()
                        next_heartbeat = time.monotonic() + 2
                self.stop_child(child)
                with Session.begin() as session:
                    run = session.get(MiningRun, run_id)
                    if run.status != "Completed":
                        run.status = "Failed"
                        run.error = "Mining interrupted or resource limit exceeded. Increase support or reduce itemset size."
                        run.completed_at = now()
            except Exception:
                self.ready = False
                failed = True
            finally:
                if child is not None:
                    if child.pid is not None:
                        self.stop_child(child)
                    if not child.is_alive():
                        child.close()
            if failed:
                self.reconnect()

    def close(self):
        self.ready = False
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=35)
        self.release_connection()

    def release_connection(self):
        connection = self.connection
        if connection and not connection.closed:
            try:
                if self.thread and self.thread.is_alive():
                    connection.invalidate()
                elif not connection.invalidated:
                    if connection.in_transaction():
                        connection.rollback()
                    connection.execute(
                        text("SELECT pg_advisory_unlock(:key)"), {"key": LOCK_ID}
                    )
                    connection.commit()
            except SQLAlchemyError:
                connection.invalidate()
            finally:
                connection.close()
