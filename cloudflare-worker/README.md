# Northstar hosted AI backend

This folder contains an **optional** hosted open-model endpoint for Northstar. When deployed, the Worker runs on Cloudflare; your PC does not need to stay on. The GitHub Pages app is **not currently wired to call this Worker**; deploying it alone does not connect it to the site.

The [major update overview](../MAJOR-UPDATE.md) explains the completed purchase tiles and optional passphrase protection. Protection is off by default and applies to the active workspace; it does not automatically protect information sent to an AI provider or older copies. Review its privacy and testing limits before relying on it.

## What is included

- Cloudflare Workers AI using `@cf/zai-org/glm-4.7-flash`.
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
5. Deploy, then copy the Worker URL. The Northstar front end currently has no integration for this Worker; it would need code changes to call the URL and send the required Firebase ID token.
6. Test the deployed endpoint with a signed-in Firebase user after integrating it. The Worker is intended to reject requests without a valid Firebase ID token; no fresh live endpoint test is claimed here.

## Free usage

At implementation time, Cloudflare listed a daily free Workers AI allowance and this model as available on the Free plan. Quotas, model availability, and pricing can change; check Cloudflare's current documentation and your account before deploying. Requests can stop working when an allowance is exhausted. Do not enable paid billing if your requirement is strictly $0.

## Privacy

The question and the context string provided by the browser are sent to Cloudflare for inference. Only send the minimum account/budget/goal summary needed for the question. Do not send passwords, payment-card details, or bank credentials. This Worker does not intentionally log question text or financial context.

## Current limitation

The Worker backend is prepared, but it is not live until you deploy it in your Cloudflare account and set the Firebase API key. The website also needs the resulting Worker URL wired into the Northstar Guide chat interface. No credentials are stored in this repository.
