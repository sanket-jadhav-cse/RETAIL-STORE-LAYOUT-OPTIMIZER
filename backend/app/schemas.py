from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RunInput(BaseModel):
    dataset_id: UUID
    min_support: Annotated[float, Field(gt=0, le=1, allow_inf_nan=False)] = 0.02
    min_confidence: Annotated[float, Field(gt=0, le=1, allow_inf_nan=False)] = 0.5
    min_lift: Annotated[float, Field(ge=0, allow_inf_nan=False)] = 1
    max_itemset_size: Annotated[int | None, Field(ge=1, le=8)] = 3


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    dataset_id: UUID
    source: str
    version: str
    basket_count: int
    imported_at: datetime
    summary: dict
    latest_run_id: UUID | None = None


class RunOut(RunInput):
    model_config = ConfigDict(from_attributes=True)
    run_id: UUID
    status: str
    created_at: datetime
    completed_at: datetime | None
    error: str | None
    execution: dict
