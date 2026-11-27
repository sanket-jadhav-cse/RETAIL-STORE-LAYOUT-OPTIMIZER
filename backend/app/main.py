import asyncio
import csv
import hashlib
import io
import json
import os
import tempfile
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated
from uuid import UUID

from app.auth import Identity, current_user
from app.config import Session, engine, settings
from app.models import Adjacency, AssociationRule, Dataset, MiningRun, Product
from app.schemas import DatasetOut, DatasetUpdate, RunHistory, RunInput, RunName, RunOut
from app.uploads import UPLOAD_SLOT, column_mapping, parse_isolated, storage_identity
from app.worker import LOCK_ID, Runner
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import AwareDatetime
from sqlalchemy import String, cast, func, or_, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import defer
from starlette.concurrency import run_in_threadpool

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
    allow_headers=["Content-Type", "Authorization", "Idempotency-Key"],
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
PAGE = Annotated[int, Query(ge=1, le=100000)]
SIZE = Annotated[int, Query(ge=1, le=100)]


def get(session, model, identifier, include_itemsets=False):
    query = select(model)
    if model is MiningRun:
        if not include_itemsets:
            query = query.options(defer(MiningRun.itemsets, raiseload=True))
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


def completed(session, identifier, include_itemsets=False):
    run = get(session, MiningRun, identifier, include_itemsets=include_itemsets)
    if run.status != "Completed":
        raise HTTPException(409, f"Results not ready: {run.status}")
    return run


def mining_busy(session):
    return session.scalar(select(func.retail.mining_busy()))


def names(session, dataset_id, codes=None):
    query = select(Product.product_code, Product.description).where(
        Product.dataset_id == dataset_id
    )
    if codes is not None:
        if not codes:
            return {}
        query = query.where(Product.product_code.in_(codes))
    return dict(session.execute(query).all())


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
    latest = (
        select(MiningRun.run_id)
        .where(
            MiningRun.dataset_id == Dataset.dataset_id,
            MiningRun.owner_id == session.info["user_id"],
        )
        .order_by(MiningRun.created_at.desc(), MiningRun.run_id.desc())
        .limit(1)
        .correlate(Dataset)
        .scalar_subquery()
    )
    rows = session.execute(
        select(Dataset, latest.label("latest_run_id"))
        .where(
            Dataset.is_shared.is_(True) | (Dataset.owner_id == session.info["user_id"])
        )
        .order_by(Dataset.imported_at.desc())
        .limit(100)
    ).all()
    return [
        DatasetOut.model_validate(row).model_copy(update={"latest_run_id": latest_id})
        for row, latest_id in rows
    ]


@app.get("/api/v1/datasets/{id}/summary", response_model=DatasetOut)
def summary(id: UUID, session: DB):
    return get(session, Dataset, id)


@app.get("/api/v1/upload-config")
def upload_config(user: Annotated[Identity, Depends(current_user)]):
    return {
        "formats": ["csv", "xlsx"],
        "max_bytes": settings.upload_max_bytes,
        "max_rows": settings.upload_max_rows,
        "max_columns": 40,
    }


async def receive_upload(request, target):
    size = 0
    digest = hashlib.sha256()
    with target.open("wb") as stream:
        os.chmod(target, 0o600)
        try:
            async with asyncio.timeout(settings.upload_timeout_seconds):
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > settings.upload_max_bytes:
                        raise HTTPException(413, "File exceeds the upload size limit")
                    stream.write(chunk)
                    digest.update(chunk)
        except TimeoutError:
            raise HTTPException(
                408, "Upload timed out; retry with a stable connection"
            ) from None
    if not size:
        raise HTTPException(422, "Select a non-empty file")
    return digest.hexdigest()


@app.post("/api/v1/datasets/preview")
async def preview_upload(
    request: Request,
    user: Annotated[Identity, Depends(current_user)],
    format: Annotated[str, Query(pattern="^(csv|xlsx)$")],
):
    if not UPLOAD_SLOT.acquire(blocking=False):
        raise HTTPException(429, "Another file is being processed; retry shortly")
    try:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".upload-", dir=settings.data_dir
        ) as directory:
            source, output = (
                Path(directory) / f"source.{format}",
                Path(directory) / "result.json",
            )
            await receive_upload(request, source)
            return await run_in_threadpool(
                parse_isolated, source, format, {}, output, True
            )
    finally:
        UPLOAD_SLOT.release()


@app.post("/api/v1/datasets", response_model=DatasetOut)
async def upload_dataset(
    request: Request,
    session: DB,
    format: Annotated[str, Query(pattern="^(csv|xlsx)$")],
    name: Annotated[str, Query(min_length=1, max_length=200)],
    mapping: Annotated[str, Query(max_length=4000)],
    description: Annotated[str, Query(max_length=1000)] = "",
):
    try:
        values = json.loads(mapping)
        clean_name = DatasetUpdate(name=name).name
    except (ValueError, TypeError):
        raise HTTPException(422, "Check the dataset name and column mapping") from None
    if not UPLOAD_SLOT.acquire(blocking=False):
        raise HTTPException(429, "Another file is being processed; retry shortly")
    try:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".upload-", dir=settings.data_dir
        ) as directory:
            source, output = (
                Path(directory) / f"source.{format}",
                Path(directory) / "result.json",
            )
            source_hash = await receive_upload(request, source)
            return await run_in_threadpool(
                _process_upload,
                session,
                source,
                output,
                format,
                clean_name,
                description,
                values,
                source_hash,
            )
    finally:
        UPLOAD_SLOT.release()


def _process_upload(
    session, source, output, format, clean_name, description, values, source_hash
):
    # All blocking database/file/parser operations stay off the ASGI event loop.
    published = []
    try:
        # Validate before deriving identity; equivalent mappings have the same key.
        preview = parse_isolated(source, format, {}, output, True)
        try:
            values = column_mapping(preview["columns"], values)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        checksum = storage_identity(session.info["user_id"], source_hash, values)
        session.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": int(checksum[:15], 16)},
        )
        existing = session.scalar(
            select(Dataset).where(
                Dataset.checksum == checksum,
                Dataset.owner_id == session.info["user_id"],
            )
        )
        if existing:
            return DatasetOut.model_validate(existing)
        # Do not hold a DB transaction/connection during CPU-bound parsing.
        session.rollback()
        parsed = parse_isolated(source, format, values, output)
        stats = parsed["summary"]
        stats["upload"] = {
            "source_sha256": source_hash,
            "format": format,
            "mapping": values,
        }
        sources = settings.data_dir / "sources"
        sources.mkdir(exist_ok=True, mode=0o700)
        basket_target = settings.data_dir / f"{checksum}.json"
        source_target = sources / f"{checksum}.{format}"
        for original, target in [
            (output.with_suffix(".baskets"), basket_target),
            (source, source_target),
        ]:
            os.chmod(original, 0o600)
            os.replace(original, target)
            published.append(target)
        dataset = Dataset(
            owner_id=session.info["user_id"],
            is_shared=False,
            name=clean_name,
            description=description.strip() or None,
            source="Private uploaded retail transactions",
            version="sha256:" + source_hash[:12],
            checksum=checksum,
            basket_count=stats["basket_count"],
            summary=stats,
            transaction_start=date.fromisoformat(stats["transaction_start"])
            if stats.get("transaction_start")
            else None,
            transaction_end=date.fromisoformat(stats["transaction_end"])
            if stats.get("transaction_end")
            else None,
            processing_status="Ready",
        )
        session.add(dataset)
        session.flush()
        session.add_all(
            [
                Product(
                    dataset_id=dataset.dataset_id,
                    product_code=code,
                    description=label,
                )
                for code, label in parsed["products"].items()
            ]
        )
        session.commit()
        published.clear()
        return DatasetOut.model_validate(dataset)
    finally:
        for target in published:
            target.unlink(missing_ok=True)


@app.patch("/api/v1/datasets/{id}", response_model=DatasetOut)
def update_dataset(id: UUID, body: DatasetUpdate, session: DB):
    dataset = get(session, Dataset, id)
    if dataset.is_shared or str(dataset.owner_id) != session.info["user_id"]:
        raise HTTPException(403, "Shared datasets are protected from modification")
    if body.processing_status and session.scalar(
        select(MiningRun.run_id)
        .where(MiningRun.dataset_id == id, MiningRun.status.in_(["Queued", "Running"]))
        .limit(1)
    ):
        raise HTTPException(409, "Wait for the active mining run before archiving")
    if body.name is not None:
        dataset.name = body.name
    if body.processing_status:
        dataset.processing_status = body.processing_status
    session.commit()
    return dataset


@app.get("/api/v1/datasets/{id}/source")
def download_source(id: UUID, session: DB):
    dataset = get(session, Dataset, id)
    if dataset.is_shared or str(dataset.owner_id) != session.info["user_id"]:
        raise HTTPException(
            403, "Only your retained private source files can be downloaded"
        )
    extension = dataset.summary.get("upload", {}).get("format")
    if extension not in ("csv", "xlsx"):
        raise HTTPException(404, "Source file was not retained")
    path = settings.data_dir / "sources" / f"{dataset.checksum}.{extension}"
    if not path.is_file():
        raise HTTPException(404, "Source file is unavailable on this host")
    return FileResponse(path, filename=f"retail-dataset-{id}.{extension}")


@app.post(
    "/api/v1/runs",
    response_model=RunOut,
    status_code=202,
    responses={429: {"description": "Hourly mining limit reached"}},
)
def create_run(
    body: RunInput,
    session: DB,
    idempotency_key: Annotated[UUID | None, Header()] = None,
):
    # Serialize both the duplicate check and admission before worker/limit checks.
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": LOCK_ID + 1})
    if idempotency_key:
        prior = session.scalar(
            select(MiningRun)
            .options(defer(MiningRun.itemsets))
            .where(
                MiningRun.owner_id == session.info["user_id"],
                MiningRun.submission_key == idempotency_key,
            )
        )
        if prior:
            if any(
                getattr(prior, k) != v
                for k, v in body.model_dump(exclude={"name"}).items()
            ) or (body.name is not None and body.name != prior.name):
                raise HTTPException(
                    409, "This submission key belongs to different parameters"
                )
            return prior
    if not runner.ready:
        raise HTTPException(503, "Mining worker unavailable")
    dataset = get(session, Dataset, body.dataset_id)
    if dataset.processing_status != "Ready":
        raise HTTPException(409, "Select a ready, unarchived dataset")
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
        body.name or (f"Market Basket Analysis · {dataset.name[:60]}")[:120]
    )
    run = MiningRun(
        **values, owner_id=session.info["user_id"], submission_key=idempotency_key
    )
    session.add(run)
    session.commit()
    return run


@app.get(
    "/api/v1/runs",
    response_model=RunHistory,
    responses={422: {"description": "Invalid search or creation date range"}},
)
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
    run = completed(session, id, include_itemsets=True)
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
    query = select(AssociationRule).where(
        AssociationRule.run_id == id,
        AssociationRule.lift >= min_lift,
        AssociationRule.support >= min_support,
        AssociationRule.confidence >= min_confidence,
    )
    if search:
        match = (
            select(Product.product_code)
            .where(
                Product.dataset_id == run.dataset_id,
                Product.description.icontains(search, autoescape=True)
                | Product.product_code.icontains(search, autoescape=True),
                AssociationRule.antecedent.has_key(Product.product_code)
                | AssociationRule.consequent.has_key(Product.product_code),
            )
            .correlate(AssociationRule)
            .exists()
        )
        query = query.where(match)
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
    ).all()
    codes = {code for row in rows for code in row.antecedent + row.consequent}
    labels = names(session, run.dataset_id, codes)
    return {"items": [rule_dict(r, labels) for r in rows], "total": total}


def pair_results(
    run, session, page, page_size, min_lift=0, min_confidence=0, search=""
):
    query = select(Adjacency).where(
        Adjacency.run_id == run.run_id, Adjacency.lift >= min_lift
    )
    if min_confidence:
        query = query.where(
            func.greatest(Adjacency.confidence_a_b, Adjacency.confidence_b_a)
            >= min_confidence
        )
    if search:
        matching = select(Product.product_code).where(
            Product.dataset_id == run.dataset_id,
            Product.description.icontains(search, autoescape=True)
            | Product.product_code.icontains(search, autoescape=True),
        )
        query = query.where(
            Adjacency.product_a.in_(matching) | Adjacency.product_b.in_(matching)
        )
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(Adjacency.rank).offset((page - 1) * page_size).limit(page_size)
    ).all()
    labels = names(
        session,
        run.dataset_id,
        {code for row in rows for code in (row.product_a, row.product_b)},
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
def account(user: Annotated[Identity, Depends(current_user)]):
    profile = user.profile
    return {
        "user_id": user.user_id,
        "email": user.email,
        "display_name": profile.get("user_metadata", {}).get("display_name", ""),
        "created_at": profile.get("created_at"),
        "email_verified": bool(profile.get("email_confirmed_at")),
    }
