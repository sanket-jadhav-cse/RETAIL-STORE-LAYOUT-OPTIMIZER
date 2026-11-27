"""Disposable scaled-schema benchmark; excludes Supabase Auth network overhead.

Run from repository root with an output JSON path. Never modifies retail data.
"""

import json
import statistics
import sys
import time
import uuid
from pathlib import Path

from app import main
from app.auth import Identity
from app.config import settings
from app.models import Adjacency, AssociationRule, Base, Dataset, MiningRun, Product
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

fixture = json.loads(Path("test-results/improvements/browser-fixture.json").read_text())
engine = create_engine(
    settings.migration_database_url or settings.database_url,
    hide_parameters=True,
    connect_args={"connect_timeout": 10},
)
schema = "retail_benchmark_" + uuid.uuid4().hex
with engine.begin() as c:
    c.execute(text(f"CREATE SCHEMA {schema}"))
test_engine = engine.execution_options(schema_translate_map={"retail": schema})
Base.metadata.create_all(test_engine)
store = sessionmaker(test_engine, expire_on_commit=False)
owner = uuid.UUID(int=1)
try:
    with store.begin() as s:
        ds = Dataset(
            dataset_id=uuid.UUID(fixture["dataset"]["dataset_id"]),
            name=fixture["dataset"]["name"],
            source=fixture["dataset"]["source"],
            version="benchmark fixture",
            checksum=uuid.uuid4().hex,
            basket_count=20728,
            summary=fixture["dataset"]["summary"],
            is_shared=True,
        )
        s.add(ds)
        for i in range(9):
            s.add(
                Dataset(
                    name=f"Isolated Catalog {i}",
                    source="BENCHMARK ONLY",
                    version="v1",
                    checksum=uuid.uuid4().hex,
                    basket_count=1,
                    summary={},
                    is_shared=True,
                )
            )
        s.flush()
        labels = {}
        for p in fixture["pairs"]:
            labels[p["product_a"]] = p["name_a"]
            labels[p["product_b"]] = p["name_b"]
        for r in fixture["rules"]:
            labels.update(zip(r["antecedent"], r["antecedent_names"]))
            labels.update(zip(r["consequent"], r["consequent_names"]))
        for i in range(3829 - len(labels)):
            labels[f"BENCH-{i}"] = "Isolated benchmark product"
        s.add_all(
            [
                Product(dataset_id=ds.dataset_id, product_code=k, description=v)
                for k, v in labels.items()
            ]
        )
        fields = {
            k: fixture["run"][k]
            for k in [
                "name",
                "min_support",
                "min_confidence",
                "min_lift",
                "max_itemset_size",
                "status",
                "execution",
            ]
        }
        run = MiningRun(
            run_id=uuid.UUID(fixture["run"]["run_id"]),
            dataset_id=ds.dataset_id,
            owner_id=owner,
            **fields,
            itemsets=[{"items": ["A"], "support": 0.02}] * 358,
        )
        s.add(run)
        s.flush()
        for r in fixture["rules"]:
            s.add(
                AssociationRule(
                    run_id=run.run_id,
                    **{
                        k: r[k]
                        for k in [
                            "antecedent",
                            "consequent",
                            "support",
                            "confidence",
                            "lift",
                        ]
                    },
                )
            )
        for p in fixture["pairs"]:
            s.add(
                Adjacency(
                    run_id=run.run_id,
                    dataset_id=ds.dataset_id,
                    **{
                        k: p[k]
                        for k in [
                            "product_a",
                            "product_b",
                            "support",
                            "confidence_a_b",
                            "confidence_b_a",
                            "lift",
                            "rank",
                            "rationale",
                        ]
                    },
                )
            )
        s.execute(
            text(
                f"INSERT INTO {schema}.runs (run_id,dataset_id,owner_id,name,min_support,min_confidence,min_lift,max_itemset_size,status,created_at,execution,itemsets) SELECT gen_random_uuid(),:dataset,CASE WHEN n % 100=0 THEN :owner ELSE :other END,'Scale Test',.02,.5,1,3,'Completed',now()-n*INTERVAL '1 second','{{}}'::jsonb,'[]'::jsonb FROM generate_series(1,10000) n"
            ),
            {"dataset": ds.dataset_id, "owner": owner, "other": uuid.UUID(int=2)},
        )

    def db():
        with store(info={"user_id": str(owner)}) as s:
            yield s

    main.app.dependency_overrides[main.db] = db
    main.app.dependency_overrides[main.current_user] = lambda: Identity(
        owner, "benchmark@example.invalid", {}
    )
    count = [0]

    def statement(*args):
        count[0] += 1

    event.listen(engine, "before_cursor_execute", statement)
    client = TestClient(main.app)
    results = {}
    for path in [
        "/datasets",
        f"/datasets/{ds.dataset_id}/summary",
        "/runs?search=Scale",
        f"/runs/{run.run_id}",
        f"/runs/{run.run_id}/rules",
        f"/runs/{run.run_id}/report",
    ]:
        samples = []
        counts = []
        for i in range(7):
            count[0] = 0
            start = time.perf_counter()
            r = client.get("/api/v1" + path)
            r.raise_for_status()
            samples.append((time.perf_counter() - start) * 1000)
            counts.append(count[0])
        results[path] = {
            "samples_ms": samples,
            "median_ms": statistics.median(samples),
            "query_counts": counts,
        }
    with engine.connect() as c:
        plan = c.execute(
            text(
                f"EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT run_id FROM {schema}.runs WHERE owner_id=:owner ORDER BY created_at DESC,run_id DESC LIMIT 20"
            ),
            {"owner": owner},
        ).scalar()
        index_bytes = c.execute(
            text(
                "SELECT COALESCE(sum(pg_relation_size(i.indexrelid)),0) FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=:schema AND t.relname='runs'"
            ),
            {"schema": schema},
        ).scalar()
    output = {
        "index_bytes": int(index_bytes),
        "context": "Disposable local PostgreSQL, 10 datasets, 10,001 runs (101 for target owner), 3829 products, actual rule/pair metrics with synthetic itemsets/product padding; Auth provider network excluded",
        "api": results,
        "history_plan": plan,
    }
    Path(sys.argv[1]).write_text(json.dumps(output, indent=2))
    print(
        json.dumps(
            {
                k: {
                    "median_ms": round(v["median_ms"], 2),
                    "queries": v["query_counts"][0],
                }
                for k, v in results.items()
            }
        )
    )
finally:
    main.app.dependency_overrides.clear()
    with engine.begin() as c:
        c.execute(text(f"DROP SCHEMA {schema} CASCADE"))
    engine.dispose()
