# CashSense AI setup

CashSense AI runs in mock mode unless the server explicitly sets `CASHSENSE_AI_MODE=live`.

## Mock mode

Set `CASHSENSE_AI_MODE=mock` (also the default when the variable is absent). Replies are generated locally with a short simulated delay. The route does not create an Anthropic client or send an external request. No key is required. The chat marks these replies as examples.

## Live Claude mode

Add these server-only environment variables to your local `.env.local` or hosting environment:

```dotenv
CASHSENSE_AI_MODE=live
ANTHROPIC_API_KEY=your-server-side-key
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

The configured model ID is passed to the Anthropic SDK on the server. Changing `ANTHROPIC_MODEL` does not change the UI or add a model selector. Live mode fails closed with a configuration error if either Anthropic value is missing. Never prefix credentials with `NEXT_PUBLIC_` or commit `.env.local`.

The current implementation caps the request to 480 output tokens, disables SDK retries, applies a 15-second SDK timeout and an in-memory limit of 12 messages per minute per client address. Messages are sent only after the user submits a question. Conversation history and dashboard context stay in provider memory for client-side route navigation; they are not written to local storage or a database.

Supported natural-language simulations use the CashSense forecast helper and current dashboard history. Revenue changes are limited to ±30%, one-time expense increases to $10,000, and payment delays to 21 days. If a question cannot map safely to those controls, the assistant explains the limitation.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:ai
npm run build
```
