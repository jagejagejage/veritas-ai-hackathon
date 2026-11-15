"""Use-cases shared by the REST endpoints and the chatbot tools."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .csv_io import parse_csv, to_cents
from .engine import Rows, diff_results, explain, money, present, project
from .forecasting import run_forecast
from .schemas import FIELDS, DataRef, DatasetJson, ForecastRequest, WhatIfRequest
from .store import Dataset, store
from .whatif import apply_ops, pct_ops

DEFAULT_BUFFER_CENTS = 100_000
SAMPLE_PATH = Path(__file__).resolve().parent.parent / "data" / "sample-cafe.csv"


def _cents(x: float, what: str) -> int:
    try:
        return to_cents(x)
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "bad_amount", "message": f"{what}: {exc}"}) from None


def resolve(ref: DataRef) -> tuple[Rows, int, int]:
    """Return (rows in cents, opening cents, buffer cents) from a dataset_id or inline rows."""
    if ref.dataset_id is not None:
        ds = store.get(ref.dataset_id)
        if ds is None:
            raise HTTPException(404, detail={"code": "dataset_not_found", "message": "Unknown dataset_id."})
        rows, opening, buffer = ds.rows, ds.opening_cents, ds.buffer_cents
    else:
        assert ref.rows is not None
        rows = [{f: _cents(getattr(r, f), f"week {r.week} {f}") for f in FIELDS} for r in ref.rows]
        opening, buffer = 0, DEFAULT_BUFFER_CENTS
    if ref.opening_cash is not None:
        opening = _cents(ref.opening_cash, "opening_cash")
    if ref.buffer is not None:
        buffer = _cents(ref.buffer, "buffer")
    return rows, opening, buffer


# ------------------------------------------------------------------ datasets
def dataset_out(ds: Dataset) -> dict[str, Any]:
    return {
        "dataset_id": ds.dataset_id,
        "weeks": len(ds.rows),
        "opening_cash": ds.opening_cents / 100,
        "buffer": ds.buffer_cents / 100,
        "rows": [
            {"week": i, **{f: r[f] / 100 for f in FIELDS}} for i, r in enumerate(ds.rows, start=1)
        ],
    }


def create_from_csv(text: str, opening_cash: float, buffer: float) -> dict[str, Any]:
    rows = parse_csv(text)
    return dataset_out(store.put(rows, _cents(opening_cash, "opening_cash"), _cents(buffer, "buffer")))


def create_from_json(body: DatasetJson) -> dict[str, Any]:
    rows = [{f: _cents(getattr(r, f), f"week {r.week} {f}") for f in FIELDS} for r in body.rows]
    return dataset_out(store.put(rows, _cents(body.opening_cash, "opening_cash"), _cents(body.buffer, "buffer")))


def create_sample() -> dict[str, Any]:
    rows = parse_csv(SAMPLE_PATH.read_text(encoding="utf-8"))
    return dataset_out(store.put(rows, 200_000, DEFAULT_BUFFER_CENTS))


# ------------------------------------------------------------------ projection (plan as given)
def projection(ref: DataRef) -> dict[str, Any]:
    rows, opening, buffer = resolve(ref)
    res = project(opening, buffer, rows)
    return {
        "opening_cash": round(opening / 100, 2),
        "buffer": round(buffer / 100, 2),
        **present(res, rows),
        "explanation": explain(rows, res),
    }


# ------------------------------------------------------------------ forecast
def forecast(req: ForecastRequest) -> dict[str, Any]:
    hist, opening, buffer = resolve(req)
    out = run_forecast(hist, opening, buffer, req.horizon, req.baseline, req.backtest_horizon)
    internal = out.pop("_internal")
    use_model = out["recommended"] == "model"
    rows = internal["model_rows"] if use_model else internal["baseline_rows"]
    res = internal["model_res"] if use_model else internal["baseline_res"]
    out["explanation"] = explain(rows, res)
    return out


def backtest(req: ForecastRequest) -> dict[str, Any]:
    out = forecast(req)
    return {
        "history_weeks": out["history_weeks"],
        "baseline": out["baseline"],
        "recommended": out["recommended"],
        "backtest": out["backtest"],
        "warnings": out["warnings"],
    }


# ------------------------------------------------------------------ what-if
def what_if(req: WhatIfRequest) -> dict[str, Any]:
    hist, opening, buffer = resolve(req)
    notes_extra: dict[str, Any] = {}
    if req.basis == "plan":
        rows, start, source = hist, opening, "plan"
    else:
        fc = run_forecast(hist, opening, buffer, req.horizon, req.baseline, req.backtest_horizon)
        internal = fc.pop("_internal")
        source = fc["recommended"] if req.forecast_source == "recommended" else req.forecast_source
        rows = internal["model_rows"] if source == "model" else internal["baseline_rows"]
        start = internal["current_cash"]
        notes_extra["forecast_warnings"] = fc["warnings"]
    ops = pct_ops(req.sales_change_pct, req.expense_change_pct, len(rows)) + list(req.ops)
    scen_rows, notes = apply_ops(rows, ops)
    before = project(start, buffer, rows)
    after = project(start, buffer, scen_rows)
    eb, ea = explain(rows, before), explain(scen_rows, after)
    summary = (
        f"Before the change: {eb['headline']} {eb['detail']} "
        f"After the change: {ea['headline']} {ea['detail']} "
        f"Lowest cash goes from {money(before['min_closing'])} to {money(after['min_closing'])}."
    )
    return {
        "basis": req.basis,
        "source": source,
        "label": req.label,
        "starting_cash": round(start / 100, 2),
        "applied_ops": [op.model_dump() for op in ops],
        "before": present(before, rows),
        "after": present(after, scen_rows),
        "diff": diff_results(before, after),
        "explanation": {"before": eb, "after": ea},
        "summary": summary,
        "notes": {**notes, **notes_extra},
    }
