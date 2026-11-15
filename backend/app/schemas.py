"""Request/response models. Money crosses the API in dollars; internally it is integer cents."""
from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FIELDS = (
    "sales_walkin",
    "invoices_collected",
    "supplies",
    "payroll",
    "rent",
    "other",
)
INFLOWS = ("sales_walkin", "invoices_collected")
OUTFLOWS = ("supplies", "payroll", "rent", "other")

FieldName = Literal[
    "sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"
]
Money = Annotated[float, Field(ge=0, le=100_000_000, allow_inf_nan=False)]
Amount = Annotated[float, Field(gt=0, le=100_000_000, allow_inf_nan=False)]
Pct = Annotated[float, Field(ge=-100, le=200, allow_inf_nan=False)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WeekRowIn(Strict):
    week: int = Field(ge=1, le=156)
    sales_walkin: Money
    invoices_collected: Money
    supplies: Money
    payroll: Money
    rent: Money
    other: Money


# ---------------------------------------------------------------- scenario ops
class ShiftOp(Strict):
    """Move money earlier (negative by_weeks) or later (positive) within a field."""

    op: Literal["shift"]
    field: FieldName
    from_week: int = Field(ge=1, le=156)
    by_weeks: int = Field(ge=-8, le=8)
    amount: Union[Literal["all"], Amount]

    @field_validator("by_weeks")
    @classmethod
    def _nonzero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("by_weeks must not be 0 (that is a no-op)")
        return v


class AddOp(Strict):
    """Add a one-off amount to a field in one week (a purchase, a surprise bill, a big order)."""

    op: Literal["add"]
    field: FieldName
    week: int = Field(ge=1, le=156)
    amount: Amount


class ScaleOp(Strict):
    """Multiply a field by a factor over a week range (0.8 = down 20%)."""

    op: Literal["scale"]
    field: FieldName
    factor: Annotated[float, Field(ge=0, le=3, allow_inf_nan=False)]
    from_week: int = Field(ge=1, le=156)
    to_week: int = Field(ge=1, le=156)

    @model_validator(mode="after")
    def _check(self) -> "ScaleOp":
        if self.factor == 1:
            raise ValueError("factor must not be 1 (that is a no-op)")
        if self.from_week > self.to_week:
            raise ValueError("from_week must be <= to_week")
        return self


Op = Annotated[Union[ShiftOp, AddOp, ScaleOp], Field(discriminator="op")]


# ---------------------------------------------------------------- requests
class DataRef(Strict):
    """Point at data: either a stored dataset_id or inline rows (not both)."""

    dataset_id: Optional[str] = Field(default=None, max_length=64)
    rows: Optional[list[WeekRowIn]] = Field(default=None, min_length=1, max_length=156)
    opening_cash: Optional[float] = Field(
        default=None, ge=-100_000_000, le=100_000_000, allow_inf_nan=False,
        description="Cash on hand before week 1 of the data, in dollars.",
    )
    buffer: Optional[float] = Field(
        default=None, ge=0, le=100_000_000, allow_inf_nan=False,
        description="Safety buffer in dollars (default 1000).",
    )

    @model_validator(mode="after")
    def _one_source(self) -> "DataRef":
        if (self.dataset_id is None) == (self.rows is None):
            raise ValueError("provide exactly one of dataset_id or rows")
        if self.rows is not None:
            weeks = [r.week for r in self.rows]
            if weeks != list(range(1, len(weeks) + 1)):
                raise ValueError("rows must have week = 1..N in order, with no gaps")
        return self


class ForecastRequest(DataRef):
    horizon: int = Field(default=8, ge=1, le=26, description="Weeks to predict.")
    baseline: Literal["moving_average", "naive"] = "moving_average"
    backtest_horizon: int = Field(default=4, ge=1, le=8)


class WhatIfRequest(ForecastRequest):
    basis: Literal["forecast", "plan"] = Field(
        default="forecast",
        description="'forecast' applies the change to predicted future weeks; "
        "'plan' applies it to the uploaded weeks as given.",
    )
    forecast_source: Literal["recommended", "model", "baseline"] = "recommended"
    sales_change_pct: Optional[Pct] = Field(
        default=None, description="Change to walk-in sales and invoice collections, in percent."
    )
    expense_change_pct: Optional[Pct] = Field(
        default=None, description="Change to supplies, payroll, rent and other costs, in percent."
    )
    ops: list[Op] = Field(default_factory=list, max_length=5)
    label: Optional[str] = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _has_effect(self) -> "WhatIfRequest":
        if not self.ops and not self.sales_change_pct and not self.expense_change_pct:
            raise ValueError(
                "nothing to simulate: set sales_change_pct, expense_change_pct, or ops"
            )
        return self


class DatasetJson(Strict):
    rows: list[WeekRowIn] = Field(min_length=1, max_length=156)
    opening_cash: float = Field(default=0, ge=-100_000_000, le=100_000_000, allow_inf_nan=False)
    buffer: float = Field(default=1000, ge=0, le=100_000_000, allow_inf_nan=False)

    @model_validator(mode="after")
    def _contiguous(self) -> "DatasetJson":
        if [r.week for r in self.rows] != list(range(1, len(self.rows) + 1)):
            raise ValueError("rows must have week = 1..N in order, with no gaps")
        return self


class ChatToolCall(Strict):
    tool: Literal["get_forecast", "run_what_if", "get_backtest"]
    arguments: dict
