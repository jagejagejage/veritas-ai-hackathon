"""Deterministic cash projection: the one place balances are computed."""
from __future__ import annotations

from typing import Any

from .schemas import FIELDS, INFLOWS, OUTFLOWS

Rows = list[dict[str, int]]

LABELS = {
    "rent": "Rent",
    "payroll": "Payroll",
    "supplies": "Supplies",
    "other": "Other costs",
}


def project(opening_cents: int, buffer_cents: int, rows: Rows) -> dict[str, Any]:
    """Week-by-week closing cash and status. Pure; everything is integer cents."""
    closing = opening_cents
    weeks = []
    for i, r in enumerate(rows, start=1):
        inflow = sum(r[f] for f in INFLOWS)
        outflow = sum(r[f] for f in OUTFLOWS)
        net = inflow - outflow
        closing += net
        weeks.append(
            {"week": i, "inflow": inflow, "outflow": outflow, "net": net, "closing": closing}
        )
    lows = [w["closing"] for w in weeks]
    min_closing = min(lows)
    min_week = lows.index(min_closing) + 1
    first_short = next((w["week"] for w in weeks if w["closing"] < 0), None)
    breach = [w["week"] for w in weeks if w["closing"] < buffer_cents]
    if min_closing < 0:
        status = "red"
    elif min_closing < buffer_cents:
        status = "yellow"
    else:
        status = "green"
    return {
        "weeks": weeks,
        "min_closing": min_closing,
        "min_week": min_week,
        "first_short_week": first_short,
        "shortfall": max(0, -min_closing),
        "buffer_breach_weeks": breach,
        "buffer": buffer_cents,
        "status": status,
    }


def _d(cents: int) -> float:
    return round(cents / 100, 2)


def present(result: dict[str, Any], rows: Rows) -> dict[str, Any]:
    """Cents -> dollars for the API."""
    return {
        "weeks": [
            {
                "week": w["week"],
                "inflow": _d(w["inflow"]),
                "outflow": _d(w["outflow"]),
                "net": _d(w["net"]),
                "closing": _d(w["closing"]),
                "fields": {f: _d(rows[w["week"] - 1][f]) for f in FIELDS},
            }
            for w in result["weeks"]
        ],
        "min_closing": _d(result["min_closing"]),
        "min_week": result["min_week"],
        "first_short_week": result["first_short_week"],
        "shortfall": _d(result["shortfall"]),
        "buffer_breach_weeks": result["buffer_breach_weeks"],
        "status": result["status"],
    }


def money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    c = abs(cents)
    if c % 100 == 0:
        return f"{sign}${c // 100:,}"
    return f"{sign}${c // 100:,}.{c % 100:02d}"


def explain(rows: Rows, result: dict[str, Any]) -> dict[str, str]:
    """Plain-English headline and detail. Pure and deterministic; no finance jargon."""
    status = result["status"]
    n = len(rows)
    low, low_week = result["min_closing"], result["min_week"]
    if status == "red":
        first = result["first_short_week"]
        if first == low_week:
            headline = f"You'll be {money(result['shortfall'])} short in week {first}."
        else:
            headline = (
                f"Cash runs out in week {first} and is {money(result['shortfall'])} short by week {low_week}."
            )
        row = rows[first - 1]
        outs = sorted(
            ((f, row[f]) for f in ("rent", "payroll", "supplies", "other") if row[f] > 0),
            key=lambda kv: -kv[1],
        )[:2]
        parts = [f"{LABELS[f]} ({money(v)})" for f, v in outs]
        recovery = next((w for w in result["weeks"] if w["week"] > low_week and w["closing"] >= 0), None)
        if recovery is None:
            tail = f"Cash does not recover within the {n} weeks shown."
        else:
            big = max(rows[recovery["week"] - 1][f] for f in INFLOWS)
            tail = f"{money(big)} does not arrive until week {recovery['week']}."
        if parts:
            lead = " and ".join(parts)
            verb = "land" if len(parts) > 1 else "lands"
            detail = f"{lead} {verb} first. {tail}"
        else:
            detail = tail
    elif status == "yellow":
        b = result["buffer_breach_weeks"][0]
        headline = (
            f"You stay above $0, but cash drops under your {money(result['buffer'])} safety buffer in week {b}."
        )
        detail = f"Lowest point: {money(low)} in week {low_week}."
    else:
        headline = f"Cash stays healthy. Lowest point: {money(low)} in week {low_week}."
        detail = f"It never goes under your {money(result['buffer'])} buffer over {n} weeks."
    return {"headline": headline, "detail": detail}


def diff_results(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    return {
        "min_closing_delta": _d(after["min_closing"] - before["min_closing"]),
        "status_before": before["status"],
        "status_after": after["status"],
        "first_short_week_before": before["first_short_week"],
        "first_short_week_after": after["first_short_week"],
        "week_closing_deltas": [
            _d(a["closing"] - b["closing"]) for b, a in zip(before["weeks"], after["weeks"])
        ],
        "final_closing_delta": _d(after["weeks"][-1]["closing"] - before["weeks"][-1]["closing"]),
    }
