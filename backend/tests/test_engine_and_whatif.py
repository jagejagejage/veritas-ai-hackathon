import copy
import random

import pytest

from app.csv_io import parse_csv
from app.engine import explain, project
from app.schemas import AddOp, ScaleOp, ShiftOp
from app.service import SAMPLE_PATH
from app.whatif import ScenarioError, apply_ops

OPENING = 200_000
BUFFER = 100_000


@pytest.fixture()
def sample():
    return parse_csv(SAMPLE_PATH.read_text())


def closings(rows):
    return [w["closing"] // 100 for w in project(OPENING, BUFFER, rows)["weeks"]]


def test_golden_baseline(sample):
    res = project(OPENING, BUFFER, sample)
    assert closings(sample) == [1700, 2000, 2200, 2500, -1300, 5000, 7700, 8000]
    assert res["first_short_week"] == 5 and res["min_week"] == 5
    assert res["shortfall"] == 130_000 and res["status"] == "red"


def test_golden_catering_pays_two_weeks_late(sample):
    rows, notes = apply_ops(
        sample, [ShiftOp(op="shift", field="invoices_collected", from_week=6, by_weeks=2, amount=7500)]
    )
    assert closings(rows) == [1700, 2000, 2200, 2500, -1300, -2500, 200, 8000]
    assert notes["truncated_beyond_horizon"] == 0


def test_golden_oven(sample):
    rows, _ = apply_ops(sample, [AddOp(op="add", field="other", week=4, amount=1500)])
    c = closings(rows)
    assert c[3] == 1000 and c[4] == -2800


def test_golden_sales_drop(sample):
    rows, _ = apply_ops(sample, [ScaleOp(op="scale", field="sales_walkin", factor=0.8, from_week=1, to_week=8)])
    assert closings(rows) == [1100, 800, 400, 100, -4300, 1400, 3500, 3200]


def test_golden_move_repair(sample):
    rows, _ = apply_ops(sample, [ShiftOp(op="shift", field="other", from_week=5, by_weeks=1, amount=2000)])
    res = project(OPENING, BUFFER, rows)
    assert res["weeks"][4]["closing"] == 70_000 and res["status"] == "yellow"


def test_explain_matches_the_story(sample):
    e = explain(sample, project(OPENING, BUFFER, sample))
    assert e["headline"] == "You'll be $1,300 short in week 5."
    assert "Rent ($3,000)" in e["detail"] and "Other costs ($2,000)" in e["detail"]
    assert "$7,500" in e["detail"] and "week 6" in e["detail"]


def test_closing_exactly_zero_is_not_red():
    rows = [dict(sales_walkin=0, invoices_collected=0, supplies=100, payroll=0, rent=0, other=0)]
    res = project(100, 0, rows)
    assert res["weeks"][0]["closing"] == 0 and res["status"] == "green"
    assert project(100, 50, rows)["status"] == "yellow"


def test_apply_ops_never_mutates_and_empty_is_identity(sample):
    before = copy.deepcopy(sample)
    out, _ = apply_ops(sample, [])
    assert out == before and sample == before
    apply_ops(sample, [AddOp(op="add", field="rent", week=2, amount=10)])
    assert sample == before


def test_shift_beyond_horizon_is_reported(sample):
    rows, notes = apply_ops(
        sample, [ShiftOp(op="shift", field="invoices_collected", from_week=8, by_weeks=3, amount="all")]
    )
    assert notes["truncated_beyond_horizon"] == 1500.0
    assert rows[7]["invoices_collected"] == 0


def test_scenario_errors_are_all_reported(sample):
    with pytest.raises(ScenarioError) as ei:
        apply_ops(
            sample,
            [
                ShiftOp(op="shift", field="rent", from_week=1, by_weeks=-1, amount=1),
                AddOp(op="add", field="other", week=99, amount=5),
                ShiftOp(op="shift", field="rent", from_week=1, by_weeks=1, amount=999_999),
            ],
        )
    paths = [e["path"] for e in ei.value.errors]
    assert paths == ["/ops/0/by_weeks", "/ops/1/week", "/ops/2/amount"]


def test_random_properties():
    rng = random.Random(7)
    fields = ["sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"]
    for _ in range(300):
        n = rng.randint(2, 12)
        rows = [{f: rng.randint(0, 500_000) for f in fields} for _ in range(n)]
        opening = rng.randint(-100_000, 1_000_000)
        buffer = rng.randint(0, 300_000)
        res = project(opening, buffer, rows)
        total_net = sum(w["net"] for w in res["weeks"])
        assert res["weeks"][-1]["closing"] == opening + total_net  # conservation
        low = min(w["closing"] for w in res["weeks"])
        want = "red" if low < 0 else "yellow" if low < buffer else "green"
        assert res["status"] == want
        # an in-horizon shift preserves the field total
        f = rng.choice(fields)
        src = rng.randint(1, n)
        by = rng.choice([b for b in range(-8, 9) if b and 1 <= src + b <= n] or [0])
        if by and rows[src - 1][f] > 0:
            out, notes = apply_ops(rows, [ShiftOp(op="shift", field=f, from_week=src, by_weeks=by, amount="all")])
            assert sum(r[f] for r in out) == sum(r[f] for r in rows)
            assert notes["truncated_beyond_horizon"] == 0
