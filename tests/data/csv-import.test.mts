import assert from "node:assert/strict";
import test from "node:test";
import { buildMappedWeeklyRows, getMappedStartingCashBalance, inspectWideCsv, parseFinancialCsv } from "../../src/lib/csv-import.ts";

const header = "week,sales_walkin,invoices_collected,supplies,payroll,rent,other";
const row = (week: string, amounts = "100,20,10,30,5,5") => `${week},${amounts}`;

test("imports valid ordered records and leaves an absent balance unknown", () => {
  const parsed = parseFinancialCsv(`${header}\n${row("2026-01-05")}\n${row("2026-01-12")}`);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.startingCashBalance, null);
});

test("imports a consistent optional starting cash balance", () => {
  const parsed = parseFinancialCsv(`${header},starting_cash_balance\n2026-01-05,100,20,10,30,5,5,2500\n2026-01-12,100,20,10,30,5,5,2500`);
  assert.equal(parsed.startingCashBalance, 2500);
});

test("rejects missing columns, invalid amounts, and negative amounts clearly", () => {
  assert.throws(() => parseFinancialCsv("week,sales_walkin\n2026-01-05,1"), /Missing required columns/);
  assert.throws(() => parseFinancialCsv(`${header}\n${row("2026-01-05", "x,20,10,30,5,5")}`), /not a valid number/);
  assert.throws(() => parseFinancialCsv(`${header}\n${row("2026-01-05", "-1,20,10,30,5,5")}`), /negative amounts/);
});

test("rejects duplicate and out-of-order weeks and inconsistent balances", () => {
  assert.throws(() => parseFinancialCsv(`${header}\n${row("2026-01-05")}\n${row("2026-01-05")}`), /duplicates week/);
  assert.throws(() => parseFinancialCsv(`${header}\n${row("2026-01-12")}\n${row("2026-01-05")}`), /out of order/);
  assert.throws(() => parseFinancialCsv(`${header},starting_cash_balance\n2026-01-05,100,20,10,30,5,5,100\n2026-01-12,100,20,10,30,5,5,200`), /must be the same/);
  assert.throws(() => parseFinancialCsv(`${header}\n2026-02-31,100,20,10,30,5,5`), /unrecognized week/);
  assert.throws(() => parseFinancialCsv(`${header}\nWeek 1,100,20,10,30,5,5\n2026-01-12,100,20,10,30,5,5`), /mixes week numbers/);
});

test("rejects empty data and malformed quoting", () => {
  assert.throws(() => parseFinancialCsv(`${header}\n`), /at least one week/);
  assert.throws(() => parseFinancialCsv(`${header}\n"2026-01-05,100,20,10,30,5,5`), /closing quote/);
});

test("maps a wide weekly CSV, combines matching columns, and preserves signs", () => {
  const inspected = inspectWideCsv("Week Starting,Walk-in Sales,Card Sales,Invoices Collected,Payroll,Other income,Odd column\n2026-01-05,100,25,80,-30,4,9\n2026-01-12,90,10,70,-20,2,3");
  assert.equal(inspected.mode, "wide");
  const columns = inspected.columns.map((column) => column.header === "Odd column" ? { ...column, target: "ignore" as const } : column.header === "Other income" ? { ...column, target: "other" as const } : column);
  const rows = buildMappedWeeklyRows(columns, inspected.weeks);
  assert.deepEqual(rows[0], { week: "2026-01-05", sales_walkin: 125, invoices_collected: 80, supplies: 0, payroll: -30, rent: 0, other: 4 });
});

test("rejects duplicate headers, missing weeks, and transaction layouts", () => {
  assert.throws(() => inspectWideCsv("Week,Sales,Sales\n2026-01-05,1,2"), /Duplicate column headers/);
  const missingWeek = inspectWideCsv("Week,Sales\n,12");
  assert.throws(() => buildMappedWeeklyRows(missingWeek.columns, missingWeek.weeks), /missing its week/);
  assert.equal(inspectWideCsv("Date,Description,Amount\n2026-01-05,Coffee,12").mode, "transactions");
});

test("keeps the existing optional starting cash balance mapping", () => {
  const inspected = inspectWideCsv("Week,Sales,Starting Cash Balance\n2026-01-05,10,500\n2026-01-12,12,500");
  assert.equal(getMappedStartingCashBalance(inspected.columns, inspected.weeks), 500);
  assert.throws(() => getMappedStartingCashBalance(inspected.columns, [["2026-01-05", "10", "500"], ["2026-01-12", "12", "600"]]), /same on every row/);
});
