import csv
import io
import secrets
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from app.config import Session, engine, settings
from app.models import Adjacency, AssociationRule, Dataset, MiningRun, Product
from app.schemas import DatasetOut, RunInput, RunOut
from app.worker import LOCK_ID, Runner
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.exc import SQLAlchemyError

runner = Runner()


@asynccontextmanager
async def lifespan(app):
    runner.start()
    yield
    runner.close()
    engine.dispose()


app = FastAPI(title="Retail Store Layout Optimizer", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins.split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc):
    return JSONResponse(
        status_code=503, content={"detail": "Database temporarily unavailable"}
    )


def db():
    with Session() as session:
        yield session


DB = Annotated[object, Depends(db)]
PAGE = Annotated[int, Query(ge=1)]
SIZE = Annotated[int, Query(ge=1, le=100)]


def get(session, model, identifier):
    value = session.get(model, identifier)
    if value is None:
        raise HTTPException(404, "Resource not found")
    return value


def completed(session, identifier):
    run = get(session, MiningRun, identifier)
    if run.status != "Completed":
        raise HTTPException(409, f"Results not ready: {run.status}")
    return run


def operator(authorization: Annotated[str | None, Header()] = None):
    expected = settings.operator_token
    if not expected or not secrets.compare_digest(
        authorization or "", f"Bearer {expected}"
    ):
        raise HTTPException(
            401, "Operator token required", headers={"WWW-Authenticate": "Bearer"}
        )


def names(session, dataset_id):
    return dict(
        session.execute(
            select(Product.product_code, Product.description).where(
                Product.dataset_id == dataset_id
            )
        ).all()
    )


def rule_dict(row, labels):
    return dict(
        rule_id=str(row.rule_id),
        antecedent=row.antecedent,
        consequent=row.consequent,
        antecedent_names=[labels.get(c, c) for c in row.antecedent],
        consequent_names=[labels.get(c, c) for c in row.consequent],
        support=row.support,
        confidence=row.confidence,
        lift=row.lift,
    )


def pair_dict(row, labels):
    return {
        **{c.name: getattr(row, c.name) for c in Adjacency.__table__.columns},
        "name_a": labels.get(row.product_a, row.product_a),
        "name_b": labels.get(row.product_b, row.product_b),
    }


@app.get("/api/v1/health")
def health(session: DB):
    session.execute(text("SELECT 1"))
    return {"status": "ok", "mining_available": runner.ready}


@app.get("/api/v1/datasets", response_model=list[DatasetOut])
def datasets(session: DB):
    rows = session.scalars(
        select(Dataset).order_by(Dataset.imported_at.desc()).limit(100)
    ).all()
    for row in rows:
        row.latest_run_id = session.scalar(
            select(MiningRun.run_id)
            .where(MiningRun.dataset_id == row.dataset_id)
            .order_by(MiningRun.created_at.desc())
            .limit(1)
        )
    return rows


@app.get("/api/v1/datasets/{id}/summary", response_model=DatasetOut)
def summary(id: UUID, session: DB):
    return get(session, Dataset, id)


@app.post(
    "/api/v1/runs",
    response_model=RunOut,
    status_code=202,
    dependencies=[Depends(operator)],
)
def create_run(body: RunInput, session: DB):
    if not runner.ready:
        raise HTTPException(503, "Mining worker unavailable")
    dataset = get(session, Dataset, body.dataset_id)
    if not (settings.data_dir / f"{dataset.checksum}.json").is_file():
        raise HTTPException(
            409, "Dataset basket artifact is unavailable; import dataset on this host"
        )
    # Transaction advisory lock serializes simultaneous submissions across connections.
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": LOCK_ID + 1})
    active = session.scalar(
        select(MiningRun.run_id)
        .where(MiningRun.status.in_(["Queued", "Running"]))
        .limit(1)
    )
    if active:
        raise HTTPException(409, "A mining run is already queued or running")
    run = MiningRun(**body.model_dump())
    session.add(run)
    session.commit()
    return run


@app.get("/api/v1/runs/{id}", response_model=RunOut)
def run_status(id: UUID, session: DB):
    return get(session, MiningRun, id)


@app.get("/api/v1/runs/{id}/itemsets")
def itemsets(id: UUID, session: DB, page: PAGE = 1, page_size: SIZE = 25):
    run = completed(session, id)
    start = (page - 1) * page_size
    return {
        "items": run.itemsets[start : start + page_size],
        "total": len(run.itemsets),
    }


@app.get("/api/v1/runs/{id}/rules")
def rules(
    id: UUID,
    session: DB,
    page: PAGE = 1,
    page_size: SIZE = 25,
    search: Annotated[str, Query(max_length=100)] = "",
    min_lift: Annotated[float, Query(ge=0, allow_inf_nan=False)] = 0,
    sort: Annotated[str, Query(pattern="^(lift|support|confidence)$")] = "lift",
):
    run = completed(session, id)
    labels = names(session, run.dataset_id)
    query = select(AssociationRule).where(
        AssociationRule.run_id == id, AssociationRule.lift >= min_lift
    )
    if search:
        matching = [
            code
            for code, label in labels.items()
            if search.lower() in label.lower() or search.lower() in code.lower()
        ]
        query = query.where(
            AssociationRule.antecedent.has_any(array(matching))
            | AssociationRule.consequent.has_any(array(matching))
        )
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(
            getattr(AssociationRule, sort).desc(),
            AssociationRule.support.desc(),
            AssociationRule.confidence.desc(),
            AssociationRule.antecedent,
            AssociationRule.consequent,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {"items": [rule_dict(r, labels) for r in rows], "total": total}


@app.get("/api/v1/runs/{id}/adjacencies")
def adjacencies(
    id: UUID,
    session: DB,
    page: PAGE = 1,
    page_size: SIZE = 25,
    min_lift: Annotated[float, Query(ge=0, allow_inf_nan=False)] = 0,
):
    run = completed(session, id)
    query = select(Adjacency).where(Adjacency.run_id == id, Adjacency.lift >= min_lift)
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(Adjacency.rank).offset((page - 1) * page_size).limit(page_size)
    )
    labels = names(session, run.dataset_id)
    return {"items": [pair_dict(r, labels) for r in rows], "total": total}


def report_data(id, session):
    run = completed(session, id)
    dataset = get(session, Dataset, run.dataset_id)
    return run, dataset, names(session, run.dataset_id)


@app.get("/api/v1/runs/{id}/report")
def report(id: UUID, session: DB, page: PAGE = 1, page_size: SIZE = 25):
    run, dataset, _ = report_data(id, session)
    return {
        "run": RunOut.model_validate(run),
        "dataset": DatasetOut.model_validate(dataset),
        "recommendations": adjacencies(id, session, page, page_size, 0),
        "review": "Evidence-based conceptual adjacency only. Check aisle space, safety, category compatibility and seasonality. No causal sales improvement demonstrated.",
    }


@app.get("/api/v1/runs/{id}/report.csv")
def report_csv(id: UUID, session: DB):
    _, _, labels = report_data(id, session)
    stream = io.StringIO()
    fields = [
        "rank",
        "product_a",
        "name_a",
        "product_b",
        "name_b",
        "support",
        "confidence_a_b",
        "confidence_b_a",
        "lift",
        "rationale",
    ]
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in session.scalars(
        select(Adjacency).where(Adjacency.run_id == id).order_by(Adjacency.rank)
    ):
        data = pair_dict(row, labels)
        # Prevent spreadsheet formula injection in untrusted descriptions/codes.
        writer.writerow(
            {
                k: (
                    "'" + v
                    if isinstance(v, str)
                    and v.startswith(("=", "+", "-", "@", "\t", "\r"))
                    else v
                )
                for k, v in data.items()
            }
        )
    return Response(
        stream.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="recommendations-{id}.csv"'
        },
    )
