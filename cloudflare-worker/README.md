# Northstar hosted AI backend

This Worker adds a hosted open-model endpoint for the existing GitHub Pages app. The Worker runs on Cloudflare; your PC does not need to stay on.

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
5. Deploy, then copy the Worker URL. The Northstar front end must be configured with that URL before the chat can call the backend.
6. Test while signed in to Northstar. Requests without a valid Firebase ID token are rejected.

## Free usage

Cloudflare Workers AI currently includes 10,000 Neurons per day on the Workers Free plan. Some models require a paid plan, so this project selects a model listed as available on Free at the time of implementation. Requests can stop working when the daily allowance is exhausted. Do not enable paid billing if your requirement is strictly $0.

## Privacy

The question and the context string provided by the browser are sent to Cloudflare for inference. Only send the minimum account/budget/goal summary needed for the question. Do not send passwords, payment-card details, or bank credentials. This Worker does not intentionally log question text or financial context.

## Current limitation

The Worker backend is prepared, but it is not live until you deploy it in your Cloudflare account and set the Firebase API key. The website also needs the resulting Worker URL wired into the Northstar Guide chat interface. No credentials are stored in this repository.
