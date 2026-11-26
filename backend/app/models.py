import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = {"schema": "retail"}
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID, primary_key=True, default=uuid.uuid4
    )
    source: Mapped[str] = mapped_column(String)
    version: Mapped[str] = mapped_column(String)
    checksum: Mapped[str] = mapped_column(String, unique=True)
    basket_count: Mapped[int] = mapped_column(Integer)
    summary: Mapped[dict] = mapped_column(JSONB)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = {"schema": "retail"}
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("retail.datasets.dataset_id"), primary_key=True
    )
    product_code: Mapped[str] = mapped_column(String, primary_key=True)
    description: Mapped[str] = mapped_column(String)


class MiningRun(Base):
    __tablename__ = "runs"
    __table_args__ = (
        UniqueConstraint("run_id", "dataset_id"),
        CheckConstraint("status IN ('Queued','Running','Completed','Failed')"),
        CheckConstraint("min_support > 0 AND min_support <= 1"),
        CheckConstraint("min_confidence > 0 AND min_confidence <= 1"),
        CheckConstraint("min_lift >= 0"),
        {"schema": "retail"},
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID, primary_key=True, default=uuid.uuid4
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("retail.datasets.dataset_id"), index=True
    )
    min_support: Mapped[float] = mapped_column(Float)
    min_confidence: Mapped[float] = mapped_column(Float)
    min_lift: Mapped[float] = mapped_column(Float)
    max_itemset_size: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="Queued", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(String)
    execution: Mapped[dict] = mapped_column(JSONB, default=dict)
    itemsets: Mapped[list] = mapped_column(JSONB, default=list)


class AssociationRule(Base):
    __tablename__ = "rules"
    __table_args__ = {"schema": "retail"}
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID, primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("retail.runs.run_id"), index=True
    )
    antecedent: Mapped[list] = mapped_column(JSONB)
    consequent: Mapped[list] = mapped_column(JSONB)
    support: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    lift: Mapped[float] = mapped_column(Float)


class Adjacency(Base):
    __tablename__ = "adjacencies"
    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "dataset_id"], ["retail.runs.run_id", "retail.runs.dataset_id"]
        ),
        ForeignKeyConstraint(
            ["dataset_id", "product_a"],
            ["retail.products.dataset_id", "retail.products.product_code"],
        ),
        ForeignKeyConstraint(
            ["dataset_id", "product_b"],
            ["retail.products.dataset_id", "retail.products.product_code"],
        ),
        UniqueConstraint("run_id", "product_a", "product_b"),
        UniqueConstraint("run_id", "rank"),
        CheckConstraint("product_a < product_b"),
        {"schema": "retail"},
    )
    adjacency_id: Mapped[uuid.UUID] = mapped_column(
        UUID, primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(UUID, index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(UUID)
    product_a: Mapped[str] = mapped_column(String)
    product_b: Mapped[str] = mapped_column(String)
    support: Mapped[float] = mapped_column(Float)
    confidence_a_b: Mapped[float | None] = mapped_column(Float)
    confidence_b_a: Mapped[float | None] = mapped_column(Float)
    lift: Mapped[float] = mapped_column(Float)
    rank: Mapped[int] = mapped_column(Integer)
    rationale: Mapped[str] = mapped_column(String)
