"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMappedWeeklyRows, getMappedStartingCashBalance, IMPORT_FIELDS, inspectWideCsv, type CsvMappingColumn, type ImportField } from "@/lib/csv-import";
import type { WeeklyCashFlow } from "@/lib/types";

const labels: Record<ImportField, string> = { week: "Week", sales_walkin: "Walk-in sales", invoices_collected: "Invoices collected", supplies: "Supplies", payroll: "Payroll", rent: "Rent", other: "Other", starting_cash_balance: "Starting cash balance", ignore: "Leave out" };
const amounts = IMPORT_FIELDS.slice(1);
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const numericValue = (raw: string) => {
  const value = raw.trim();
  if (!value) return 0;
  const negative = /^\(.*\)$/.test(value);
  const parsed = Number(value.replace(/[,$£€\s]/g, "").replace(/^\((.*)\)$/, "$1"));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
};

export function CsvImportWizard({ file, onCancel, onImport }: { file: File; onCancel: () => void; onImport: (rows: WeeklyCashFlow[], startingCashBalance: number | null) => void }) {
  const [columns, setColumns] = useState<CsvMappingColumn[]>([]);
  const [sourceRows, setSourceRows] = useState<string[][]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    file.text().then((text) => {
      try {
        const parsed = inspectWideCsv(text);
        if (!active) return;
        if (parsed.mode === "transactions") throw new Error("This looks like a transaction list. Transaction rows are not supported yet; use a weekly spreadsheet with one category per column.");
        if (parsed.mode !== "wide") throw new Error("We couldn’t identify this as a weekly spreadsheet. Include a Week or Date column.");
        setColumns(parsed.columns);
        setSourceRows(parsed.weeks);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not read this CSV.");
      }
    }).catch(() => { if (active) setError("Could not open this file. Choose a valid CSV."); });
    return () => { active = false; };
  }, [file]);

  const preview = useMemo(() => {
    const totals = Object.fromEntries(amounts.map((field) => [field, 0])) as Record<typeof amounts[number], number>;
    const omitted = columns.filter((column) => column.target === "ignore").reduce((sum, column) => sum + sourceRows.reduce((inner, row) => inner + numericValue(row[column.index] ?? ""), 0), 0);
    sourceRows.forEach((row) => columns.forEach((column) => {
      if (!amounts.includes(column.target as typeof amounts[number])) return;
      totals[column.target as typeof amounts[number]] += numericValue(row[column.index] ?? "");
    }));
    return { totals, omitted };
  }, [columns, sourceRows]);

  function importRows() {
    setError("");
    try { onImport(buildMappedWeeklyRows(columns, sourceRows), getMappedStartingCashBalance(columns, sourceRows)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Check the mapped data and try again."); }
  }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#142c32]/45 p-3 sm:p-8" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="csv-title" className="mx-auto my-4 max-w-5xl rounded-2xl border border-[#e5ece9] bg-white p-5 shadow-2xl sm:my-8 sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><h2 id="csv-title" className="text-xl font-semibold tracking-tight text-[#17313a]">Review your CSV columns</h2><p className="mt-1 text-sm text-[#788b90]">{file.name} · {sourceRows.length} rows · amounts keep the signs in your file.</p></div><button onClick={onCancel} className="focus-ring rounded-md px-2 py-1 text-sm text-[#60767c]">Cancel</button></div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-[#f0d5c8] bg-[#fff8f4] px-3 py-2.5 text-sm text-[#9d5e38]">{error}</p>}
      {!error && columns.length > 0 && <>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Rows", String(sourceRows.length)], ["Unmapped", String(columns.filter((column) => column.target === null).length)], ["Net mapped", money(amounts.reduce((sum, field) => sum + preview.totals[field], 0))], ["Left out", money(preview.omitted)]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f5f8f7] px-3 py-2"><p className="text-[11px] text-[#839398]">{label}</p><p className="text-sm font-semibold text-[#315c57]">{value}</p></div>)}</div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[#e6ecea]"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-[#f8faf9] text-[#829297]"><tr><th className="px-3 py-2">CSV column</th><th className="px-3 py-2">Example</th><th className="px-3 py-2">Map to</th><th className="px-3 py-2">Total</th></tr></thead><tbody>{columns.map((column) => <tr key={column.index} className="border-t border-[#edf1ef]"><td className="px-3 py-2 font-medium text-[#405960]">{column.header}</td><td className="px-3 py-2 text-[#718387]">{column.sample}</td><td className="px-3 py-2"><select aria-label={`Map ${column.header}`} value={column.target ?? "unmapped"} onChange={(event) => setColumns((current) => current.map((item) => item.index === column.index ? { ...item, target: event.target.value === "unmapped" ? null : event.target.value as ImportField } : item))} className="focus-ring w-full rounded-md border border-[#dfe8e4] bg-white px-2 py-1.5"><option value="unmapped">Choose category…</option>{[...IMPORT_FIELDS, "starting_cash_balance" as const, "ignore" as const].map((field) => <option key={field} value={field}>{labels[field]}</option>)}</select></td><td className="px-3 py-2 tabular-nums text-[#526c75]">{column.target === "ignore" ? money(sourceRows.reduce((sum, row) => sum + numericValue(row[column.index] ?? ""), 0)) : column.target === "starting_cash_balance" ? money(numericValue(sourceRows.find((row) => row[column.index]?.trim())?.[column.index] ?? "")) : column.target && amounts.includes(column.target as typeof amounts[number]) ? money(preview.totals[column.target as typeof amounts[number]]) : "—"}</td></tr>)}</tbody></table></div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[#e6ecea]"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-[#f8faf9] text-[#829297]"><tr><th className="px-3 py-2">Week</th>{amounts.map((field) => <th key={field} className="px-3 py-2">{labels[field]}</th>)}</tr></thead><tbody>{(() => { try { return buildMappedWeeklyRows(columns, sourceRows).slice(0, 8).map((row) => <tr key={row.week} className="border-t border-[#edf1ef]"><td className="px-3 py-2">{row.week}</td>{amounts.map((field) => <td key={field} className="px-3 py-2 tabular-nums">{money(Number(row[field]))}</td>)}</tr>); } catch { return sourceRows.slice(0, 8).map((row, i) => <tr key={i} className="border-t border-[#edf1ef]"><td className="px-3 py-2">{columns.find((column) => column.target === "week") ? row[columns.find((column) => column.target === "week")!.index] : "Choose a Week column"}</td>{amounts.map((field) => <td key={field} className="px-3 py-2">{columns.filter((column) => column.target === field).map((column) => row[column.index]).join(" + ") || "—"}</td>)}</tr>); } })()}</tbody></table></div>
        <p className="mt-3 text-xs text-[#829297]">Showing up to 8 preview weeks. Columns mapped to the same category are combined. Leave out reports the values excluded from the import.</p>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="focus-ring rounded-lg border border-[#dfe8e4] px-4 py-2 text-sm font-medium text-[#526c75]">Cancel</button><button onClick={importRows} disabled={columns.some((column) => column.target === null) || columns.filter((column) => column.target === "week").length !== 1} className="focus-ring rounded-lg bg-[#176f65] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Import weekly data</button></div>
      </>}
    </section>
  </div>;
}
