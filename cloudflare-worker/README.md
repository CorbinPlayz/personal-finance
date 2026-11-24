# Northstar hosted AI backend

This folder contains an **optional** hosted open-model endpoint for Northstar. When deployed, the Worker runs on Cloudflare; your PC does not need to stay on. The Northstar app can call this Worker: pick **Northstar hosted AI** in Jarvis's connection settings (no API key; you must be signed in with Google). It was deployed to `https://northstar-finance-ai.camc-cf76.workers.dev/`.

The [major update overview](../MAJOR-UPDATE.md) explains what Jarvis, the shop-link and search modes and the Stocks charts do, what leaves your device, and what has and has not been tested. Passphrase protection is switched off in this version and does not protect information sent to an AI provider or this Worker.

## What is included

- Cloudflare Workers AI using `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (the earlier GLM model was slow and often returned empty answers with a real finance summary).
- Firebase ID-token verification before each request.
- Browser origin restriction to `https://corbinplayz.github.io`.
- Short request limits, no-store responses, and friendly free-quota errors.
- No API key or model credential in public website code.
- AI is advisory only and is instructed not to edit financial records.

## One-time setup

1. Sign in to Cloudflare and open Workers & Pages.
2. Create or open a Worker named `northstar-finance-ai`.
3. Deploy the files in this folder with Wrangler, or paste `src/index.js` into the Worker editor and configure the AI binding named `AI`.
4. In the Worker's settings, add the secret/environment variable `FIREBASE_API_KEY` with the Firebase Web API key from the existing Northstar Firebase configuration. This is used only to ask Firebase Authentication to validate the user's ID token; it is not an admin credential.
5. Deploy. The Northstar front end already calls the Worker at its `workers.dev` URL and sends the signed-in user's Firebase ID token. If you create a Worker with a different name or account, update the URL in `index.html`.
6. Test with a signed-in Northstar user: open Jarvis and press **Check connection**. Requests without a valid ID token are rejected.

## Free usage

At implementation time, Cloudflare listed a daily free Workers AI allowance and this model as available on the Free plan. Quotas, model availability, and pricing can change; check Cloudflare's current documentation and your account before deploying. Requests can stop working when an allowance is exhausted. Do not enable paid billing if your requirement is strictly $0.

## Privacy

The question and the context string provided by the browser are sent to Cloudflare for inference. Only send the minimum account/budget/goal summary needed for the question. Do not send passwords, payment-card details, or bank credentials. This Worker does not intentionally log question text or financial context.

## Modes

All modes need a valid Firebase ID token and the allowed browser origin.

- **Chat (default):** Jarvis questions, answered by Workers AI.
- **`price`:** reads a product price from a shop link (product data on the page; no AI; public https hosts only; redirects are checked). Failures say which step failed.
- **`search`:** a keyless web search, then reads the shop pages it finds (no AI). Failures say whether the search engine blocked the Worker, found no shops, or opened shops with no price.
- **`history`:** five years of daily closing prices for one ticker, from Stooq with Yahoo Finance as a backup, for the Stocks tab charts. Only the ticker is sent.

## Current limitations

Redeploy this folder after pulling an update, because new modes only exist once deployed. Live Stooq and Yahoo responses, live shop pages and the web search have not been tested from the build environment, so treat their results as unverified until you try them.
