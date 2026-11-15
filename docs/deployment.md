# CashSense deployment on Vercel

CashSense is a Next.js 15 App Router app. It can run on Vercel in demo mode without the Python forecasting service or an Anthropic account. The dashboard forecast and What if simulator run locally in the browser; the provisional Python adapter makes no network requests.

## Import the repository

1. In Vercel, choose **Add New → Project**, connect the GitHub account, and import `jagejagejage/veritas-ai-hackathon`.
2. Set **Root Directory** to `.` (the repository root). CashSense is not in a subdirectory.
3. Confirm **Framework Preset: Next.js**. Leave build and output settings at their defaults. The build command is `npm run build`; the install command can remain Vercel's detected npm install. Do not add a `vercel.json` for standard Next.js behavior.
4. Select Node.js **22.x** in Project Settings → General → Node.js Version. The lockfile pins the dependency graph; the project uses Next.js 15 and Node's built-in type stripping only for local test scripts.
5. Set the production branch to `main`. Add `dev/jage` and `dev/liam` as preview branches (or leave previews enabled for all branches). Do not make `dev/jage` the production branch.

## Environment variables

Initially configure this in Vercel's **Production**, **Preview**, and **Development** environments:

| Name | Initial value | Required? | Notes |
| --- | --- | --- | --- |
| `CASHSENSE_AI_MODE` | `mock` | Recommended | Mock is also the server fallback when this variable is absent. Keep it set explicitly in Vercel. |
| `ANTHROPIC_API_KEY` | unset | No in mock mode | Secret, server-side only. Never name it `NEXT_PUBLIC_...`. |
| `ANTHROPIC_MODEL` | unset | No in mock mode | Server-side model identifier. Required only when switching to live mode. |

Mock mode does not construct an Anthropic client, does not require either Anthropic variable, and returns a locally generated example response. No paid API calls are needed to build or preview the demo. Changing environment variables requires a new deployment to take effect.

### Enabling live Anthropic later

Only after choosing a model and agreeing to send user-provided financial data to Anthropic:

1. Add `ANTHROPIC_API_KEY` through Vercel's encrypted Environment Variables UI. Do not paste it into source, a commit, a build argument, or a `NEXT_PUBLIC_` variable.
2. Set `ANTHROPIC_MODEL` to the approved model ID.
3. Keep `CASHSENSE_AI_MODE=mock` while adding and checking the secret/model configuration. Then switch `CASHSENSE_AI_MODE=live` only in a controlled preview first.
4. Exercise successful responses, provider errors, and configured spend limits in Anthropic. Confirm the data disclosure and retention policy before making live mode available to users.
5. Promote live configuration only after review. To return to mock, set the mode back to `mock` and redeploy; remove the secret if it is no longer needed.

The chat endpoint caps message count, message length, context shape, output tokens, and request bytes. The existing in-memory limiter (12 requests/minute per observed address) is instance-local and is not an effective global limit across serverless instances. Do not treat it as a cost-control or abuse-prevention boundary for a public live deployment. Add a shared rate-limit store or edge/platform rate limiting before enabling live mode publicly. Also set provider account limits and monitor spend.

## Preview workflow

When changes are pushed to a non-production branch, Vercel Git integration creates a Preview deployment. Open its URL from the Vercel project or pull request and check the dashboard, CSV import, AI demo, `/ai`, and browser console. Preview environment variables are separate from production; leave AI in mock mode for hackathon previews. Merge to `main` by the team's normal pull request process to trigger the production deployment. This document does not authorize or perform a deployment.

## Test a deployment

For a preview, verify:

- `/` and `/ai` load and render the demo without backend configuration.
- CSV import accepts a valid sample and reports malformed, oversized, or overlong input clearly. Imports are held in browser memory for this prototype; avoid real sensitive financial data in public previews.
- Chat returns a clearly labeled mock response, and the browser network panel shows only the CashSense same-origin chat request (no Anthropic key or direct browser-to-Anthropic request).
- The chat route rejects invalid input and returns useful errors for unsupported scenarios.
- Check the response headers for `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Review Vercel function logs for errors. Current API errors are deliberately generic and do not log prompt or financial content.

## Python forecasting backend (future work)

The backend is not integrated. Do not configure a guessed endpoint. `docs/backend-integration.md`, `src/lib/types.ts`, and `src/lib/backend-adapter.ts` describe a provisional payload only; Liam must supply the real OpenAPI/schema, endpoints, auth, units, and error contract first.

After that contract is confirmed:

1. Add a server-only variable such as `CASHSENSE_BACKEND_URL` to Vercel. Never expose credentials or private service URLs through `NEXT_PUBLIC_` variables. Keep a separate URL per environment.
2. Prefer a same-origin Next.js server route that calls the Python service server-to-server. Validate the URL, request and response schemas, and timeouts; do not forward arbitrary client URLs. Use the authentication scheme Liam specifies and store its credential as a server-only Vercel secret. Do not assume a bearer token or invent an endpoint.
3. If the browser must call the API directly, Liam's service must allow the exact Vercel preview and production origins, handle preflight for the required methods/headers, and never use wildcard origins with credentials. Prefer server-to-server calls so CORS is not the security boundary.
4. Define timeout, retry, rate-limit, and provider/backend error mapping from the actual contract. Keep mock/local forecasting as a graceful fallback and label backend-derived values and uncertainty accurately.
5. Avoid logging request bodies, business figures, credentials, or user prompts. Test unavailable service, timeout, invalid response, authentication failure, and CORS behavior before rollout.

## Rollback

In Vercel, open **Deployments**, select the last known-good Production deployment, and use **Promote to Production** (or the dashboard's rollback action). Confirm the production domain serves the expected version. A Git rollback through a reviewed revert commit is also possible and creates a new deployment. Roll back environment configuration separately if a newly added variable caused the issue, then redeploy. No database migrations or persistent user data are currently part of CashSense.

## Known readiness limits

- There is no authentication or persistence; imported CSV and current dashboard state live in browser memory.
- The serverless in-memory limiter is best-effort only and does not coordinate across instances.
- The Python backend is not present or called.
- Dependency advisory status depends on a successful current `npm audit`; see [`security-audit.md`](./security-audit.md). A failed/offline audit is not a clean bill of health.
- This review does not certify the application as production-secure. Do not upload real sensitive financial data until access control, shared rate limiting, privacy/retention, and operational monitoring have been reviewed.
