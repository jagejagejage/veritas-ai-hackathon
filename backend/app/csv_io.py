"""Strict CSV parsing. All money becomes integer cents."""
from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation
from typing import Any

from .schemas import FIELDS

CSV_COLUMNS = ("week",) + FIELDS
MAX_ROWS = 156


class CsvError(ValueError):
    def __init__(self, code: str, message: str, row: int | None = None, column: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.row = row
        self.column = column

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "row": self.row, "column": self.column}


def to_cents(value: Any) -> int:
    """Dollars -> integer cents. Rejects NaN/inf, negatives are the caller's job, and >2 decimals."""
    try:
        d = Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"not a number: {value!r}") from exc
    if not d.is_finite():
        raise ValueError(f"not a finite number: {value!r}")
    cents = d * 100
    if cents != cents.to_integral_value():
        raise ValueError(f"more than 2 decimal places: {value!r}")
    return int(cents)


def parse_csv(text: str) -> list[dict[str, int]]:
    """Parse weekly rows. Header must be exactly week + the six money columns, any order."""
    text = text.lstrip("﻿")
    reader = csv.reader(io.StringIO(text))
    try:
        header = [h.strip() for h in next(reader)]
    except StopIteration:
        raise CsvError("empty_file", "The file is empty.") from None
    if len(set(header)) != len(header):
        raise CsvError("duplicate_column", "The header has a duplicate column name.")
    if set(header) != set(CSV_COLUMNS):
        missing = sorted(set(CSV_COLUMNS) - set(header))
        extra = sorted(set(header) - set(CSV_COLUMNS))
        raise CsvError(
            "bad_header",
            f"Header must be exactly: {', '.join(CSV_COLUMNS)}. Missing: {missing or 'none'}. "
            f"Unexpected: {extra or 'none'}.",
        )
    rows: list[dict[str, int]] = []
    for line_no, cells in enumerate(reader, start=2):
        if not any(c.strip() for c in cells):
            continue
        if len(cells) != len(header):
            raise CsvError("bad_row_length", f"Expected {len(header)} cells, got {len(cells)}.", row=line_no)
        if len(rows) >= MAX_ROWS:
            raise CsvError("too_many_rows", f"At most {MAX_ROWS} weeks are supported.", row=line_no)
        rec = dict(zip(header, cells))
        try:
            week = int(rec["week"].strip())
        except ValueError:
            raise CsvError("bad_week", "week must be a whole number.", row=line_no, column="week") from None
        if week != len(rows) + 1:
            raise CsvError(
                "week_sequence", f"Expected week {len(rows) + 1} but found {week}.", row=line_no, column="week"
            )
        row: dict[str, int] = {}
        for f in FIELDS:
            try:
                cents = to_cents(rec[f])
            except ValueError as exc:
                raise CsvError("bad_amount", str(exc), row=line_no, column=f) from None
            if cents < 0:
                raise CsvError("negative_amount", "Amounts must be zero or more.", row=line_no, column=f)
            row[f] = cents
        rows.append(row)
    if not rows:
        raise CsvError("no_rows", "The file has a header but no data rows.")
    return rows
