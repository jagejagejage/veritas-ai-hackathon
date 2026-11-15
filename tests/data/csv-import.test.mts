import assert from "node:assert/strict";
import test from "node:test";
import { parseFinancialCsv } from "../../src/lib/csv-import.ts";

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
