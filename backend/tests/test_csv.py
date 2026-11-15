import pytest

from app.csv_io import CsvError, parse_csv, to_cents

HEADER = "week,sales_walkin,invoices_collected,supplies,payroll,rent,other"


def test_bom_crlf_and_column_order():
    text = "﻿" + "week,other,rent,payroll,supplies,invoices_collected,sales_walkin\r\n1,1,2,3,4,5,6\r\n"
    rows = parse_csv(text)
    assert rows == [
        {"sales_walkin": 600, "invoices_collected": 500, "supplies": 400, "payroll": 300, "rent": 200, "other": 100}
    ]


@pytest.mark.parametrize(
    "text,code",
    [
        ("", "empty_file"),
        (HEADER + "\n", "no_rows"),
        ("week,sales\n1,2\n", "bad_header"),
        (HEADER + ",week\n", "duplicate_column"),
        (HEADER + "\n1,1,1,1,1,1\n", "bad_row_length"),
        (HEADER + "\n2,1,1,1,1,1,1\n", "week_sequence"),
        (HEADER + "\n1,1,1,1,1,1,-5\n", "negative_amount"),
        (HEADER + "\n1,1.001,1,1,1,1,1\n", "bad_amount"),
        (HEADER + "\n1,abc,1,1,1,1,1\n", "bad_amount"),
        (HEADER + "\n1,nan,1,1,1,1,1\n", "bad_amount"),
        (HEADER + "\nx,1,1,1,1,1,1\n", "bad_week"),
    ],
)
def test_rejections(text, code):
    with pytest.raises(CsvError) as ei:
        parse_csv(text)
    assert ei.value.code == code


def test_error_points_at_row_and_column():
    with pytest.raises(CsvError) as ei:
        parse_csv(HEADER + "\n1,1,1,1,1,1,1\n2,1,1,1,1,1,-1\n")
    assert (ei.value.row, ei.value.column) == (3, "other")


def test_to_cents_is_exact():
    assert to_cents(1500.5) == 150050
    assert to_cents("0.29") == 29
    with pytest.raises(ValueError):
        to_cents(float("inf"))
