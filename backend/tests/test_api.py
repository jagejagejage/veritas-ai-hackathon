import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

FIELDS = ["sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"]


@pytest.fixture()
def ds():
    r = client.post("/datasets/sample")
    assert r.status_code == 200
    return r.json()["dataset_id"]


def test_health_and_cors():
    r = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert r.json()["status"] == "ok"
    assert r.headers["access-control-allow-origin"] == "*"


def test_upload_csv_roundtrip():
    csv_text = "week,sales_walkin,invoices_collected,supplies,payroll,rent,other\n1,100,0,50,0,0,0\n2,100,0,50,0,0,0\n"
    r = client.post(
        "/datasets",
        files={"file": ("x.csv", csv_text, "text/csv")},
        data={"opening_cash": "500", "buffer": "100"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["weeks"] == 2 and body["opening_cash"] == 500.0
    again = client.get(f"/datasets/{body['dataset_id']}").json()
    assert again["rows"][0]["sales_walkin"] == 100.0


def test_upload_rejects_bad_csv_with_location():
    r = client.post("/datasets", files={"file": ("x.csv", "week,a\n1,2\n", "text/csv")})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "bad_header"


def test_upload_too_large():
    big = "x" * 1_200_000
    r = client.post("/datasets", files={"file": ("x.csv", big, "text/csv")})
    assert r.status_code == 413


def test_projection_matches_golden(ds):
    r = client.post("/projection", json={"dataset_id": ds}).json()
    assert [w["closing"] for w in r["weeks"]] == [1700, 2000, 2200, 2500, -1300, 5000, 7700, 8000]
    assert r["status"] == "red" and r["first_short_week"] == 5
    assert r["explanation"]["headline"] == "You'll be $1,300 short in week 5."


def test_whatif_plan_catering_late(ds):
    body = {
        "dataset_id": ds,
        "basis": "plan",
        "ops": [{"op": "shift", "field": "invoices_collected", "from_week": 6, "by_weeks": 2, "amount": "all"}],
    }
    r = client.post("/whatif", json=body).json()
    assert [w["closing"] for w in r["after"]["weeks"]] == [1700, 2000, 2200, 2500, -1300, -2500, 200, 8000]
    assert r["diff"]["min_closing_delta"] == -1200.0
    assert r["diff"]["final_closing_delta"] == 0.0
    assert "$2,500" in r["explanation"]["after"]["headline"]
    assert r["summary"].startswith("Before the change:")


def test_whatif_percent_changes(ds):
    r = client.post(
        "/whatif", json={"dataset_id": ds, "basis": "plan", "sales_change_pct": -20, "expense_change_pct": 10}
    ).json()
    assert r["after"]["min_closing"] < r["before"]["min_closing"]
    assert len(r["applied_ops"]) == 6  # 2 sales fields + 4 cost fields


def test_whatif_on_forecast_basis(ds):
    r = client.post("/whatif", json={"dataset_id": ds, "sales_change_pct": -30}).json()
    assert r["basis"] == "forecast" and len(r["after"]["weeks"]) == 8
    assert r["after"]["weeks"][-1]["closing"] < r["before"]["weeks"][-1]["closing"]


def test_whatif_validation(ds):
    assert client.post("/whatif", json={"dataset_id": ds}).status_code == 422  # nothing to simulate
    bad_week = {"dataset_id": ds, "basis": "plan", "ops": [{"op": "add", "field": "other", "week": 99, "amount": 5}]}
    r = client.post("/whatif", json=bad_week)
    assert r.status_code == 422 and r.json()["detail"]["errors"][0]["path"] == "/ops/0/week"
    pollution = {"dataset_id": ds, "ops": [{"op": "add", "field": "other", "week": 1, "amount": 5, "__proto__": {}}]}
    assert client.post("/whatif", json=pollution).status_code == 422
    assert client.post("/whatif", json={"dataset_id": ds, "sales_change_pct": 999}).status_code == 422
    too_many = {"dataset_id": ds, "ops": [{"op": "add", "field": "other", "week": 1, "amount": 1}] * 6}
    assert client.post("/whatif", json=too_many).status_code == 422


def test_data_reference_rules(ds):
    rows = [{"week": i, **{f: 100 for f in FIELDS}} for i in (1, 2)]
    assert client.post("/forecast", json={"dataset_id": ds, "rows": rows}).status_code == 422
    assert client.post("/forecast", json={}).status_code == 422
    assert client.post("/forecast", json={"dataset_id": "nope"}).status_code == 404
    gap = [{"week": 1, **{f: 1 for f in FIELDS}}, {"week": 3, **{f: 1 for f in FIELDS}}]
    assert client.post("/forecast", json={"rows": gap}).status_code == 422


def test_forecast_shape_and_baseline(ds):
    r = client.post("/forecast", json={"dataset_id": ds, "horizon": 8}).json()
    assert len(r["model"]["weeks"]) == 8 and len(r["baseline_forecast"]["weeks"]) == 8
    assert r["baseline"]["name"] == "moving_average_4"
    bt = r["backtest"]
    assert bt["available"] and bt["selection_in_sample"]
    assert {"model_mae", "baseline_mae", "skill_vs_baseline"} <= set(bt["net_flow"])
    assert r["recommended"] in ("model", "baseline")
    assert any("Short history" in w for w in r["warnings"])
    for wk in r["model"]["weeks"] + r["baseline_forecast"]["weeks"]:
        assert all(v >= 0 for v in wk["fields"].values())  # forecasts are never negative
    assert r["starting_cash"] == 8000.0  # opening 2000 + 6000 net over the 8 history weeks


def test_forecast_finds_payroll_and_rent_rhythm(ds):
    r = client.post("/forecast", json={"dataset_id": ds, "horizon": 8}).json()
    methods = r["model"]["methods"]
    assert methods["payroll"].startswith("seasonal") and methods["rent"].startswith("seasonal")
    pay = [w["fields"]["payroll"] for w in r["model"]["weeks"]]
    assert pay == [0, 2400, 0, 2400, 0, 2400, 0, 2400]
    rent = [w["fields"]["rent"] for w in r["model"]["weeks"]]
    assert rent[0] == 3000 and rent[4] == 3000 and rent[1] == rent[2] == rent[3] == 0


def test_model_beats_baseline_on_periodic_data():
    pattern = [1000, 2000, 3000]
    rows = [
        {
            "week": i + 1,
            "sales_walkin": pattern[i % 3],
            "invoices_collected": 0,
            "supplies": 500,
            "payroll": 0,
            "rent": 0,
            "other": 0,
        }
        for i in range(18)
    ]
    r = client.post("/forecast", json={"rows": rows, "opening_cash": 0, "horizon": 6}).json()
    assert r["model"]["methods"]["sales_walkin"].startswith("seasonal")
    assert r["backtest"]["net_flow"]["skill_vs_baseline"] > 0.5
    assert r["recommended"] == "model"
    assert not any("Short history" in w for w in r["warnings"])


def test_short_history_falls_back_to_baseline():
    rows = [{"week": i, **{f: 100 for f in FIELDS}} for i in (1, 2, 3)]
    r = client.post("/forecast", json={"rows": rows}).json()
    assert r["recommended"] == "baseline" and r["backtest"] == {"available": False}
    assert any("not enough for a backtest" in w for w in r["warnings"])
    one = client.post("/forecast", json={"rows": rows[:1]})
    assert one.status_code == 422 and one.json()["detail"]["code"] == "cannot_forecast"


def test_uncertainty_is_present_and_ordered(ds):
    r = client.post("/forecast", json={"dataset_id": ds}).json()
    u = r["uncertainty"]
    assert u and len(u["weeks"]) == 8
    for w in u["weeks"]:
        assert w["low"] <= w["high"]
    spreads = [w["high"] - w["low"] for w in u["weeks"]]
    assert spreads == sorted(spreads)  # widens with the horizon


def test_backtest_endpoint(ds):
    r = client.post("/backtest", json={"dataset_id": ds, "baseline": "naive"}).json()
    assert r["baseline"]["name"] == "naive" and r["backtest"]["available"]


def test_forecast_is_deterministic(ds):
    a = client.post("/forecast", json={"dataset_id": ds}).json()
    b = client.post("/forecast", json={"dataset_id": ds}).json()
    assert a == b


# ------------------------------------------------------------------ chatbot
def test_chat_tool_definitions():
    a = client.get("/chat/tools").json()
    assert {t["name"] for t in a} == {"get_forecast", "run_what_if", "get_backtest"}
    assert all("input_schema" in t for t in a)
    o = client.get("/chat/tools", params={"format": "openai"}).json()
    assert o[0]["type"] == "function" and "parameters" in o[0]["function"]
    assert client.get("/chat/tools", params={"format": "x"}).status_code == 422
    assert "never calculate" in client.get("/chat/system-prompt").json()["system_prompt"]


def test_chat_execute_what_if(ds):
    call = {
        "tool": "run_what_if",
        "arguments": {
            "dataset_id": ds,
            "basis": "plan",
            "ops": [{"op": "add", "field": "other", "week": 4, "amount": 1500}],
        },
    }
    r = client.post("/chat/execute", json=call).json()
    assert r["ok"] and "$2,800 short" in r["summary"]
    assert "Lowest cash goes from -$1,300 to -$2,800." in r["summary"]
    assert r["data"]["after"]["weeks"][4]["closing"] == -2800.0


def test_chat_execute_bad_input_returns_ok_false(ds):
    r = client.post("/chat/execute", json={"tool": "run_what_if", "arguments": {"dataset_id": ds}}).json()
    assert r["ok"] is False and r["error"] == "invalid arguments"
    r = client.post("/chat/execute", json={"tool": "get_forecast", "arguments": {"dataset_id": "nope"}}).json()
    assert r["ok"] is False
    r = client.post(
        "/chat/execute",
        json={
            "tool": "run_what_if",
            "arguments": {
                "dataset_id": ds,
                "basis": "plan",
                "ops": [{"op": "shift", "field": "rent", "from_week": 1, "by_weeks": -3, "amount": 1}],
            },
        },
    ).json()
    assert r["ok"] is False and r["error"] == "scenario rejected"
    assert client.post("/chat/execute", json={"tool": "drop_tables", "arguments": {}}).status_code == 422


def test_chat_execute_forecast_and_backtest(ds):
    f = client.post("/chat/execute", json={"tool": "get_forecast", "arguments": {"dataset_id": ds}}).json()
    assert f["ok"] and f["summary"].startswith("Next 8 weeks")
    b = client.post("/chat/execute", json={"tool": "get_backtest", "arguments": {"dataset_id": ds}}).json()
    assert b["ok"] and "Average weekly miss" in b["summary"]
