import unicodedata
from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RunName(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value or any(
            unicodedata.category(c).startswith("C") or c in "<>" for c in value
        ):
            raise ValueError(
                "Use a printable run name without markup, up to 120 characters"
            )
        return value


class RunInput(BaseModel):
    dataset_id: UUID
    name: Annotated[str | None, Field(max_length=120)] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return RunName(name=value).name if value is not None else None

    min_support: Annotated[float, Field(gt=0, le=1, allow_inf_nan=False)] = 0.02
    min_confidence: Annotated[float, Field(gt=0, le=1, allow_inf_nan=False)] = 0.5
    min_lift: Annotated[float, Field(ge=0, allow_inf_nan=False)] = 1
    max_itemset_size: Annotated[int | None, Field(ge=1, le=8)] = 3


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    dataset_id: UUID
    name: str
    description: str | None
    source_organization: str | None
    source_url: str | None
    doi: str | None
    transaction_start: date | None
    transaction_end: date | None
    processing_status: str
    source: str
    version: str
    basket_count: int
    imported_at: datetime
    summary: dict
    latest_run_id: UUID | None = None
    is_shared: bool = False
    checksum: str | None = None


class DatasetUpdate(BaseModel):
    name: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    processing_status: Annotated[str | None, Field(pattern="^Archived$")] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is not None:
            value = value.strip()
            if not value or any(unicodedata.category(c).startswith("C") for c in value):
                raise ValueError("Use a printable dataset name")
        return value


class RunOut(RunInput):
    name: str
    model_config = ConfigDict(from_attributes=True)
    run_id: UUID
    status: str
    created_at: datetime
    completed_at: datetime | None
    error: str | None
    execution: dict


class RunHistoryItem(RunOut):
    dataset_name: str


class RunHistory(BaseModel):
    items: list[RunHistoryItem]
    total: int
    page: int
    page_size: int
