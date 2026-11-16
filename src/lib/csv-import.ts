import type { WeeklyCashFlow } from "@/lib/types";

const REQUIRED = ["week", "sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"] as const;
const AMOUNTS = REQUIRED.slice(1);
const STARTING_BALANCE = "starting_cash_balance";
export const MAX_CSV_BYTES = 1_048_576;
export const MAX_CSV_DATA_ROWS = 520;

export interface CsvImportResult {
  rows: WeeklyCashFlow[];
  /** null means no starting balance was supplied; callers must not infer one. */
  startingCashBalance: number | null;
}

export const IMPORT_FIELDS = ["week", "sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"] as const;
export type ImportField = typeof IMPORT_FIELDS[number] | "starting_cash_balance" | "ignore";
export interface CsvMappingColumn { header: string; index: number; target: ImportField | null; sample: string; }

function normalizeHeader(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
const FIELD_ALIASES: Record<Exclude<ImportField, "ignore">, string[]> = {
  week: ["week", "week starting", "week start", "week ending", "week ending date", "date", "period", "period ending"],
  sales_walkin: ["sales", "sale", "walk in sales", "walk in", "walkin sales", "counter sales", "cash sales", "retail sales", "card sales", "pos sales"],
  invoices_collected: ["invoices collected", "invoice collected", "invoice payments", "accounts receivable collections", "ar collections", "customer payments", "payments received on invoices"],
  supplies: ["supplies", "supply", "inventory purchases", "materials", "stock purchases", "cost of goods", "cogs"],
  payroll: ["payroll", "wages", "employee wages", "staff wages", "salary", "salaries", "labor", "labour"],
  rent: ["rent", "lease", "office rent", "property rent"],
  other: ["other", "advertising", "marketing", "utilities", "electricity", "insurance", "bank fees", "software", "subscriptions", "travel", "repairs", "maintenance", "taxes", "shipping", "legal", "accounting"],
  starting_cash_balance: ["starting cash balance", "starting balance", "opening cash", "opening balance", "cash balance"],
};

export function guessImportField(header: string): ImportField | null {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [Exclude<ImportField, "ignore">, string[]][]) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return field;
  }
  if (/\b(other|misc|miscellaneous)\b/.test(normalized)) return "other";
  if (/\b(invoice|invoices|receivable|receivables|collection|collections|collected)\b/.test(normalized)) return "invoices_collected";
  if (/\b(walk|walkin|counter|cash|card|retail|pos)\b/.test(normalized) && /\b(sales|sale|revenue|income)\b/.test(normalized)) return "sales_walkin";
  if (/\b(payroll|wage|wages|salary|salaries|labor|labour)\b/.test(normalized)) return "payroll";
  if (/\b(suppl|inventory|material|materials|stock|cogs)\b/.test(normalized)) return "supplies";
  if (/\b(rent|lease)\b/.test(normalized)) return "rent";
  if (/\b(expense|expenses|spend|spending|cost|costs|purchase|purchases|advertising|marketing|utilities|insurance|travel|repair|maintenance|tax|fee|fees|software|subscription|shipping|legal|accounting)\b/.test(normalized)) return "other";
  return null;
}

export function inspectWideCsv(text: string): { columns: CsvMappingColumn[]; weeks: string[][]; mode: "wide" | "transactions" | "unsupported" } {
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) throw new Error("CSV files must be 1 MB or smaller.");
  const table = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) throw new Error("Add a header row and at least one week of data.");
  if (table.length - 1 > MAX_CSV_DATA_ROWS) throw new Error(`CSV files can contain at most ${MAX_CSV_DATA_ROWS} weeks.`);
  const headers = table[0].map((h) => h.trim());
  if (headers.some((h) => !h)) throw new Error("Every CSV column needs a header.");
  const normalized = headers.map(normalizeHeader);
  if (new Set(normalized).size !== normalized.length) throw new Error("Duplicate column headers found. Rename duplicates so each column can be mapped separately.");
  const hasWeek = normalized.some((h) => FIELD_ALIASES.week.some((a) => normalizeHeader(a) === h));
  const hasAmount = normalized.some((h) => ["amount", "value", "total", "cash amount"].includes(h));
  const hasDescription = normalized.some((h) => ["description", "category", "type", "memo", "details", "transaction", "name"].includes(h));
  const mode = hasAmount && hasDescription ? "transactions" : hasWeek ? "wide" : "unsupported";
  const data = table.slice(1);
  if (data.some((row) => row.length !== headers.length)) throw new Error("A CSV row has a different number of columns than the header. Check for missing or extra commas.");
  return { columns: headers.map((header, index) => ({ header, index, target: guessImportField(header), sample: data.find((row) => row[index]?.trim())?.[index] ?? "—" })), weeks: data, mode };
}

export function buildMappedWeeklyRows(columns: CsvMappingColumn[], weeks: string[][]): WeeklyCashFlow[] {
  if (columns.some((column) => column.target === null)) throw new Error("Choose a category or Leave out for every column.");
  const weekColumns = columns.filter((column) => column.target === "week");
  if (weekColumns.length !== 1) throw new Error("Map exactly one column to Week.");
  const targets = IMPORT_FIELDS.slice(1);
  if (!columns.some((column) => targets.includes(column.target as typeof targets[number]))) throw new Error("Map at least one amount column before importing.");
  const weekColumn = weekColumns[0];
  const seen = new Set<string>();
  const normalized = weeks.map((values, index) => {
    const week = values[weekColumn.index]?.trim() ?? "";
    if (!week) throw new Error(`Row ${index + 2} is missing its week.`);
    if (seen.has(week.toLowerCase())) throw new Error(`Row ${index + 2} duplicates week “${week}”.`);
    seen.add(week.toLowerCase());
    const row: WeeklyCashFlow = { week, sales_walkin: 0, invoices_collected: 0, supplies: 0, payroll: 0, rent: 0, other: 0 };
    for (const column of columns) {
      if (!targets.includes(column.target as typeof targets[number])) continue;
      const raw = values[column.index]?.trim() ?? "";
      if (!raw) continue;
      const negative = /^\(.*\)$/.test(raw);
      const amount = Number(raw.replace(/[,$£€\s]/g, "").replace(/^\((.*)\)$/, "$1"));
      if (!Number.isFinite(amount)) throw new Error(`Row ${index + 2}, ${column.header}: “${raw}” is not a valid number.`);
      row[column.target as typeof targets[number]] += negative ? -amount : amount;
    }
    return row;
  });
  const escapeCsv = (value: string | number) => {
    const cell = String(value);
    return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  };
  return parseFinancialCsv(["week", ...targets].join(",") + "\n" + normalized.map((row) => [row.week, ...targets.map((field) => row[field])].map(escapeCsv).join(",")).join("\n"), { allowNegative: true }).rows;
}

export function getMappedStartingCashBalance(columns: CsvMappingColumn[], weeks: string[][]): number | null {
  const column = columns.find((item) => item.target === "starting_cash_balance");
  if (!column) return null;
  const balances = weeks.map((row, index) => {
    const raw = (row[column.index] ?? "").trim();
    if (!raw) return null;
    const value = Number(raw.replace(/^\$/, "").replaceAll(",", ""));
    if (!Number.isFinite(value) || value < 0) throw new Error(`Row ${index + 2}, starting cash balance: enter a valid non-negative balance.`);
    return value;
  }).filter((value): value is number => value !== null);
  if (balances.some((value) => value !== balances[0])) throw new Error("The starting cash balance must be the same on every row where it is supplied.");
  return balances[0] ?? null;
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
  const week = value.match(/^(?:week\s+)?(\d{1,3})$/i);
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

export function parseFinancialCsv(text: string, options: { allowNegative?: boolean } = {}): CsvImportResult {
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) throw new Error("CSV files must be 1 MB or smaller.");
  const table = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) throw new Error("Add a header row and at least one week of data.");
  if (table.length - 1 > MAX_CSV_DATA_ROWS) throw new Error(`CSV files can contain at most ${MAX_CSV_DATA_ROWS} weeks.`);
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
    if (values.length !== headers.length) throw new Error(`Row ${rowNumber} has ${values.length} columns; the header has ${headers.length}. Check for missing or extra commas.`);
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
      if (number < 0 && !options.allowNegative) throw new Error(`Row ${rowNumber}, ${column}: negative amounts are not supported. Check the value and use a positive amount.`);
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
