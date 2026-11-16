# How CashSense uses AI

Rule: **AI understands and writes; code does the math.**

## The engine (no AI)

`src/lib/cash/` is pure TypeScript with integer cents.

- `engine.ts`: week-by-week balance from scheduled items, red/yellow/green status, and the plain-English warning.
- `scenario.ts`: the only shape the AI may produce (`shift`, `add`, `scale`, `remove`), a strict validator, and code-written descriptions.
- `rescue.ts`: the Rescue Plan search. It tries every allowed move on the real items (reschedule, split, pay early for a discount, defer for a fee), in combinations of up to 3. It keeps minimal plans that stay above the cushion every week and ranks them: moves you control, then free asks, then moves that cost money. Each plan shows its cost as a yearly rate, is stress-tested against the biggest payer arriving a week late, and never moves payroll.

Hand-checked numbers for the demo café (opening $2,000):

| Week | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Ending balance | 1,700 | 2,000 | 2,200 | 2,500 | **−1,300** | 5,000 | 7,700 | 8,000 |

Money in over 8 weeks: $40,500. Money out: $34,500. Profit: +$6,000.

## The two AI jobs

1. **`/api/ask`**: translates a question into a scenario. Claude returns JSON constrained by a schema. The server validates it, the browser validates it again, and only then does the engine run it. Anything invalid is shown as "Not run".
2. **`/api/drafts`**: writes the messages for a plan. The server re-runs the search itself, so it never trusts plan numbers sent from the browser. Every number in Claude's draft, whether digits or words, must come from the plan. Interest, penalty, deadline and legal wording are blocked. If a draft fails, the checked template is used and the UI says why.

## Modes

| `CASHSENSE_AI_MODE` | What happens |
|---|---|
| unset / `rules` | Built-in rules translate questions; templates write messages. No network calls. |
| `live` + `ANTHROPIC_API_KEY` | Claude does both jobs (`ANTHROPIC_MODEL`, default `claude-opus-5-5`). Falls back to rules on any error. |

Production builds always stay in rules mode. Live Claude calls remain disabled until shared rate limiting and hard spend controls are in place.

## Checks

```sh
npm test        # engine, AI handlers (with stubbed model), CSV, backend proxy
npm run lint
npm run typecheck
npm run build
```
