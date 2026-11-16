# Northstar Personal Finance

Northstar is a static, mobile-friendly personal finance planner with an animated compass-themed welcome journey.

## Major update — purchases and optional protection

Recorded expenses now appear as completed purchase tiles, with explicitly linked plans shown once. This update also adds completed-purchase search, safer editing and sync, responsive refinements, and optional passphrase protection for the active device and cloud workspace. [Read the two-page major update](MAJOR-UPDATE.md) for what changed and how it affects your data.

**Protection is off by default.** Before enabling cloud protection, publish and test the updated Firestore rules separately. A lost passphrase can make encrypted data unrecoverable; older copies may remain readable. Live Firebase behavior and an independent security review are still unverified.

## Included features

- Overview, transactions, accounts, budgets, savings goals, and planned purchases.
- Read-only graphs across the finance pages, the saved Guide under Settings, and Settings: recorded income and spending, category mix, account activity, budget and goal progress, purchase funding and manually logged prices, a saved-profile picture, and workspace record counts. See the exact values in text or the expandable tables.
- A goal what-if graph compares up to two **explicitly entered** monthly contributions. It assumes no interest or fees, does not check account balances or move money, and does not save the scenario inputs.
- Goal and budget progress feedback, transaction and purchase animations, and an optional goal-completion chime. Graph entry animation is decorative and respects reduced-motion preferences.
- A floating glass navigation dock on desktop and mobile. On narrow screens, **More** contains Accounts, Budgets, and Settings. The top-left compass icon also opens Home; when Home is already open, it keeps your scroll position. The adjacent Northstar word is not a button.
- An optional, scrollable introduction. **Enter Northstar** opens a short garage-inspired reveal; you can replay it from Settings. Reduced-motion preferences skip the animation.
- **Stocks** replaces Guide on the dock with a customizable watchlist starting with 100 curated U.S.-listed stocks. An optional visitor-supplied Finnhub key supplies market prices. Your existing Guide profile, saved note, and local planner remain accessible under **Settings → Saved Guide profile**.
- Jarvis, a local assistant that can answer questions about your recorded finances and prepare reviewable drafts for common actions. Nothing is recorded until you save the form.
- Purchase priority ordering, links to search current shopping listings, and manual price-history logging.
- Recorded expenses appear as completed purchase tiles. Linked expense/plan pairs appear once; selecting an expense-only tile edits the original transaction. Income and transfers are excluded.
- A simple 30-day price trend estimate after at least three price checks on different dates. This estimate uses only prices you enter; it is not a live retailer feed or guaranteed prediction.
- JSON backup and restore, browser storage, optional Google sign-in and Firestore sync, and optional passphrase protection for the active device/cloud workspace.
- A paused cloud sync always shows an error code, a short reason and a time: in a notice under the header, in **Settings → Sync diagnostics**, and in a copyable details dialog. No email address or finance record is included in that text.

The intro remembers dismissal when browser storage is available. If saving that preference is blocked, you can still enter but the intro may return on reload. If storage cannot be read at all, the protected-workspace check fails closed rather than bypassing a possible vault; restore browser storage access before proceeding.

The saved Guide is a local rules-based helper, not an external generative AI service. Jarvis also works locally by default and offers an optional visitor-supplied cloud connection. **Save & test** sends the key and a finance summary to the selected provider, even if the cloud switch was previously off. Questions sent while cloud is on include a summary and recent conversation; the optional transaction setting adds up to eight recent entries, including dates, amounts, categories, and descriptions. Preview the payload before connecting if you wish.

Jarvis's key is stored separately in browser storage (tab session by default, optionally remembered on the device), not encrypted by workspace protection or included in finance backups. If storage cannot be updated or has conflicting copies, Connections warns that a key may remain; back up finance data before clearing site data. The separate Cloudflare Worker is not wired into the site. Never put private API keys in the repository or page source.

Northstar does not connect to bank accounts or verify your real balance. Figures depend on information you enter. Double-check your actual accounts before spending.

The six-month overview excludes transfers; the three-month account charts show each account separately and include valid transfers on the appropriate side. Neither is a reconstructed balance history. Transaction mix follows the active filters and counts transfers once. Monthly category and budget graphs omit invalid dates or amounts and report excluded entries, so imported malformed records can differ from older budget-card calculations. The purchase price timeline shows manually logged checks, equally spaced, not a live feed or forecast. The Guide graph uses its saved profile, not transaction totals; review its existing default buffer before saving. An imported profile missing a buffer is not graphed as though that default had been saved. Settings shows record counts, not money. Graphs never change your records, and financial estimates are not advice.

## Stock watchlist and optional market data

The watchlist starts with 100 curated U.S.-listed stocks (including some U.S.-listed foreign companies); it is not an index or a portfolio of owned shares. Search the list, add a U.S.-listed symbol, remove symbols, or explicitly reset to the starter list. The app validates the symbol's format, not whether it exists or is covered. The list can contain up to 200 symbols. An intentionally empty list stays empty. Tickers can change; the starter names are static and may need updating.

**Prices are unavailable until you connect your own Finnhub API key.** To get started, create a Finnhub account, copy its API key from the Finnhub dashboard, and enter it on the Stocks page. Finnhub's published free plan is currently for personal use, lists up to 50 streaming symbols and 60 API calls per minute, and has its own [pricing and terms](https://finnhub.io/pricing). Check provider and exchange terms before any commercial use or redistribution. We do not ship a shared key or redistribute prices. Provider plans, coverage, browser access, and limits can change.

When Stocks is open and visible, Northstar requests up to 50 trade-stream subscriptions at once and rotates the groups every minute. Thus, 100 tickers do **not** all stream simultaneously. Individual trade events may never arrive for a symbol, particularly when markets are closed. Snapshots are requested one at a time at least 1.5 seconds apart (up to 40 requests/minute per tab), then about every 15 minutes per ticker. Loading 100 snapshots takes about 2½ minutes or longer. A manual refresh queues snapshots but is limited to once a minute per tab. Another tab or application using the same key shares the provider quota; Finnhub permits only one stream connection per key. The app backs off after a 429/network failure and stops on rejected credentials. Leaving Stocks, hiding the tab, or locking/loading the workspace pauses requests; reopening resumes them. Coverage, provider throttling, browser CORS/network failures, and market closures may leave prices stale or unavailable.

Prices are shown in U.S. dollars regardless of your finance display currency, with a Finnhub source and provider timestamp in the device's local time. Only a recent trade for a currently subscribed symbol is labeled **Live trade**; older trades and snapshots are labeled separately. Trades may include extended-hours or special-condition transactions; they are not necessarily official closes or executable prices. Snapshot percentage change is compared with Finnhub's reported previous close, and is not mixed with newer stream trades. Zero/missing or invalid provider prices are not invented. Verify prices independently before making decisions. Northstar is not a broker and this is not investment advice.

Your customized **ticker list** is part of the active finance workspace and follows its existing local, cloud, backup, and optional passphrase-protection behavior. The initial list is a display default represented by `null` in saved workspaces; the 100 symbols are saved when you edit or reset the list, clear the workspace, or restore an older backup with no list. Explicitly saving the starters after a clear or restore prevents a later cloud retry from silently bringing back the previous list. **Prices and the Finnhub key are held only in the current tab's memory:** they are not saved in browser storage, the ledger, backups, or Firebase. Reloading, disconnecting, changing Google accounts, or restoring/clearing the workspace clears them; navigating away pauses the feed but retains the key. Requests go directly to Finnhub over HTTPS; the key is included in request/WebSocket URLs and can be visible to browser developer tools, extensions, or provider logs. Workspace encryption does not protect the key in memory. Use a trusted device and never commit a private key to the repository. **The provider integration has only been tested with mocked responses, not with a live Finnhub account or a real exchange feed.**

## Passphrase protection and backups

**Protection is off by default.** Existing browser and cloud data remains readable unless you explicitly enable it in Settings. Enabling protection currently requires a secure HTTPS page, a browser with Web Crypto and Web Locks, Google sign-in, and a successful cloud sync. It creates a protected device copy and replaces the current cloud document with ciphertext. The passphrase is not stored or deliberately sent to Firebase; PBKDF2-SHA-256 derives a non-extractable AES-256-GCM key, with a fresh random IV for each encryption. A new device needs the same Google account and passphrase to unlock the protected cloud copy.

- **There is no passphrase recovery.** Losing it can make the encrypted copy and encrypted backups unrecoverable. Keep a secure backup and record the passphrase somewhere safe.
- **Publish and test the updated `firestore.rules` before enabling cloud protection**, and close other Northstar tabs/devices first. The rules are intended to restrict each user to their own document and reject older clients that try to add plaintext to a protected document. Merely merging this repository does **not** publish Firebase rules. Their deployment and live Firebase behavior have not been verified in this change.
- Older browser workspaces, files downloaded before protection, other devices, and cloud-provider backups or historical versions may still contain plaintext. Setup offers an explicit option to remove *matching* old browser copies only after both new copies are verified; different copies are left alone. That option cannot erase backups or copies elsewhere.
- While unlocked, financial data is in browser memory and can be read by the app and scripts running on the page. Protection cannot defend against a compromised device, malicious site code, browser extensions, or data intentionally sent to an external service. It also cannot prevent someone from restoring an older valid encrypted copy. This implementation has not received an independent security audit.
- Protected-workspace exports are encrypted JSON backups. Unprotected exports are readable JSON, and the app warns before downloading them. Restoring an encrypted backup into an unprotected workspace creates a readable browser copy after confirmation.
- Changes are saved to the protected device first. Cloud writes use conditional Firestore transactions; errors and conflicts pause cloud sync instead of silently overwriting another copy. If setup is interrupted, the original plaintext copies are kept and cloud protection may need an explicit retry. On a different Google account, protected data is not uploaded. Protection cannot currently be enabled for a local-only workspace or removed through an automatic decrypt/disable button.

## Sync error codes, paused sync and phone sign-in

Northstar never saves over a cloud copy it has not verified, so a failed or conflicting save pauses cloud sync and keeps your changes on the device. When that happens, the header shows the reason and the code (for example `Cloud sync needs attention · northstar/conflict`), a notice appears under the header with **Details**, and Settings shows **Sync diagnostics** with the code, stage, reason, time, workspace mode, connection state and whether the cloud copy loaded. **Copy details** produces shareable text with no email address or finance records. The record stays on the device until a later sync succeeds, so a code is still readable after a reload or after the toast disappears.

- `northstar/conflict` — another copy changed the cloud document after this device loaded it. Nothing was overwritten; use **Retry cloud sync** to review both copies and choose one.
- `northstar/offline` / `unavailable` — the device could not reach Firestore. Changes stay local and a transient code is retried when the connection returns, the tab becomes visible again, or the page is restored from the back/forward cache (at most once every 20 seconds). A real conflict still pauses.
   If a sign-in finishes without a confirmed copy and without an error (for example when a second auth event interrupts the first load), Northstar records `northstar/app` with "Google sign-in completed, but Northstar could not confirm the cloud copy" instead of leaving the state unexplained.
- **Check cloud access** (Settings → Sync diagnostics) performs one server read of your own document and reports the exact outcome: `permission-denied` (publish `firestore.rules`), `not-found`/`failed-precondition` (create Cloud Firestore or check the project), `unavailable` (network), or a confirmation with the document state. It also shows the configured Firebase project and database, so a mismatch is visible. The check proves read access only; a save still pauses if a write is denied.
- `permission-denied`, `not-found`, `failed-precondition`, `auth/unauthorized-domain`, `auth/operation-not-allowed` and similar codes keep their original Firebase meaning with a setup hint; see the messages in the diagnostics panel.
- On iOS Safari and in an installed home-screen app, Google sign-in uses the redirect method because the popup is unreliable there; a blocked popup also falls back to a redirect afterwards.

The pause behaviour, conditional writes and protected-workspace rules are unchanged. These surfaces are not a substitute for a physical iPhone, Safari or live Firebase test: the new code display exists so the next failure can be identified precisely.

## Optional developer checks

Run `node --test tests/*.test.*` with Node.js 18 or later. These dependency-free tests cover graph calculations and rendering, the Home shortcut, Jarvis answers and drafts, welcome entry and replay, purchase projections, transaction/link integrity, encryption, and mocked sync/storage conflicts. They do not validate deployed Firestore rules. The website itself remains a static page and does not require Node.js or a build step.

For optional Chromium touch, graph, accessibility and interface checks, install `puppeteer-core` and `axe-core` outside this repository and point the scripts to a Chromium executable (Node.js 22 recommended):

```sh
npm install --prefix /tmp/northstar-browser-qa --no-save puppeteer-core axe-core
NODE_PATH=/tmp/northstar-browser-qa/node_modules CHROMIUM_PATH=/path/to/chromium node tests/stock-watchlist-browser.cjs
NODE_PATH=/tmp/northstar-browser-qa/node_modules CHROMIUM_PATH=/path/to/chromium node tests/finance-graphs-browser.cjs
NODE_PATH=/tmp/northstar-browser-qa/node_modules CHROMIUM_PATH=/path/to/chromium node tests/interface-browser.cjs
NODE_PATH=/tmp/northstar-browser-qa/node_modules CHROMIUM_PATH=/path/to/chromium node tests/home-shortcut-browser.cjs
NODE_PATH=/tmp/northstar-browser-qa/node_modules CHROMIUM_PATH=/path/to/chromium node tests/welcome-browser.cjs
```

The browser checks use synthetic records and block or mock external services; they are not a physical iPhone, Safari, live AI-provider, or live Firebase test. Axe reports some contrast checks as incomplete on translucent or gradient surfaces; the graph test also checks a conservative flat background but this is not a complete accessibility audit. Some sandboxed Chromium builds need additional flags via `CHROMIUM_FLAGS`.

## GitHub Pages publishing

1. Keep `index.html`, `vault-crypto.mjs`, `finance-graphs.mjs`, `financial-graphs-view.mjs`, `financial-graphs.css`, `stock-watchlist.mjs`, `stock-watchlist-view.mjs`, and `stock-watchlist.css` together in the repository root, alongside `firestore.rules` and `README.md`.
2. Open repository **Settings → Pages**.
3. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then save.
4. In Firebase Console → Authentication → Settings → Authorized domains, add your GitHub Pages hostname (for example, `corbinplayz.github.io`, without a path).
5. Enable Google as a Firebase Authentication provider.
6. In Firebase Console → Firestore Database → Rules, paste and publish the current contents of `firestore.rules`; test them using a non-production project before trusting them with financial data.

## Cloud data and security

Northstar stores a signed-in user's data at:

`users/{signed-in-user-uid}/northstar/financeData`

The Firebase configuration inside `index.html` is public web-app configuration, not admin credentials. Never place service-account credentials or private API keys in a browser app. Authentication and properly published Firestore rules remain necessary even when passphrase protection is enabled.
