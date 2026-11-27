"""Real PostgreSQL integration in a uniquely named disposable test schema only."""

import json
import uuid

import pytest
from app import main, worker
from app.auth import Identity
from app.config import settings
from app.models import Adjacency, Base, Dataset, MiningRun, Product
from fastapi import Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker


@pytest.fixture(scope="module")
def store():
    engine = create_engine(
        settings.migration_database_url or settings.database_url,
        hide_parameters=True,
        pool_pre_ping=True,
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000 -c lock_timeout=5000",
        },
    )
    schema = "retail_test_" + uuid.uuid4().hex
    try:
        connection = engine.connect()
    except Exception:
        pytest.skip("PostgreSQL unavailable; integration not verified")
    connection.execute(text(f"CREATE SCHEMA {schema}"))
    connection.commit()
    test_engine = engine.execution_options(schema_translate_map={"retail": schema})
    Base.metadata.create_all(test_engine)
    with test_engine.begin() as conn:
        conn.execute(
            text(
                f"CREATE FUNCTION {schema}.mining_busy() RETURNS boolean LANGUAGE sql AS 'SELECT EXISTS (SELECT 1 FROM {schema}.runs WHERE status IN (''Queued'', ''Running''))'"
            )
        )
    factory = sessionmaker(test_engine, expire_on_commit=False)
    yield factory
    # Only the uniquely generated schema above can be removed.
    connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
    connection.commit()
    connection.close()


@pytest.fixture
def client(store, monkeypatch, tmp_path):
    def db(user=main.Depends(main.current_user)):
        with store(info={"user_id": str(user.user_id)}) as session:
            yield session

    def identity(authorization: str | None = Header(default=None)):
        users = {
            "Bearer integration-test-token": uuid.UUID(int=1),
            "Bearer second-account": uuid.UUID(int=2),
        }
        if authorization not in users:
            raise HTTPException(401, "Sign in required")
        return Identity(
            users[authorization],
            "isolated@example.test",
            {"id": str(users[authorization])},
        )

    main.app.dependency_overrides[main.current_user] = identity
    main.app.dependency_overrides[main.db] = db
    monkeypatch.setattr(main.runner, "ready", True)
    monkeypatch.setattr(
        main,
        "mining_busy",
        lambda session: bool(
            session.scalar(
                select(MiningRun.run_id)
                .where(MiningRun.status.in_(["Queued", "Running"]))
                .limit(1)
            )
        ),
    )
    monkeypatch.setattr(settings, "operator_token", "integration-test-token")
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(worker, "Session", store)
    yield TestClient(
        main.app, headers={"Authorization": "Bearer integration-test-token"}
    )
    main.app.dependency_overrides.clear()


def test_full_persisted_workflow(client, store):
    dataset_id = uuid.uuid4()
    checksum = uuid.uuid4().hex
    baskets = [["A", "B"]] * 20 + [["A"]] * 10 + [["B"]] * 20 + [["C"]] * 50
    (settings.data_dir / f"{checksum}.json").write_text(json.dumps(baskets))
    with store.begin() as session:
        session.add(
            Dataset(
                dataset_id=dataset_id,
                source="SYNTHETIC TEST ONLY",
                is_shared=True,
                version="test",
                checksum=checksum,
                basket_count=100,
                summary={},
            )
        )
        session.flush()
        session.add_all(
            [
                Product(dataset_id=dataset_id, product_code=c, description=c)
                for c in "ABC"
            ]
        )
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/datasets").json()[0]["dataset_id"] == str(dataset_id)
    assert client.get(f"/api/v1/datasets/{dataset_id}/summary").status_code == 200
    payload = dict(
        dataset_id=str(dataset_id),
        min_support=0.1,
        min_confidence=0.4,
        min_lift=1,
        max_itemset_size=2,
    )
    headers = {"Authorization": "Bearer integration-test-token"}
    assert (
        client.post(
            "/api/v1/runs", json=payload, headers={"Authorization": ""}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/runs", json={**payload, "min_support": 0}, headers=headers
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/runs", json={**payload, "min_lift": -1}, headers=headers
        ).status_code
        == 422
    )
    result = client.post("/api/v1/runs", json=payload, headers=headers)
    assert result.status_code == 202, result.text
    run_id = result.json()["run_id"]
    assert result.json()["status"] == "Queued"
    assert result.json()["name"].startswith("Market Basket Analysis")
    assert client.post("/api/v1/runs", json=payload, headers=headers).status_code == 409
    assert client.get(f"/api/v1/runs/{run_id}/rules").status_code == 409
    with store.begin() as session:
        session.get(MiningRun, uuid.UUID(run_id)).status = "Running"
    assert client.get(f"/api/v1/runs/{run_id}").json()["status"] == "Running"
    worker.run_job(run_id)
    assert client.get(f"/api/v1/runs/{run_id}").json()["status"] == "Completed"
    # Direct UUID manipulation must never reveal another account's data.
    for resource in [
        "",
        "/rules",
        "/adjacencies",
        "/itemsets",
        "/report",
        "/report.csv",
    ]:
        assert (
            client.get(
                f"/api/v1/runs/{run_id}{resource}",
                headers={"Authorization": "Bearer second-account"},
            ).status_code
            == 404
        )
    assert (
        client.get(
            "/api/v1/datasets", headers={"Authorization": "Bearer second-account"}
        ).json()[0]["latest_run_id"]
        is None
    )
    rules = client.get(
        f"/api/v1/runs/{run_id}/rules", params={"search": "A", "sort": "confidence"}
    ).json()
    assert rules["total"] == 2
    assert rules["items"][0]["support"] == pytest.approx(0.2)
    pairs = client.get(f"/api/v1/runs/{run_id}/adjacencies").json()
    assert pairs["total"] == 1
    assert pairs["items"][0]["confidence_a_b"] == pytest.approx(2 / 3)
    assert pairs["items"][0]["confidence_b_a"] == pytest.approx(0.5)
    assert (
        client.get(f"/api/v1/runs/{run_id}/report").json()["recommendations"]["total"]
        == 1
    )
    assert "confidence_a_b" in client.get(f"/api/v1/runs/{run_id}/report.csv").text
    assert client.get(f"/api/v1/runs/{run_id}/itemsets").json()["total"] == 4
    assert client.get(f"/api/v1/runs/{run_id}/rules?page_size=101").status_code == 422
    assert client.get(f"/api/v1/runs/{uuid.uuid4()}").status_code == 404
    assert client.get("/api/v1/datasets/not-a-uuid/summary").status_code == 422
    with store() as session:
        row = session.scalar(
            select(Adjacency).where(Adjacency.run_id == uuid.UUID(run_id))
        )
        assert row.dataset_id == dataset_id
        with pytest.raises(IntegrityError):
            session.add(
                Adjacency(
                    run_id=row.run_id,
                    dataset_id=dataset_id,
                    product_a="B",
                    product_b="A",
                    rank=2,
                    support=0.2,
                    lift=1.6,
                    confidence_a_b=0.5,
                    confidence_b_a=0.6,
                    rationale="invalid reverse",
                )
            )
            session.commit()
        session.rollback()


def test_restart_and_single_worker(store, monkeypatch):
    monkeypatch.setattr(worker, "engine", store.kw["bind"])
    monkeypatch.setattr(worker, "Session", store)
    monkeypatch.setattr(worker, "LOCK_ID", uuid.uuid4().int % (2**60))
    with store.begin() as session:
        dataset = Dataset(
            source="SYNTHETIC RESTART TEST",
            version="test",
            checksum=uuid.uuid4().hex,
            basket_count=1,
            summary={},
        )
        session.add(dataset)
        session.flush()
        run = MiningRun(
            dataset_id=dataset.dataset_id,
            min_support=0.1,
            min_confidence=0.5,
            min_lift=1,
            max_itemset_size=2,
            status="Running",
        )
        session.add(run)
        session.flush()
        identifier = run.run_id
    first = worker.Runner()
    first.start()
    try:
        with store() as session:
            assert session.get(MiningRun, identifier).status == "Failed"
        with pytest.raises(RuntimeError):
            worker.Runner().start()
    finally:
        first.close()
    # Regression: returning a pooled connection must not retain a session advisory lock.
    second = worker.Runner()
    second.start()
    second.close()


def test_import_repairs_missing_artifact(client, store, monkeypatch, tmp_path):
    from scripts import import_dataset as importer

    monkeypatch.setattr(importer, "Session", store)
    source = tmp_path / "synthetic.csv"
    source.write_text(
        "InvoiceNo,StockCode,Description,Quantity\n1,A,Apple,1\n1,B,Bread,1\n"
    )
    dataset_id = importer.import_dataset(source)
    with store() as session:
        dataset = session.get(Dataset, dataset_id)
        artifact = settings.data_dir / f"{dataset.checksum}.json"
        assert artifact.is_file()
        artifact.unlink()
    assert importer.import_dataset(source) == dataset_id
    assert artifact.is_file()
    assert importer.import_dataset(source) == dataset_id
    with store() as session:
        assert (
            len(
                session.scalars(
                    select(Product).where(Product.dataset_id == dataset_id)
                ).all()
            )
            == 2
        )


def test_private_catalog_and_rate_limit(client, store, monkeypatch):
    with store.begin() as session:
        dataset = Dataset(
            source="PRIVATE TEST",
            version="test",
            checksum=uuid.uuid4().hex,
            basket_count=1,
            summary={},
            owner_id=uuid.UUID(int=1),
            is_shared=False,
        )
        session.add(dataset)
        session.flush()
        dataset_id = str(dataset.dataset_id)
        checksum = dataset.checksum
    second = {"Authorization": "Bearer second-account"}
    assert (
        client.get(f"/api/v1/datasets/{dataset_id}/summary", headers=second).status_code
        == 404
    )
    assert dataset_id not in [
        d["dataset_id"] for d in client.get("/api/v1/datasets", headers=second).json()
    ]
    assert (
        client.get("/api/v1/datasets", headers={"Authorization": ""}).status_code == 401
    )
    assert (
        client.post(
            "/api/v1/runs", json={"dataset_id": dataset_id}, headers=second
        ).status_code
        == 404
    )
    (settings.data_dir / f"{checksum}.json").write_text('[["A"]]')
    monkeypatch.setattr(settings, "mining_runs_per_hour", 0)
    response = client.post(
        "/api/v1/runs",
        json={"dataset_id": dataset_id, "owner_id": str(uuid.UUID(int=2))},
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "3600"


def test_dataset_provenance_is_source_specific(client, store, monkeypatch, tmp_path):
    from scripts import import_dataset as importer

    monkeypatch.setattr(importer, "Session", store)
    source = tmp_path / "north_shop.csv"
    source.write_text(
        "InvoiceNo,StockCode,Description,Quantity,InvoiceDate\n1,A,Apples,1,2025-01-02\n2,B,Bread,2,2025-02-03\n3,C,Cup,1,invalid\n"
    )
    identifier = importer.import_dataset(
        source, name="North Shop Purchases", owner_id=uuid.UUID(int=1)
    )
    assert importer.import_dataset(source) == identifier
    with store() as session:
        row = session.get(Dataset, identifier)
        assert row.name == "North Shop Purchases"
        assert "UCI" not in row.source
        assert row.source_url is None
        assert row.transaction_start.isoformat() == "2025-01-02"
        assert row.transaction_end.isoformat() == "2025-02-03"
        assert row.summary["invalid_dates"] == 1
        assert row.basket_count == 3
        assert not row.is_shared
    response = client.get(f"/api/v1/datasets/{identifier}/summary").json()
    assert response["name"] == "North Shop Purchases"
    assert response["transaction_start"] == "2025-01-02"
    with pytest.raises(ValueError):
        importer.import_dataset(source, name=" ")
    with pytest.raises(ValueError):
        importer.import_dataset(source, source_url="javascript:alert(1)")


def test_named_history_search_pagination_and_rename(client, store):
    with store.begin() as session:
        dataset = Dataset(
            name="History Catalog",
            source="TEST",
            version="v1",
            checksum=uuid.uuid4().hex,
            basket_count=1,
            summary={},
            is_shared=True,
        )
        session.add(dataset)
        session.flush()
        run_ids = []
        for i in range(13):
            run = MiningRun(
                dataset_id=dataset.dataset_id,
                owner_id=uuid.UUID(int=1 if i < 12 else 2),
                name=f"Confidence analysis {i:02}",
                min_support=0.02,
                min_confidence=0.5,
                min_lift=1,
                status="Completed",
                execution={"rule_count": i, "adjacency_count": i},
                itemsets=[],
            )
            session.add(run)
            session.flush()
            run_ids.append(str(run.run_id))
        dataset_id = str(dataset.dataset_id)
    params = {"dataset_id": dataset_id, "page_size": 5}
    first = client.get("/api/v1/runs", params=params)
    assert first.status_code == 200, first.text
    assert first.json()["total"] == 12
    assert len(first.json()["items"]) == 5
    assert first.json()["items"][0]["dataset_name"] == "History Catalog"
    second = client.get("/api/v1/runs", params={**params, "page": 2}).json()
    assert not {r["run_id"] for r in first.json()["items"]} & {
        r["run_id"] for r in second["items"]
    }
    for query, expected in [
        ("Confidence analysis 03", 1),
        ("History Catalog", 12),
        (run_ids[0], 1),
        ("no-match", 0),
        ("%", 0),
    ]:
        result = client.get("/api/v1/runs", params={**params, "search": query}).json()
        assert result["total"] == expected
    assert (
        client.get("/api/v1/runs", params={**params, "status": "Running"}).json()[
            "total"
        ]
        == 0
    )
    assert (
        client.get("/api/v1/runs", params={**params, "page": 99}).json()["items"] == []
    )
    assert client.get("/api/v1/runs?page_size=101").status_code == 422
    assert client.get("/api/v1/runs?status=unknown").status_code == 422
    assert (
        client.get(
            "/api/v1/runs?created_from=2026-01-01T00:00:00Z&created_before=2025-01-01T00:00:00Z"
        ).status_code
        == 422
    )
    assert (
        client.get("/api/v1/runs?created_from=2026-01-01T00:00:00").status_code == 422
    )
    other = {"Authorization": "Bearer second-account"}
    assert (
        client.get(
            "/api/v1/runs", params={**params, "search": run_ids[0]}, headers=other
        ).json()["total"]
        == 0
    )
    assert (
        client.patch(
            f"/api/v1/runs/{run_ids[0]}", json={"name": "Stolen"}, headers=other
        ).status_code
        == 404
    )
    for invalid in ["", " ", "x" * 121, "bad\nname", "<script>"]:
        assert (
            client.patch(
                f"/api/v1/runs/{run_ids[0]}", json={"name": invalid}
            ).status_code
            == 422
        )
    response = client.patch(
        f"/api/v1/runs/{run_ids[0]}",
        json={"name": "  Baseline Market Basket Analysis  "},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Baseline Market Basket Analysis"
    assert (
        client.get(
            "/api/v1/runs", params={**params, "search": "Baseline Market"}
        ).json()["total"]
        == 1
    )


def test_result_filters_and_csv_formula_safety(client, store):
    from app.models import AssociationRule

    with store.begin() as session:
        dataset = Dataset(
            name="Filter Test",
            source="TEST",
            version="v1",
            checksum=uuid.uuid4().hex,
            basket_count=100,
            summary={},
            is_shared=True,
        )
        session.add(dataset)
        session.flush()
        session.add_all(
            [
                Product(
                    dataset_id=dataset.dataset_id,
                    product_code="A",
                    description='  =HYPERLINK("bad")',
                ),
                Product(
                    dataset_id=dataset.dataset_id, product_code="B", description="Bread"
                ),
            ]
        )
        run = MiningRun(
            dataset_id=dataset.dataset_id,
            owner_id=uuid.UUID(int=1),
            name="Filter analysis",
            min_support=0.02,
            min_confidence=0.5,
            min_lift=1,
            status="Completed",
        )
        session.add(run)
        session.flush()
        run_id = str(run.run_id)
        session.add(
            AssociationRule(
                run_id=run.run_id,
                antecedent=["A"],
                consequent=["B"],
                support=0.2,
                confidence=0.6,
                lift=1.5,
            )
        )
        session.add(
            Adjacency(
                run_id=run.run_id,
                dataset_id=dataset.dataset_id,
                product_a="A",
                product_b="B",
                rank=1,
                support=0.2,
                confidence_a_b=0.6,
                confidence_b_a=None,
                lift=1.5,
                rationale="\n=Unsafe explanation",
            )
        )
    root = f"/api/v1/runs/{run_id}"
    assert (
        client.get(root + "/rules", params={"search": "no-matching-product"}).json()[
            "total"
        ]
        == 0
    )
    assert client.get(root + "/rules", params={"min_support": 0.3}).json()["total"] == 0
    assert (
        client.get(root + "/rules", params={"min_confidence": 0.7}).json()["total"] == 0
    )
    assert (
        client.get(
            root + "/adjacencies", params={"search": "Bread", "min_confidence": 0.6}
        ).json()["total"]
        == 1
    )
    assert (
        client.get(root + "/adjacencies", params={"min_confidence": 0.7}).json()[
            "total"
        ]
        == 0
    )
    assert (
        client.get(root + "/report", params={"search": "no-match"}).json()[
            "recommendations"
        ]["total"]
        == 0
    )
    assert (
        client.get(root + "/report", params={"search": "Bread"}).json()[
            "recommendations"
        ]["total"]
        == 1
    )
    assert client.get(root + "/rules?min_support=2").status_code == 422
    assert client.get(root + "/adjacencies?min_confidence=nan").status_code == 422
    import csv
    import io

    row = next(csv.DictReader(io.StringIO(client.get(root + "/report.csv").text)))
    assert row["name_a"].startswith("'  =")
    assert row["rationale"].startswith("'\n=")


def test_catalog_query_budget_and_status_without_itemset_loading(client, store):
    from sqlalchemy import event

    statements = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    with store.begin() as session:
        for i in range(10):
            session.add(
                Dataset(
                    name=f"Query budget {i}",
                    source="TEST",
                    version="v1",
                    checksum=uuid.uuid4().hex,
                    basket_count=1,
                    summary={},
                    is_shared=True,
                )
            )
        session.flush()
        dataset = session.scalar(
            select(Dataset).where(Dataset.name == "Query budget 0")
        )
        run = MiningRun(
            dataset_id=dataset.dataset_id,
            owner_id=uuid.UUID(int=1),
            name="Payload Test",
            min_support=0.02,
            min_confidence=0.5,
            min_lift=1,
            status="Completed",
            itemsets=[{"items": ["A"], "support": 0.2}] * 1000,
        )
        session.add(run)
        session.flush()
        run_id = str(run.run_id)
    bind = store.kw["bind"]
    event.listen(bind, "before_cursor_execute", capture)
    try:
        result = client.get("/api/v1/datasets")
        assert result.status_code == 200
        assert len(statements) <= 3, f"Catalog emitted {len(statements)} statements"
        statements.clear()
        response = client.get(f"/api/v1/runs/{run_id}")
        assert response.status_code == 200
        assert "itemsets" not in response.json()
        assert not any(".itemsets" in sql for sql in statements)
        assert (
            client.get(f"/api/v1/runs/{run_id}/itemsets?page_size=5").json()["total"]
            == 1000
        )
    finally:
        event.remove(bind, "before_cursor_execute", capture)


def test_concurrent_submission_remains_bounded(client, store, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    monkeypatch.setattr(settings, "mining_runs_per_hour", 1000)
    with store.begin() as session:
        dataset = Dataset(
            name="Concurrent Test",
            source="TEST",
            version="v1",
            checksum=uuid.uuid4().hex,
            basket_count=1,
            summary={},
            is_shared=True,
        )
        session.add(dataset)
        session.flush()
        identifier = str(dataset.dataset_id)
        checksum = dataset.checksum
    (settings.data_dir / f"{checksum}.json").write_text('[["A"]]')
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(
            pool.map(
                lambda _: client.post("/api/v1/runs", json={"dataset_id": identifier}),
                range(4),
            )
        )
    assert sorted(r.status_code for r in responses) == [202, 409, 409, 409]
    with store.begin() as session:
        run = session.get(
            MiningRun,
            uuid.UUID(
                next(r.json()["run_id"] for r in responses if r.status_code == 202)
            ),
        )
        run.status = "Failed"


def test_lost_advisory_lock_is_detected(store, monkeypatch):
    monkeypatch.setattr(worker, "LOCK_ID", uuid.uuid4().int % (2**60))
    runner = worker.Runner()
    runner.connection = store.kw["bind"].connect()
    try:
        assert runner.connection.scalar(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": worker.LOCK_ID}
        )
        runner.connection.commit()
        runner.ensure_lock()
        runner.connection.execute(
            text("SELECT pg_advisory_unlock(:key)"), {"key": worker.LOCK_ID}
        )
        runner.connection.commit()
        with pytest.raises(RuntimeError, match="lock lost"):
            runner.ensure_lock()
    finally:
        runner.close()


def _blocked_test_job(identifier):
    import time

    time.sleep(30)


def test_watchdog_persists_failure_and_releases_child(store, monkeypatch):
    import time

    monkeypatch.setattr(worker, "engine", store.kw["bind"])
    monkeypatch.setattr(worker, "Session", store)
    monkeypatch.setattr(worker, "execute", _blocked_test_job)
    monkeypatch.setattr(worker, "LOCK_ID", uuid.uuid4().int % (2**60))
    monkeypatch.setattr(settings, "mining_timeout_seconds", 0.05)
    runner = worker.Runner()
    runner.start()
    try:
        with store.begin() as session:
            dataset = Dataset(
                name="Watchdog Test",
                source="TEST",
                version="v1",
                checksum=uuid.uuid4().hex,
                basket_count=1,
                summary={},
            )
            session.add(dataset)
            session.flush()
            run = MiningRun(
                dataset_id=dataset.dataset_id,
                owner_id=uuid.UUID(int=1),
                name="Timeout Test",
                min_support=0.02,
                min_confidence=0.5,
                min_lift=1,
            )
            session.add(run)
            session.flush()
            identifier = run.run_id
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            with store() as session:
                row = session.get(MiningRun, identifier)
                if row.status == "Failed":
                    break
            time.sleep(0.05)
        assert row.status == "Failed"
        assert "resource limit" in row.error
        assert row.completed_at is not None
    finally:
        runner.close()
    assert not runner.thread.is_alive()


def test_artifact_repair_preserves_custom_provenance(
    client, store, monkeypatch, tmp_path
):
    from scripts import import_dataset as importer

    monkeypatch.setattr(importer, "Session", store)
    path = tmp_path / "shop.csv"
    path.write_text("InvoiceNo,StockCode,Description,Quantity\n1,A,Apple,1\n")
    identifier = importer.import_dataset(
        path,
        name="Verified Store Purchases",
        description="Owner supplied description",
        source="North Store Export",
        source_url="https://example.invalid/source",
        owner_id=uuid.UUID(int=1),
    )
    with store() as session:
        row = session.get(Dataset, identifier)
        (settings.data_dir / f"{row.checksum}.json").unlink()
    assert importer.import_dataset(path) == identifier
    with store() as session:
        row = session.get(Dataset, identifier)
        assert row.name == "Verified Store Purchases"
        assert row.description == "Owner supplied description"
        assert row.source == "North Store Export"
        assert row.source_url == "https://example.invalid/source"
        assert row.owner_id == uuid.UUID(int=1) and not row.is_shared


def test_scheduler_recovers_after_database_session_disconnect(store, monkeypatch):
    import time

    monkeypatch.setattr(worker, "engine", store.kw["bind"])
    monkeypatch.setattr(worker, "Session", store)
    monkeypatch.setattr(worker, "LOCK_ID", uuid.uuid4().int % (2**60))
    runner = worker.Runner()
    runner.start()
    with store.begin() as session:
        dataset = Dataset(
            source="TEST",
            version="v1",
            checksum=uuid.uuid4().hex,
            basket_count=1,
            summary={},
        )
        session.add(dataset)
        session.flush()
        interrupted = MiningRun(
            dataset_id=dataset.dataset_id,
            status="Running",
            min_support=0.02,
            min_confidence=0.5,
            min_lift=1,
        )
        session.add(interrupted)
        session.flush()
        interrupted_id = interrupted.run_id
    lock_query = text(
        "SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND objsubid=1 AND classid::bigint=:high AND objid::bigint=:low"
    )
    params = {"high": worker.LOCK_ID >> 32, "low": worker.LOCK_ID & 0xFFFFFFFF}
    try:
        with store.kw["bind"].connect() as control:
            original_pid = control.scalar(lock_query, params)
            assert original_pid
            assert control.scalar(
                text("SELECT pg_terminate_backend(:pid)"), {"pid": original_pid}
            )
            control.commit()
            deadline = time.monotonic() + 6
            recovered_pid = None
            while time.monotonic() < deadline:
                recovered_pid = control.scalar(lock_query, params)
                control.commit()
                if runner.ready and recovered_pid and recovered_pid != original_pid:
                    break
                time.sleep(0.05)
            assert runner.ready, "A temporary DB disconnect permanently disabled mining"
            assert recovered_pid and recovered_pid != original_pid
        with store() as session:
            recovered = session.get(MiningRun, interrupted_id)
            assert recovered.status == "Failed"
            assert "connection loss" in recovered.error
    finally:
        runner.close()
    assert not runner.thread.is_alive()


def test_scheduler_recovery_waits_for_exclusive_lock_and_shutdown(store, monkeypatch):
    import time

    monkeypatch.setattr(worker, "engine", store.kw["bind"])
    monkeypatch.setattr(worker, "Session", store)
    monkeypatch.setattr(worker, "LOCK_ID", uuid.uuid4().int % (2**60))
    runner = worker.Runner()
    runner.start()
    with store.kw["bind"].connect() as control:
        try:
            pid = control.scalar(
                text(
                    "SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND objsubid=1 AND classid::bigint=:high AND objid::bigint=:low"
                ),
                {"high": worker.LOCK_ID >> 32, "low": worker.LOCK_ID & 0xFFFFFFFF},
            )
            control.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": pid})
            assert control.scalar(
                text("SELECT pg_try_advisory_lock(:key)"), {"key": worker.LOCK_ID}
            )
            control.commit()
            deadline = time.monotonic() + 3
            while runner.ready and time.monotonic() < deadline:
                time.sleep(0.05)
            assert not runner.ready
            time.sleep(1.2)
            assert not runner.ready, "Recovery must not bypass another scheduler's lock"
            started = time.monotonic()
            runner.close()
            assert time.monotonic() - started < 2
            assert not runner.thread.is_alive()
        finally:
            runner.close()
            control.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": worker.LOCK_ID}
            )
            control.commit()
