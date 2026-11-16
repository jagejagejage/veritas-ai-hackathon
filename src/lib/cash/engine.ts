import { dollars, list, shortDate, weekDate } from "./format.ts";
import type { Business, CashItem, Projection, Status, WeekResult } from "./types.ts";

export function statusFor(endCents: number, floorCents: number): Status {
  if (endCents < 0) return "red";
  if (endCents < floorCents) return "yellow";
  return "green";
}

const rank: Record<Status, number> = { green: 0, yellow: 1, red: 2 };

/** Pure, deterministic week-by-week cash balance. No averages, no guessing: only scheduled items. */
export function project(business: Business, items: CashItem[] = business.items): Projection {
  let balance = business.openingCents;
  const weeks: WeekResult[] = [];
  for (let week = 1; week <= business.horizon; week += 1) {
    const due = items.filter((item) => item.week === week);
    const inCents = due.filter((item) => item.direction === "in").reduce((sum, item) => sum + item.cents, 0);
    const outCents = due.filter((item) => item.direction === "out").reduce((sum, item) => sum + item.cents, 0);
    balance += inCents - outCents;
    weeks.push({
      week,
      label: shortDate(weekDate(business.startDate, week)),
      inCents,
      outCents,
      netCents: inCents - outCents,
      endCents: balance,
      status: statusFor(balance, business.floorCents),
      items: due,
    });
  }
  const lowest = weeks.reduce((low, week) => (week.endCents < low.endCents ? week : low), weeks[0]);
  const status = weeks.reduce<Status>((worst, week) => (rank[week.status] > rank[worst] ? week.status : worst), "green");
  return { weeks, lowest, status, beyondHorizon: items.filter((item) => item.week > business.horizon) };
}

export interface Warning {
  status: Status;
  headline: string;
  detail: string;
  week: number | null;
  weeksAhead: number | null;
}

/**
 * Plain-English warning. Always names the week and the dollar amount, then says which
 * payments cause it and which incoming money arrives too late to help.
 */
export function warningFor(business: Business, projection: Projection): Warning {
  const firstRed = projection.weeks.find((week) => week.status === "red");
  const firstYellow = projection.weeks.find((week) => week.status === "yellow");
  const target = firstRed ?? firstYellow;
  if (!target) {
    return {
      status: "green",
      headline: `You stay above your ${dollars(business.floorCents)} cushion for all ${business.horizon} weeks.`,
      detail: `Your lowest point is ${dollars(projection.lowest.endCents)} in week ${projection.lowest.week}.`,
      week: null,
      weeksAhead: null,
    };
  }
  const bigOut = target.items
    .filter((item) => item.direction === "out" && item.category !== "supplies" && item.category !== "payroll")
    .sort((a, b) => b.cents - a.cents);
  const causes = (bigOut.length ? bigOut : target.items.filter((item) => item.direction === "out").sort((a, b) => b.cents - a.cents)).slice(0, 2);
  const rescue = projection.weeks
    .filter((week) => week.week > target.week)
    .flatMap((week) => week.items.filter((item) => item.direction === "in" && item.category === "invoice"))
    .sort((a, b) => b.cents - a.cents || a.week - b.week)[0];
  const causeText = list(causes.map((item) => `${item.label.toLowerCase()} (${dollars(item.cents)})`));
  const verb = causes.length > 1 ? "land" : "lands";
  const rescueText = rescue ? ` before ${dollars(rescue.cents)} from ${rescue.counterparty} arrives in week ${rescue.week}` : "";
  const headline = firstRed
    ? `You'll be ${dollars(-target.endCents)} short in week ${target.week}.`
    : `You'll dip to ${dollars(target.endCents)} in week ${target.week}, under your ${dollars(business.floorCents)} cushion.`;
  return {
    status: firstRed ? "red" : "yellow",
    headline,
    detail: `${capitalize(causeText)} ${verb}${rescueText}.`,
    week: target.week,
    weeksAhead: target.week - 1,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function totals(projection: Projection) {
  const inCents = projection.weeks.reduce((sum, week) => sum + week.inCents, 0);
  const outCents = projection.weeks.reduce((sum, week) => sum + week.outCents, 0);
  return { inCents, outCents, netCents: inCents - outCents };
}
