"""Predict future weeks per cash-flow field and compare against a simple baseline.

Method (kept small on purpose, since weekly small-business data is short):
  * Candidates per field: naive, moving average, simple exponential smoothing, damped Holt trend,
    seasonal naive and seasonal mean for periods 2..4 (payroll is often biweekly, rent monthly).
  * Each candidate is scored by a rolling-origin backtest (walk-forward, multi-step).
  * The candidate with the lowest MAE is the "model" for that field. Ties go to the baseline.
  * The model is then compared to the baseline on net weekly cash flow.

Honesty note: candidates are selected on the same backtest used to report accuracy, so with short
histories the reported advantage over the baseline is optimistic. The response says so.
"""
from __future__ import annotations

import math
import statistics
from typing import Any, Callable, Optional

from .engine import Rows, present, project
from .schemas import FIELDS, INFLOWS, OUTFLOWS

MIN_TRAIN = 4
Z80 = 1.2816  # two-sided 80% interval

Fn = Callable[[list[float], int], Optional[list[float]]]


class ForecastError(ValueError):
    pass


# ------------------------------------------------------------------ candidate models
def _naive(y: list[float], h: int) -> list[float]:
    return [y[-1]] * h


def _moving_average(k: int) -> Fn:
    def f(y: list[float], h: int) -> list[float]:
        w = y[-k:]
        return [sum(w) / len(w)] * h

    return f


def _ses(y: list[float], h: int) -> list[float]:
    best: Optional[tuple[float, float]] = None
    for a in (0.1, 0.2, 0.3, 0.5, 0.7, 0.9):
        level, sse = y[0], 0.0
        for v in y[1:]:
            sse += (v - level) ** 2
            level = a * v + (1 - a) * level
        if best is None or sse < best[0]:
            best = (sse, level)
    assert best is not None
    return [best[1]] * h


def _holt_damped(y: list[float], h: int) -> Optional[list[float]]:
    if len(y) < 3:
        return None
    best = None
    for a in (0.2, 0.5, 0.8):
        for b in (0.1, 0.3):
            for phi in (0.8, 0.95):
                level, trend, sse = y[0], y[1] - y[0], 0.0
                for v in y[1:]:
                    pred = level + phi * trend
                    sse += (v - pred) ** 2
                    new = a * v + (1 - a) * pred
                    trend = b * (new - level) + (1 - b) * phi * trend
                    level = new
                if best is None or sse < best[0]:
                    best = (sse, level, trend, phi)
    assert best is not None
    _, level, trend, phi = best
    out, damp = [], 0.0
    for i in range(1, h + 1):
        damp += phi**i
        out.append(level + damp * trend)
    return out


def _seasonal_naive(p: int) -> Fn:
    def f(y: list[float], h: int) -> Optional[list[float]]:
        if len(y) < p:
            return None
        n = len(y)
        return [y[n - p + (i % p)] for i in range(h)]

    return f


def _seasonal_mean(p: int) -> Fn:
    def f(y: list[float], h: int) -> Optional[list[float]]:
        n = len(y)
        if n < 2 * p:
            return None
        out = []
        for i in range(h):
            phase = (n + i) % p
            vals = [y[j] for j in range(n) if j % p == phase]
            out.append(sum(vals) / len(vals))
        return out

    return f


def candidates() -> dict[str, Fn]:
    c: dict[str, Fn] = {
        "naive": _naive,
        "moving_average_4": _moving_average(4),
        "ses": _ses,
        "holt_damped": _holt_damped,
    }
    for p in (2, 3, 4):
        c[f"seasonal_naive_{p}"] = _seasonal_naive(p)
    for p in (2, 3, 4):
        c[f"seasonal_mean_{p}"] = _seasonal_mean(p)
    return c


# ------------------------------------------------------------------ backtesting
Preds = dict[tuple[int, int], float]


def rolling_predictions(y: list[float], fn: Fn, min_train: int, h_eval: int) -> Optional[Preds]:
    """Walk-forward predictions keyed by (origin, step). None if the model can't run at every origin."""
    preds: Preds = {}
    for t in range(min_train, len(y)):
        hh = min(h_eval, len(y) - t)
        out = fn(y[:t], hh)
        if out is None:
            return None
        for i, p in enumerate(out):
            preds[(t, i)] = max(0.0, p)
    return preds


def _mae(preds: Preds, y: list[float]) -> float:
    return sum(abs(p - y[t + i]) for (t, i), p in preds.items()) / len(preds)


def select_method(y: list[float], baseline_name: str, h_eval: int) -> dict[str, Any]:
    cands = candidates()
    if len(y) <= MIN_TRAIN:
        return {"chosen": baseline_name, "scores": {}, "model_preds": None, "baseline_preds": None}
    scores: dict[str, float] = {}
    preds_by_name: dict[str, Preds] = {}
    order = [baseline_name] + [n for n in cands if n != baseline_name]  # baseline first: wins ties
    for name in order:
        p = rolling_predictions(y, cands[name], MIN_TRAIN, h_eval)
        if p is None:
            continue
        preds_by_name[name] = p
        scores[name] = _mae(p, y)
    chosen = min(scores, key=lambda n: (scores[n], order.index(n)))
    return {
        "chosen": chosen,
        "scores": {k: round(v, 2) for k, v in scores.items()},
        "model_preds": preds_by_name[chosen],
        "baseline_preds": preds_by_name[baseline_name],
    }


def _to_cents(x: float) -> int:
    return int(math.floor(max(0.0, x) * 100 + 0.5))


def _norm_cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _net(vals: dict[str, float]) -> float:
    return sum(vals[f] for f in INFLOWS) - sum(vals[f] for f in OUTFLOWS)


def run_forecast(
    hist: Rows,
    opening_cents: int,
    buffer_cents: int,
    horizon: int,
    baseline_kind: str,
    backtest_horizon: int,
) -> dict[str, Any]:
    n = len(hist)
    if n < 2:
        raise ForecastError("Need at least 2 weeks of history to predict.")
    baseline_name = "moving_average_4" if baseline_kind == "moving_average" else "naive"
    cands = candidates()
    series = {f: [r[f] / 100 for r in hist] for f in FIELDS}
    sel = {f: select_method(series[f], baseline_name, backtest_horizon) for f in FIELDS}

    def future(fn_for: Callable[[str], Fn]) -> Rows:
        cols = {f: fn_for(f)(series[f], horizon) for f in FIELDS}
        return [{f: _to_cents(cols[f][i]) for f in FIELDS} for i in range(horizon)]

    model_rows = future(lambda f: cands[sel[f]["chosen"]])
    base_rows = future(lambda f: cands[baseline_name])

    hist_res = project(opening_cents, buffer_cents, hist)
    current_cash = hist_res["weeks"][-1]["closing"]
    model_res = project(current_cash, buffer_cents, model_rows)
    base_res = project(current_cash, buffer_cents, base_rows)

    warnings: list[str] = []
    backtest: Optional[dict[str, Any]] = None
    recommended = "baseline"
    err_model: list[float] = []
    err_base: list[float] = []
    if n > MIN_TRAIN:
        keys = list(sel[FIELDS[0]]["model_preds"])
        for key in keys:
            t, i = key
            act = _net({f: series[f][t + i] for f in FIELDS})
            err_model.append(_net({f: sel[f]["model_preds"][key] for f in FIELDS}) - act)
            err_base.append(_net({f: sel[f]["baseline_preds"][key] for f in FIELDS}) - act)

        def mae(e: list[float]) -> float:
            return sum(abs(x) for x in e) / len(e)

        def rmse(e: list[float]) -> float:
            return math.sqrt(sum(x * x for x in e) / len(e))

        mm, mb = mae(err_model), mae(err_base)
        skill = round(1 - mm / mb, 3) if mb > 0 else None
        recommended = "model" if skill is not None and skill > 0 else "baseline"
        backtest = {
            "available": True,
            "min_train_weeks": MIN_TRAIN,
            "horizon": backtest_horizon,
            "origins": len({t for t, _ in keys}),
            "test_points": len(keys),
            "selection_in_sample": True,
            "net_flow": {
                "model_mae": round(mm, 2),
                "baseline_mae": round(mb, 2),
                "model_rmse": round(rmse(err_model), 2),
                "baseline_rmse": round(rmse(err_base), 2),
                "skill_vs_baseline": skill,
            },
            "per_field": [
                {
                    "field": f,
                    "method": sel[f]["chosen"],
                    "model_mae": round(_mae(sel[f]["model_preds"], series[f]), 2),
                    "baseline_mae": round(_mae(sel[f]["baseline_preds"], series[f]), 2),
                }
                for f in FIELDS
            ],
            "candidate_scores": {f: sel[f]["scores"] for f in FIELDS},
        }
        if n < 12:
            warnings.append(
                "Short history: the method was picked and scored on the same few test points, "
                "so the accuracy gain over the baseline is optimistic."
            )
    else:
        warnings.append(
            f"Only {n} weeks of history: not enough for a backtest (need at least {MIN_TRAIN + 1}). "
            "Using the baseline."
        )
        model_rows, model_res = base_rows, base_res  # model == baseline when it can't be validated

    # rough uncertainty on net flow, from backtest errors of whichever series is recommended
    use_err = err_model if recommended == "model" else err_base
    use_res = model_res if recommended == "model" else base_res
    uncertainty: Optional[dict[str, Any]] = None
    if len(use_err) >= 2:
        sigma = statistics.pstdev(use_err)
        weeks_u = []
        for w in use_res["weeks"]:
            h = w["week"]
            spread = Z80 * sigma * math.sqrt(h) * 100
            prob = None
            if sigma > 0:
                prob = round(_norm_cdf((0 - w["closing"] / 100) / (sigma * math.sqrt(h))), 3)
            weeks_u.append(
                {
                    "week": h,
                    "low": round((w["closing"] - spread) / 100, 2),
                    "high": round((w["closing"] + spread) / 100, 2),
                    "prob_below_zero": prob,
                }
            )
        uncertainty = {
            "method": "gaussian_approximation_from_backtest_errors",
            "level": 0.8,
            "net_sigma": round(sigma, 2),
            "weeks": weeks_u,
            "note": "Rough guide only; it assumes errors are normal and grow with the square root of the horizon.",
        }

    return {
        "history_weeks": n,
        "horizon": horizon,
        "baseline": {"name": baseline_name},
        "recommended": recommended,
        "history": present(hist_res, hist),
        "starting_cash": round(current_cash / 100, 2),
        "model": {
            "methods": {f: sel[f]["chosen"] for f in FIELDS},
            **present(model_res, model_rows),
        },
        "baseline_forecast": present(base_res, base_rows),
        "backtest": backtest or {"available": False},
        "uncertainty": uncertainty,
        "warnings": warnings,
        "_internal": {
            "model_rows": model_rows,
            "baseline_rows": base_rows,
            "current_cash": current_cash,
            "model_res": model_res,
            "baseline_res": base_res,
        },
    }
