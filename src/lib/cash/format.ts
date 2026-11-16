import type { Cents } from "./types.ts";

const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$1,300" for whole dollars, "$1,300.50" otherwise. Negative values use a true minus sign. */
export function dollars(cents: Cents): string {
  const abs = Math.abs(cents);
  const text = abs % 100 === 0 ? whole.format(abs / 100) : exact.format(abs / 100);
  return cents < 0 ? `−${text}` : text;
}

/** Signed change: "+$300" / "−$1,300". */
export function signedDollars(cents: Cents): string {
  return cents > 0 ? `+${dollars(cents)}` : dollars(cents);
}

export function weekDate(startDate: string, week: number): Date {
  const [y, m, d] = startDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + (week - 1) * 7));
}

export function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
