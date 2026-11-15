"""CashSense API. Run:  uvicorn app.main:app --reload"""
from __future__ import annotations

import os
from typing import Any

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter

from . import chat, service
from .csv_io import CsvError
from .forecasting import ForecastError
from .schemas import DataRef, DatasetJson, ForecastRequest, Op, WhatIfRequest, ChatToolCall
from .store import store
from .whatif import ScenarioError

MAX_UPLOAD_BYTES = 1_000_000

app = FastAPI(
    title="CashSense API",
    version="1.0.0",
    description=(
        "Cash-flow forecasting with a baseline comparison and what-if scenarios. "
        "Money is in dollars at the API boundary and integer cents internally. Education tool, not financial advice."
    ),
)

_origins = [o.strip() for o in os.getenv("CASHSENSE_CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ errors
@app.exception_handler(CsvError)
async def _csv_error(_: Request, exc: CsvError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.as_dict()})


@app.exception_handler(ScenarioError)
async def _scenario_error(_: Request, exc: ScenarioError) -> JSONResponse:
    return JSONResponse(
        status_code=422, content={"detail": {"code": "scenario_rejected", "errors": exc.errors}}
    )


@app.exception_handler(ForecastError)
async def _forecast_error(_: Request, exc: ForecastError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": {"code": "cannot_forecast", "message": str(exc)}})


# ------------------------------------------------------------------ health
@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


# ------------------------------------------------------------------ datasets
@app.post("/datasets", tags=["datasets"], summary="Upload a CSV")
async def upload_csv(
    file: UploadFile = File(..., description="CSV: week,sales_walkin,invoices_collected,supplies,payroll,rent,other"),
    opening_cash: float = Form(0.0, description="Cash before week 1, in dollars"),
    buffer: float = Form(1000.0, ge=0, description="Safety buffer, in dollars"),
) -> dict[str, Any]:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, detail={"code": "too_large", "message": "File is larger than 1 MB."})
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, detail={"code": "bad_encoding", "message": "File must be UTF-8 text."}) from None
    return service.create_from_csv(text, opening_cash, buffer)


@app.post("/datasets/json", tags=["datasets"], summary="Create a dataset from JSON rows")
def create_dataset_json(body: DatasetJson) -> dict[str, Any]:
    return service.create_from_json(body)


@app.post("/datasets/sample", tags=["datasets"], summary="Load the fictional sample café")
def create_sample() -> dict[str, Any]:
    return service.create_sample()


@app.get("/datasets/{dataset_id}", tags=["datasets"])
def get_dataset(dataset_id: str) -> dict[str, Any]:
    ds = store.get(dataset_id)
    if ds is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "Unknown dataset_id."})
    return service.dataset_out(ds)


# ------------------------------------------------------------------ analysis
@app.post("/projection", tags=["analysis"], summary="Project cash for the weeks exactly as given (the plan)")
def projection(body: DataRef) -> dict[str, Any]:
    return service.projection(body)


@app.post("/forecast", tags=["analysis"], summary="Predict future weeks and compare with a baseline")
def forecast(body: ForecastRequest) -> dict[str, Any]:
    return service.forecast(body)


@app.post("/backtest", tags=["analysis"], summary="Model vs baseline accuracy on past weeks")
def backtest(body: ForecastRequest) -> dict[str, Any]:
    return service.backtest(body)


@app.post("/whatif", tags=["analysis"], summary="What happens if sales or costs change")
def whatif(body: WhatIfRequest) -> dict[str, Any]:
    return service.what_if(body)


@app.get("/scenario/schema", tags=["analysis"], summary="JSON Schema for scenario ops and the what-if request")
def scenario_schema() -> dict[str, Any]:
    return {
        "op": TypeAdapter(Op).json_schema(),
        "what_if_request": WhatIfRequest.model_json_schema(),
    }


# ------------------------------------------------------------------ chatbot
@app.get("/chat/tools", tags=["chatbot"], summary="Tool definitions for an LLM")
def chat_tools(format: str = "anthropic") -> list[dict[str, Any]]:
    if format not in ("anthropic", "openai"):
        raise HTTPException(422, detail={"code": "bad_format", "message": "format must be anthropic or openai"})
    return chat.tool_definitions(format)


@app.get("/chat/system-prompt", tags=["chatbot"])
def chat_system_prompt() -> dict[str, str]:
    return {"system_prompt": chat.SYSTEM_PROMPT}


@app.post("/chat/execute", tags=["chatbot"], summary="Run a tool call chosen by the LLM")
def chat_execute(call: ChatToolCall = Body(...)) -> dict[str, Any]:
    return chat.execute(call.tool, call.arguments)
