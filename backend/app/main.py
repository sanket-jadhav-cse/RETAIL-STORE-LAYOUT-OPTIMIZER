import csv
import io
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from app.auth import current_user
from app.config import Session, engine, settings
from app.models import Adjacency, AssociationRule, Dataset, MiningRun, Product
from app.schemas import DatasetOut, RunHistory, RunInput, RunName, RunOut
from app.worker import LOCK_ID, Runner
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import AwareDatetime
from sqlalchemy import String, cast, func, or_, select, text
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import defer

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
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc):
    return JSONResponse(
        status_code=503, content={"detail": "Database temporarily unavailable"}
    )


def db(user=Depends(current_user)):
    with Session(info={"user_id": str(user.user_id), "identity": user}) as session:
        yield session


DB = Annotated[object, Depends(db)]
PAGE = Annotated[int, Query(ge=1)]
SIZE = Annotated[int, Query(ge=1, le=100)]


def get(session, model, identifier):
    query = select(model)
    if model is MiningRun:
        query = query.where(
            model.owner_id == session.info["user_id"], model.run_id == identifier
        )
    elif model is Dataset:
        query = query.where(
            model.dataset_id == identifier,
            (model.is_shared.is_(True) | (model.owner_id == session.info["user_id"])),
        )
    value = session.scalar(query)
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


def mining_busy(session):
    return session.scalar(select(func.retail.mining_busy()))


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
def health():
    with Session() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok", "mining_available": runner.ready}


@app.get("/api/v1/datasets", response_model=list[DatasetOut])
def datasets(session: DB):
    rows = session.scalars(
        select(Dataset)
        .where(
            Dataset.is_shared.is_(True) | (Dataset.owner_id == session.info["user_id"])
        )
        .order_by(Dataset.imported_at.desc())
        .limit(100)
    ).all()
    for row in rows:
        row.latest_run_id = session.scalar(
            select(MiningRun.run_id)
            .where(
                MiningRun.dataset_id == row.dataset_id,
                MiningRun.owner_id == session.info["user_id"],
            )
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
    active = mining_busy(session)
    if active:
        raise HTTPException(409, "A mining run is already queued or running")
    recent = session.scalar(
        select(func.count())
        .select_from(MiningRun)
        .where(
            MiningRun.owner_id == session.info["user_id"],
            MiningRun.created_at >= func.now() - text("INTERVAL '1 hour'"),
        )
    )
    if recent >= settings.mining_runs_per_hour:
        raise HTTPException(
            429,
            "Hourly mining limit reached; try again later",
            headers={"Retry-After": "3600"},
        )
    values = body.model_dump()
    values["name"] = (
        body.name
        or (
            f"Market Basket Analysis · {dataset.name[:40]} · "
            f"{datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC · s={body.min_support:g} c={body.min_confidence:g}"
        )[:120]
    )
    run = MiningRun(**values, owner_id=session.info["user_id"])
    session.add(run)
    session.commit()
    return run


@app.get("/api/v1/runs", response_model=RunHistory)
def run_history(
    session: DB,
    page: PAGE = 1,
    page_size: SIZE = 20,
    search: Annotated[str, Query(max_length=120)] = "",
    dataset_id: UUID | None = None,
    status: Annotated[
        str | None, Query(pattern="^(Queued|Running|Completed|Failed)$")
    ] = None,
    created_from: AwareDatetime | None = None,
    created_before: AwareDatetime | None = None,
):
    if created_from and created_before and created_from >= created_before:
        raise HTTPException(422, "Creation date range is invalid")
    query = (
        select(MiningRun, Dataset.name.label("dataset_name"))
        .join(Dataset)
        .where(
            MiningRun.owner_id == session.info["user_id"],
            Dataset.is_shared.is_(True) | (Dataset.owner_id == session.info["user_id"]),
        )
    )
    if dataset_id:
        query = query.where(MiningRun.dataset_id == dataset_id)
    if status:
        query = query.where(MiningRun.status == status)
    if created_from:
        query = query.where(MiningRun.created_at >= created_from)
    if created_before:
        query = query.where(MiningRun.created_at < created_before)
    if search.strip():
        term = search.strip()
        filters = [
            MiningRun.name.icontains(term, autoescape=True),
            Dataset.name.icontains(term, autoescape=True),
            cast(MiningRun.created_at, String).icontains(term, autoescape=True),
        ]
        try:
            filters.append(MiningRun.run_id == UUID(term))
        except ValueError:
            pass
        query = query.where(or_(*filters))
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.execute(
        query.options(defer(MiningRun.itemsets))
        .order_by(MiningRun.created_at.desc(), MiningRun.run_id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [
            {**RunOut.model_validate(run).model_dump(), "dataset_name": dataset_name}
            for run, dataset_name in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.patch("/api/v1/runs/{id}", response_model=RunOut)
def rename_run(id: UUID, body: RunName, session: DB):
    run = get(session, MiningRun, id)
    run.name = body.name
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
    min_support: Annotated[float, Query(ge=0, le=1, allow_inf_nan=False)] = 0,
    min_confidence: Annotated[float, Query(ge=0, le=1, allow_inf_nan=False)] = 0,
):
    run = completed(session, id)
    labels = names(session, run.dataset_id)
    query = select(AssociationRule).where(
        AssociationRule.run_id == id,
        AssociationRule.lift >= min_lift,
        AssociationRule.support >= min_support,
        AssociationRule.confidence >= min_confidence,
    )
    if search:
        matching = [
            code
            for code, label in labels.items()
            if search.lower() in label.lower() or search.lower() in code.lower()
        ]
        query = query.where(
            AssociationRule.antecedent.has_any(array(matching, type_=String))
            | AssociationRule.consequent.has_any(array(matching, type_=String))
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


def pair_results(
    run, session, page, page_size, min_lift=0, min_confidence=0, search=""
):
    labels = names(session, run.dataset_id)
    query = select(Adjacency).where(
        Adjacency.run_id == run.run_id, Adjacency.lift >= min_lift
    )
    if min_confidence:
        query = query.where(
            func.greatest(Adjacency.confidence_a_b, Adjacency.confidence_b_a)
            >= min_confidence
        )
    if search:
        matching = [
            code
            for code, label in labels.items()
            if search.lower() in label.lower() or search.lower() in code.lower()
        ]
        query = query.where(
            Adjacency.product_a.in_(matching) | Adjacency.product_b.in_(matching)
        )
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(Adjacency.rank).offset((page - 1) * page_size).limit(page_size)
    )
    return {"items": [pair_dict(row, labels) for row in rows], "total": total}


@app.get("/api/v1/runs/{id}/adjacencies")
def adjacencies(
    id: UUID,
    session: DB,
    page: PAGE = 1,
    page_size: SIZE = 25,
    min_lift: Annotated[float, Query(ge=0, allow_inf_nan=False)] = 0,
    min_confidence: Annotated[float, Query(ge=0, le=1, allow_inf_nan=False)] = 0,
    search: Annotated[str, Query(max_length=100)] = "",
):
    run = completed(session, id)
    return pair_results(run, session, page, page_size, min_lift, min_confidence, search)


def report_data(id, session):
    run = completed(session, id)
    dataset = get(session, Dataset, run.dataset_id)
    return run, dataset, names(session, run.dataset_id)


@app.get("/api/v1/runs/{id}/report")
def report(
    id: UUID,
    session: DB,
    page: PAGE = 1,
    page_size: SIZE = 25,
    search: Annotated[str, Query(max_length=100)] = "",
    min_lift: Annotated[float, Query(ge=0, allow_inf_nan=False)] = 0,
    min_confidence: Annotated[float, Query(ge=0, le=1, allow_inf_nan=False)] = 0,
):
    run = completed(session, id)
    dataset = get(session, Dataset, run.dataset_id)
    return {
        "run": RunOut.model_validate(run),
        "dataset": DatasetOut.model_validate(dataset),
        "recommendations": pair_results(
            run, session, page, page_size, min_lift, min_confidence, search
        ),
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
                    and (
                        v.startswith(("\t", "\r", "\n"))
                        or v.lstrip().startswith(("=", "+", "-", "@"))
                    )
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


@app.get("/api/v1/account")
def account(user=Depends(current_user)):
    profile = user.profile
    return {
        "user_id": user.user_id,
        "email": user.email,
        "display_name": profile.get("user_metadata", {}).get("display_name", ""),
        "created_at": profile.get("created_at"),
        "email_verified": bool(profile.get("email_confirmed_at")),
    }
