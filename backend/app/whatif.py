"""What-if scenarios: apply ordered ops to a copy of the weekly rows. No money maths outside integer cents."""
from __future__ import annotations

import copy
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from .csv_io import to_cents
from .engine import Rows
from .schemas import AddOp, FieldName, Op, ScaleOp, ShiftOp

SALES_FIELDS: tuple[FieldName, ...] = ("sales_walkin", "invoices_collected")
EXPENSE_FIELDS: tuple[FieldName, ...] = ("supplies", "payroll", "rent", "other")


class ScenarioError(ValueError):
    def __init__(self, errors: list[dict[str, str]]):
        super().__init__("; ".join(e["message"] for e in errors))
        self.errors = errors


def pct_ops(sales_pct: float | None, expense_pct: float | None, horizon: int) -> list[Op]:
    """Turn 'sales down 20%' style inputs into scale ops over the whole horizon."""
    ops: list[Op] = []
    for pct, fields in ((sales_pct, SALES_FIELDS), (expense_pct, EXPENSE_FIELDS)):
        if not pct:
            continue
        factor = 1 + pct / 100
        for f in fields:
            ops.append(ScaleOp(op="scale", field=f, factor=factor, from_week=1, to_week=horizon))
    return ops


def _scale(cents: int, factor: float) -> int:
    v = (Decimal(cents) * Decimal(str(factor))).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(v)


def apply_ops(rows: Rows, ops: list[Op]) -> tuple[Rows, dict[str, Any]]:
    """Apply ops in order. Returns (new rows, notes). Raises ScenarioError listing every problem found."""
    work = copy.deepcopy(rows)
    horizon = len(work)
    errors: list[dict[str, str]] = []
    truncated = 0

    def bad(k: int, key: str, msg: str) -> None:
        errors.append({"path": f"/ops/{k}/{key}", "message": msg})

    for k, op in enumerate(ops):
        if isinstance(op, ShiftOp):
            if op.from_week > horizon:
                bad(k, "from_week", f"week {op.from_week} is outside the {horizon}-week horizon")
                continue
            target = op.from_week + op.by_weeks
            if target < 1:
                bad(k, "by_weeks", f"moving by {op.by_weeks} weeks goes before week 1")
                continue
            avail = work[op.from_week - 1][op.field]
            amount = avail if op.amount == "all" else to_cents(op.amount)
            if amount <= 0:
                bad(k, "amount", "there is nothing to move")
                continue
            if amount > avail:
                bad(k, "amount", f"only {avail / 100:,.2f} is available in week {op.from_week}")
                continue
            work[op.from_week - 1][op.field] -= amount
            if target <= horizon:
                work[target - 1][op.field] += amount
            else:
                truncated += amount
        elif isinstance(op, AddOp):
            if op.week > horizon:
                bad(k, "week", f"week {op.week} is outside the {horizon}-week horizon")
                continue
            work[op.week - 1][op.field] += to_cents(op.amount)
        else:  # ScaleOp
            if op.to_week > horizon:
                bad(k, "to_week", f"week {op.to_week} is outside the {horizon}-week horizon")
                continue
            for w in range(op.from_week, op.to_week + 1):
                work[w - 1][op.field] = _scale(work[w - 1][op.field], op.factor)
    if errors:
        raise ScenarioError(errors)
    return work, {"truncated_beyond_horizon": round(truncated / 100, 2)}
