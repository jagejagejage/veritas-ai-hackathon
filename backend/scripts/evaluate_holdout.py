"""One-shot chronological holdout comparison for the included fictional sample.

Candidate selection sees only the training prefix. The final holdout weeks are never
used to select or fit methods. This small sample is an example, not production evidence.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.csv_io import parse_csv
from app.forecasting import run_forecast
from app.schemas import FIELDS, INFLOWS, OUTFLOWS


def net(row: dict[str, int]) -> float:
    return sum(row[field] for field in INFLOWS) - sum(row[field] for field in OUTFLOWS)


def scores(predicted: list[float], actual: list[float]) -> dict[str, float]:
    errors = [p - a for p, a in zip(predicted, actual)]
    return {
        "mae_dollars_per_week": round(sum(abs(e) for e in errors) / len(errors), 2),
        "rmse_dollars_per_week": round(math.sqrt(sum(e * e for e in errors) / len(errors)), 2),
    }


def main() -> None:
    sample = BACKEND_ROOT / "data" / "sample-cafe.csv"
    rows = parse_csv(sample.read_text(encoding="utf-8"))
    training_weeks = max(5, len(rows) - 3)
    if training_weeks >= len(rows):
        raise SystemExit("Need at least 6 rows for a 5-week train / holdout evaluation.")
    train = rows[:training_weeks]
    holdout = rows[training_weeks:]
    result = run_forecast(
        train, opening_cents=200_000, buffer_cents=100_000,
        horizon=len(holdout), baseline_kind="moving_average", backtest_horizon=2,
    )
    internal = result["_internal"]
    actual = [net(row) / 100 for row in holdout]
    model = [net(row) / 100 for row in internal["model_rows"]]
    baseline = [net(row) / 100 for row in internal["baseline_rows"]]
    model_score, baseline_score = scores(model, actual), scores(baseline, actual)
    report = {
        "dataset": "fictional sample-cafe.csv",
        "training_weeks": training_weeks,
        "holdout_weeks": len(holdout),
        "holdout_is_chronological_and_unseen_during_method_selection": True,
        "selected_field_methods": result["model"]["methods"],
        "weekly_net_cash_flow": [
            {"week": training_weeks + i + 1, "actual": actual[i], "model": model[i], "baseline": baseline[i]}
            for i in range(len(actual))
        ],
        "model": model_score,
        "baseline": baseline_score,
        "mae_skill_vs_baseline": round(1 - model_score["mae_dollars_per_week"] / baseline_score["mae_dollars_per_week"], 4)
        if baseline_score["mae_dollars_per_week"] else None,
        "limitations": [
            "This is a single, very small holdout on the backend's fictional example data, not real business data.",
            "The model chooses field methods with rolling-origin scores from only the training prefix; that is weak evidence with this sample size.",
            "The in-API backtest is separately selection-in-sample and must not be reported as this holdout result.",
        ],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
