/** All money is integer cents. Weeks are 1-based and run from 1 to `horizon`. */
export type Cents = number;
export type Direction = "in" | "out";
export type Category = "sales" | "invoice" | "payroll" | "rent" | "supplies" | "repair" | "other";

/** Ways an item may be moved by a Rescue Plan. Absent means the item is fixed. */
/** "you": the owner can do it alone. "ask": someone else has to agree. */
export type Control = "you" | "ask";
/** How much goodwill the move spends with the other party. */
export type Risk = "none" | "low" | "high";

export interface Levers {
  /** Inflow only: the payer may be asked to pay early for a flat discount (e.g. 1%). */
  payEarly?: { maxWeeks: number; discountPct: number; risk: Risk };
  /** Outflow only: the payment moves later for a flat fee (0 for free). */
  defer?: { maxWeeks: number; feeCents: Cents; control: Control; risk: Risk };
  /** Outflow only: pay half now and half a week later. */
  split?: { control: Control; risk: Risk };
}

export interface CashItem {
  id: string;
  label: string;
  counterparty: string;
  week: number;
  cents: Cents;
  direction: Direction;
  category: Category;
  /** Short sentence used in drafted messages, e.g. "invoice #1042 for the October catering". */
  reference?: string;
  /** True when the line pools many small payers (walk-in customers, several lunch clients). */
  pooled?: boolean;
  levers?: Levers;
}

export interface Business {
  name: string;
  owner: string;
  openingCents: Cents;
  floorCents: Cents;
  horizon: number;
  /** ISO date (yyyy-mm-dd) of the Monday that starts week 1. */
  startDate: string;
  items: CashItem[];
}

export type Status = "green" | "yellow" | "red";

export interface WeekResult {
  week: number;
  label: string;
  inCents: Cents;
  outCents: Cents;
  netCents: Cents;
  endCents: Cents;
  status: Status;
  items: CashItem[];
}

export interface Projection {
  weeks: WeekResult[];
  lowest: WeekResult;
  status: Status;
  /** Items pushed past the forecast horizon by a scenario. */
  beyondHorizon: CashItem[];
}
