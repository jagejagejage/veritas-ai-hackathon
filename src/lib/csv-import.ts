import type { WeeklyCashFlow } from "@/lib/types";

const REQUIRED = ["week", "sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"] as const;
const AMOUNTS = REQUIRED.slice(1);
const STARTING_BALANCE = "starting_cash_balance";

export interface CsvImportResult {
  rows: WeeklyCashFlow[];
  /** null means no starting balance was supplied; callers must not infer one. */
  startingCashBalance: number | null;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("A quoted CSV value is missing its closing quote.");
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function weekOrder(value: string): { value: number; kind: "sequence" | "date" } | null {
  const week = value.match(/^week\s+(\d+)$/i);
  if (week) return { value: Number(week[1]), kind: "sequence" };
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const month = value.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  let date: Date;
  if (iso) date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  else if (us) date = new Date(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2])));
  else if (month) {
    const names = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = names.indexOf(month[1].slice(0, 3).toLowerCase());
    if (monthIndex < 0) return null;
    date = new Date(Date.UTC(Number(month[3] ?? 2000), monthIndex, Number(month[2])));
  } else return null;
  if (!Number.isFinite(date.getTime())) return null;
  const day = Number(iso?.[3] ?? us?.[2] ?? month?.[2]);
  const monthIndex = Number(iso?.[2] ?? us?.[1] ?? (month ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month[1].slice(0, 3).toLowerCase()) + 1 : NaN));
  const year = Number(iso?.[1] ?? us?.[3] ?? month?.[3] ?? 2000);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== monthIndex || date.getUTCDate() !== day) return null;
  return { value: date.getTime(), kind: "date" };
}

export function parseFinancialCsv(text: string): CsvImportResult {
  const table = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) throw new Error("Add a header row and at least one week of data.");
  const headers = table[0].map((header) => header.trim().toLowerCase());
  const missing = REQUIRED.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}. Add them to the CSV header and try again.`);
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new Error(`Duplicate column: ${[...new Set(duplicateHeaders)].join(", ")}. Keep each column header only once.`);
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const rows: WeeklyCashFlow[] = [];
  const balances: number[] = [];
  const seenWeeks = new Set<string>();
  let previousOrder: number | null = null;
  let weekKind: "sequence" | "date" | null = null;
  for (let i = 1; i < table.length; i += 1) {
    const values = table[i];
    const week = values[indexes.week]?.trim() ?? "";
    const rowNumber = i + 1;
    if (!week) throw new Error(`Row ${rowNumber} is missing its week. Add a date or week label.`);
    const key = week.toLowerCase();
    if (seenWeeks.has(key)) throw new Error(`Row ${rowNumber} duplicates week “${week}”. Remove the duplicate or correct its date.`);
    seenWeeks.add(key);
    const order = weekOrder(week);
    if (order === null) throw new Error(`Row ${rowNumber} has an unrecognized week “${week}”. Use YYYY-MM-DD, MM/DD/YYYY, Month DD [YYYY], or “Week N”.`);
    if (weekKind !== null && weekKind !== order.kind) throw new Error(`Row ${rowNumber} mixes week numbers and calendar dates. Use one week format consistently.`);
    if (previousOrder !== null && order.value <= previousOrder) throw new Error(`Row ${rowNumber} is out of order. Sort the weeks from oldest to newest with no repeated dates.`);
    weekKind = order.kind;
    previousOrder = order.value;
    const amountValues = AMOUNTS.map((column) => {
      const raw = values[indexes[column]]?.trim() ?? "";
      if (!raw) throw new Error(`Row ${rowNumber}, ${column}: enter a number. Use 0 when there was no activity.`);
      const number = Number(raw.replace(/^\$/, "").replaceAll(",", ""));
      if (!Number.isFinite(number)) throw new Error(`Row ${rowNumber}, ${column}: “${raw}” is not a valid number.`);
      if (number < 0) throw new Error(`Row ${rowNumber}, ${column}: negative amounts are not supported. Check the value and use a positive amount.`);
      return number;
    });
    rows.push({ week, sales_walkin: amountValues[0], invoices_collected: amountValues[1], supplies: amountValues[2], payroll: amountValues[3], rent: amountValues[4], other: amountValues[5] });
    if (indexes[STARTING_BALANCE] !== undefined && values[indexes[STARTING_BALANCE]]?.trim()) {
      const raw = values[indexes[STARTING_BALANCE]].trim();
      const balance = Number(raw.replace(/^\$/, "").replaceAll(",", ""));
      if (!Number.isFinite(balance) || balance < 0) throw new Error(`Row ${rowNumber}, ${STARTING_BALANCE}: enter a valid non-negative balance.`);
      balances.push(balance);
    }
  }
  if (rows.length === 0) throw new Error("No data rows found. Add at least one complete week.");
  if (balances.some((balance) => balance !== balances[0])) throw new Error(`The ${STARTING_BALANCE} value must be the same on every row where it is supplied.`);
  return { rows, startingCashBalance: balances[0] ?? null };
}
