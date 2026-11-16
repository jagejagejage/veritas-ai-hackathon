import { dollars } from "./format.ts";
import type { Action, Plan } from "./rescue.ts";
import type { Business } from "./types.ts";

export interface Draft {
  actionKey: string;
  to: string;
  subject: string;
  body: string;
}

/** Messages are only drafted for moves that need someone else's yes. */
export function draftableActions(plan: Plan): Action[] {
  return plan.actions.filter((action) => action.control === "ask" && action.kind !== "topUp");
}

export function templateDraft(business: Business, action: Action): Draft {
  const ref = action.reference ?? action.title.toLowerCase();
  const sign = `Thanks so much,\n${business.owner}\n${business.name}`;
  if (action.kind === "payEarly") {
    const discount = action.costCents;
    return {
      actionKey: action.key, to: action.counterparty,
      subject: `Small favour on ${ref}`,
      body: `Hi ${action.counterparty} team,\n\nThank you again for having us cater. I have a quick request about ${ref} (${dollars(action.amountCents)}), currently due in week ${action.fromWeek}.\n\nIf you're able to pay it in week ${action.toWeek} instead, I'm happy to take ${dollars(discount)} off the total, so you'd pay ${dollars(action.amountCents - discount)}. No pressure at all if the timing doesn't work on your side.\n\n${sign}`,
    };
  }
  if (action.kind === "defer") {
    const fee = action.costCents ? ` I understand there may be a ${dollars(action.costCents)} late fee, and I'm fine with that.` : "";
    return {
      actionKey: action.key, to: action.counterparty,
      subject: `Request to move ${ref} by a week`,
      body: `Hi ${action.counterparty},\n\nI'd like to ask whether ${ref} (${dollars(action.amountCents)}) could be paid in week ${action.toWeek} rather than week ${action.fromWeek}. A large customer payment lands that week, so I can pay in full then.${fee}\n\n${sign}`,
    };
  }
  return {
    actionKey: action.key, to: action.counterparty,
    subject: `Splitting the payment for ${ref}`,
    body: `Hi ${action.counterparty},\n\nWould it be all right to pay ${ref} in two parts: ${dollars(action.amountCents)} in week ${action.fromWeek} and ${dollars(action.amountCents)} in week ${action.toWeek}? Everything would be paid in full by week ${action.toWeek}.\n\n${sign}`,
  };
}

/** Every number the message may mention: amounts, the discount and percentages, the weeks. */
export function allowedNumbers(business: Business, action: Action): Set<string> {
  const values = new Set<string>();
  const addCents = (cents: number) => {
    values.add(String(cents / 100));
    values.add((cents / 100).toFixed(2));
  };
  addCents(action.amountCents);
  addCents(action.costCents);
  addCents(action.amountCents - action.costCents);
  if (action.kind === "split") addCents(action.amountCents * 2);
  for (const week of [action.fromWeek, action.toWeek, action.toWeek - action.fromWeek, Math.abs(action.toWeek - action.fromWeek)]) values.add(String(week));
  if (action.kind === "payEarly" && action.amountCents) values.add(String(Math.round(action.costCents / action.amountCents * 1000) / 10));
  for (const match of `${action.reference ?? ""} ${business.name}`.matchAll(/\d+(?:\.\d+)?/g)) values.add(match[0]);
  return values;
}

const SMALL_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const BIG_WORDS = /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|percent)\b/i;

/**
 * Rejects a drafted message that contains any number not present in the plan.
 * Catches digits ("7500", "$7,500.00", "2%") and spelled-out numbers ("two weeks", "seven thousand").
 */
export function checkDraft(text: string, allowed: Set<string>): { ok: boolean; offending: string[] } {
  const offending: string[] = [];
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const normalized = match[0].replaceAll(",", "");
    const asNumber = String(Number(normalized));
    if (!allowed.has(normalized) && !allowed.has(asNumber) && !allowed.has(Number(normalized).toFixed(2))) offending.push(match[0]);
  }
  const words = text.replace(/\b(no one|someone|anyone|everyone|one of|any one|this one|that one|one more|one-time|one another)\b/gi, "");
  for (const match of words.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi)) {
    if (!allowed.has(String(SMALL_WORDS[match[1].toLowerCase()]))) offending.push(match[1]);
  }
  const big = words.match(BIG_WORDS);
  if (big) offending.push(big[0]);
  if (/\b(interest|penalt|legal|lawyer|court|collections?|deadline|overdue|final notice)\b/i.test(text)) offending.push("unsupported term");
  return { ok: offending.length === 0, offending };
}
