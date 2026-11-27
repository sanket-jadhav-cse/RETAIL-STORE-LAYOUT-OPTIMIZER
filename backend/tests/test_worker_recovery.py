import pytest
from app import worker
from sqlalchemy.exc import PendingRollbackError, SQLAlchemyError


class LostConnection:
    invalidated = True
    closed = False

    def execute(self, *args, **kwargs):
        raise PendingRollbackError("Invalid transaction after disconnect")

    def close(self):
        self.closed = True

    def in_transaction(self):
        return False

    def invalidate(self):
        self.invalidated = True


def test_shutdown_after_lost_lock_connection():
    runner = worker.Runner()
    runner.connection = LostConnection()
    runner.close()
    assert runner.connection.closed
    assert not runner.ready


def test_startup_failure_releases_connection(monkeypatch):
    class BrokenStart(LostConnection):
        invalidated = False

        def scalar(self, *args, **kwargs):
            raise SQLAlchemyError("connection interrupted")

    connection = BrokenStart()
    monkeypatch.setattr(worker.engine, "connect", lambda: connection)
    runner = worker.Runner()
    with pytest.raises(SQLAlchemyError):
        runner.start()
    assert connection.closed


def test_child_that_ignores_termination_is_killed_and_reaped():
    class Child:
        alive = True
        terminated = False
        killed = False
        joins = 0

        def is_alive(self):
            return self.alive

        def terminate(self):
            self.terminated = True

        def kill(self):
            self.killed = True
            self.alive = False

        def join(self, timeout=None):
            self.joins += 1

    child = Child()
    worker.Runner.stop_child(child)
    assert child.terminated and child.killed
    assert not child.is_alive() and child.joins >= 2
