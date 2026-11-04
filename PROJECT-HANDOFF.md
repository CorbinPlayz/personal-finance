# Northstar Personal Finance — Current Project Handoff

> Last reviewed: 2026-11-03 (America/New_York)  
> Purpose: give a new AI/developer the current product requirements, real repository architecture, implemented behavior, history, and honest next steps without relying on chat history.

## 1. Project identity and product direction

**Northstar Personal Finance** is a browser-based personal finance planner. The authoritative project is:

- Repository: https://github.com/CorbinPlayz/personal-finance
- Branch: `main`
- Hosting direction: static website / GitHub Pages, with optional cloud services.
- Main implementation: one large root `index.html`, not the previously discussed React/Vite prototype.
- The website should keep working when the user's PC is off. Do not introduce a requirement to leave a local development server or command prompt running for the deployed site.

The product is deliberately manual-entry. It is not a bank aggregator, payment app, or verified financial-data source. The user enters their own account balances and transactions. Never imply that figures have been checked against a bank.

## 2. Current status at a glance

| Area | Current status |
|---|---|
| Main website | Implemented in root `index.html` |
| Mobile layout and navigation | Implemented |
| Mobile vertical scrolling | **Resolved.** The user confirmed it was already fixed. Do not reopen it as an outstanding bug or redo the fix unless a new regression is reported. |
| Visual design | Monochrome black/white system in the `#mono-design` layer (2026-11-03) |
| Local persistence | Implemented with browser `localStorage` |
| Google sign-in / Firestore sync | Implemented in the front end. The user previously reported that Google sign-in and cloud sync worked; this has not been freshly tested during this handoff update. |
| Transactions, accounts, budgets, goals, purchases | Implemented in the main app |
| Purchase priority sorting and compact tile/detail flow | Implemented |
| Purchased state and one-time X animation | Implemented; recent commits refined the visual alignment of the X and impact ring |
| Guide | Implemented as a **local rules-based planner**, not an external generative AI model |
| Manual price research/history | Implemented; no live retailer feed or automatic price monitoring |
| JSON backup / restore | Implemented |
| Cloudflare AI Worker | Worker code and setup notes exist, but the website is **not wired to call it** and deployment is not confirmed |
| Automated test suite / build pipeline | No `package.json`, test runner, or React/Vite build was found in the current repository inventory |

## 3. Repository inventory — verified

| File | Purpose and important notes |
|---|---|
| `index.html` | The complete static app entry point and primary implementation. It contains the HTML shell, extensive CSS, app state, render functions, forms, event handling, local persistence, Firebase integration, and the purchased-card animation observer. It is large (about 203 KB). Make focused edits; do not replace the whole file casually. |
| `README.md` | Product overview, feature summary, GitHub Pages publishing steps, Firebase setup, data-path notes, and privacy/security warnings. It currently describes the Guide as rules-based. |
| `firestore.rules` | Firestore rules intended to let an authenticated user read/write only their own Northstar finance document. Publishing this file to Firebase Console is a separate deployment step. |
| `cloudflare-worker/README.md` | Setup, deployment, quota, and privacy notes for an optional Cloudflare Workers AI backend. |
| `cloudflare-worker/src/index.js` | Worker endpoint. Restricts origin, checks a Firebase ID token, validates the request, sends the question and supplied context to Workers AI, and returns an advisory response. |
| `cloudflare-worker/wrangler.toml` | Wrangler configuration; Worker name is `northstar-finance-ai`, entry point is `src/index.js`, and AI binding is named `AI`. |
| `PROJECT-HANDOFF.md` | This document. Keep it current after meaningful project or requirement changes. |

**Not present in the current repo tree:** `package.json`, `src/`, `tsconfig.json`, or a React/Vite app scaffold. Older discussions about React, TypeScript, Vite, an offline USB desktop app, or npm launch scripts are not the architecture of this repository. Do not tell the user to run npm commands for this static-site repo unless the architecture is intentionally changed later.

## 4. Implemented application behavior

### Main sections

- **Overview:** financial snapshot and recent activity. Keep spending and savings distinct; do not introduce a combined number that could make separate account types look like one spendable balance.
- **Transactions:** income, expense, and transfer records; transactions can be filtered/searched. A recorded income/expense updates its associated account balance.
- **Accounts:** create and manage tracked accounts, account types, balances, optional minimum balances, and purchase allocations. Purchase funds can be shown separately from available funds.
- **Budgets:** user-defined category limits.
- **Goals:** savings goals with target and saved amounts, progress states, and a completion celebration. Goal-completion sound can be disabled in Settings.
- **Purchases:** planned-purchase list with priority, date, saved amount, funding account, category, notes, and reminders. Purchases are automatically organized rather than relying on the user to manually drag/reorder everything.
- **Northstar Guide:** profile-based and record-aware planning suggestions, price-history context, and a suggested-next-moves section.
- **Settings:** Google account/cloud sync controls, display currency, JSON backup/restore, data clearing, welcome-screen replay, and goal-sound preference.

### Purchase planner — important latest behavior

This area has received multiple rounds of detailed user feedback and should not be simplified or reverted without discussion.

- Purchase tiles are compact square cards intended to keep a long list manageable.
- Selecting a tile opens a separate detail view; editing is available from that view.
- Active purchases are automatically grouped/sorted by priority and target date.
- Purchased items have their own **Purchased** group and a muted/greyed, locked-looking visual treatment.
- The purchased marker stays red while the rest of the completed card is muted.
- The purchased X is animated when a card first enters the visible area. The code uses an `IntersectionObserver` and unobserves cards once shown so normal scroll revisits do not replay the animation on those same DOM elements.
- The latest source includes SVG/CSS X strokes and an impact-ring treatment. Commits on 2026-10-26 specifically corrected the intersection/centering and alignment of the X strokes with the ring. Preserve this work; do not replace it with a generic text X.
- Marking a planned purchase as bought records a matching expense against its funding account. Existing purchase-linked transactions are checked to avoid duplicate expenses.
- Purchase allocation and purchase completion validate against account minimum balances and amounts already reserved for other planned purchases.
- Reminder offsets in the current data logic include 30 days, 7 days, 1 day, and the target day.

### Guide and manual price research

The current front-end Guide is deterministic local JavaScript logic. It is not calling a remote LLM.

It can use the profile fields and Northstar records to create simple suggestions around:
- monthly take-home income;
- essential monthly bills;
- a protected cash cushion;
- pay frequency and payday;
- a selected savings goal;
- planned purchase priorities and remaining amounts;
- preferences/notes the user chooses to save.

The user can log observed product prices manually. The app can open an external shopping search and calculates a simple 30-day trend estimate only after at least three price checks on different dates. This is an estimate based only on user-entered prices, not a retailer feed, price tracker, guaranteed prediction, or live product lookup.

### Data model and persistence

The front end's blank data model contains arrays for accounts, transactions, budgets, goals, and purchases, plus settings/profile/Guide memory. It starts with empty records rather than fabricated account balances.

- Local storage keys use the `northstar-finance-v1:` prefix.
- When signed out, data remains in the browser's local copy.
- When signed in and cloud sync is active, the app reads/writes the user's Firestore document.
- The save queue is debounced; the current code waits about 700 ms before writing a queued cloud save.
- If local and cloud records differ on sign-in, the user is shown a choice to use the cloud copy, keep the local copy, or decide later.
- The app can export/restore a JSON backup. Restore replaces the currently active dataset after confirmation.
- Changing the display currency changes formatting only. It does not convert values using exchange rates.

## 4a. Visual design system — monochrome (2026-11-03)

The app was deliberately restyled to a **sleek black-and-white** identity (luxury minimalism / premium SaaS), replacing the earlier navy-and-blue fintech palette. Preserve this direction unless the user asks to change it.

- **Where the styling lives:** `index.html` now has two `<style>` blocks. The original sheet (first) is mostly structure. The design layer is the second block, `<style id="mono-design">`, at the end of `<head>`; it ends with its own responsive re-declarations so it does not flatten the mobile layout. Add new visual rules there rather than scattering them through the original sheet.
- **Palette:** ink `#080808`, paper `#ffffff`, canvas `#f7f7f7`, hairlines `#e9e9e9`/`#ececec`, secondary text `#6e6e6e`–`#9a9a9a`. Every legacy hex in the file was remapped to a neutral ramp.
- **Deliberate exception:** one muted oxblood `#8f2f26` (`--danger`) is kept for destructive actions, form errors, and over-budget states only. It is not decoration.
- **Money semantics (intentional, not a bug):** positive amounts are ink black; negative/expense amounts are quiet gray (`#6e6e6e`) rather than red. Red is reserved for true errors and delete actions. Do not "fix" this back to green/red without asking.
- **Preserved exception:** the purchase-planner "purchased" X marker remains red per an earlier explicit user request. It is the one intentionally non-monochrome component.
- **Icons:** the sidebar nav, mobile dock, topbar buttons, metric tiles, transaction rows, account cards, goal cards, empty states, and welcome benefits now use inline SVG line icons (1.6px stroke, `currentColor`), not Unicode glyphs. The shared set is the `_ico()` helper plus the `ICON` object defined just after `esc()` in the module script. Reuse it instead of adding glyphs.
- **Brand mark:** the Northstar star SVGs (`nsBg*` / `nsStar*` gradients) are monochrome — charcoal tile (`#242424`→`#101010`) with a silver-to-white star and a hairline `#ffffff26` edge. Keep those gradient IDs intact; the avatar and breadcrumb variants are generated as strings in JS.
- **Type and detail:** Manrope for display/values, DM Sans for UI/body, tabular numerals (`font-variant-numeric`) on all money-bearing components, 14px card radius, 9px control radius, hairline borders with a barely-there shadow instead of heavy elevation, black primary buttons with white text, and 180–350ms `cubic-bezier(.22,.61,.36,1)` motion.
- **Mobile:** the black floating dock uses a white active pill. Safe-area bottom padding and the documented scroll fixes were left untouched.

**Verification note:** the development sandbox has no browser, so this restyle was validated with parsers rather than by screenshot — `parse5` reported 0 HTML parse errors, `css-tree` reported 0 CSS parse errors in both style blocks, an automated scan found 0 rule pairs below a 2.2 contrast ratio, and the page was confirmed served over HTTP. Final visual confirmation is user-side. Do not claim a visual QA pass that did not happen.

## 5. User requirements and non-negotiable design constraints

These requirements come from prior Northstar discussions and should guide future work.

### Data correctness and account presentation
- Do not add placeholder balances or example amounts that look like the user's real money.
- The earlier values discussed as estimates (including example spending, savings, and minimum-balance figures) were not confirmed account data and must not be restored as defaults.
- Keep spending and savings balances separate. Do not combine them into a single headline balance that could be interpreted as freely spendable money.
- Respect minimum account balances and funds already allocated to planned purchases.
- Manual entry is preferred. Do not add bank linking or require the user to import spreadsheets/CSVs as the normal workflow. JSON backup/restore is already part of the app.

### Visual design and interaction
- Aim for a premium, professional fintech feel: calm neutral surfaces, crisp typography, restrained accent color, clean hierarchy, and semantic colors only when they communicate something.
- Avoid generic AI-looking styling, unnecessarily oversized cards, and empty dashboard space. Dashboard cards should use space for meaningful information rather than padding alone.
- Keep the Purchase Planner compact and scannable as the number of planned items grows. Automatic grouping/sorting is preferred over manual reordering.
- Keep phone layouts usable, not merely scaled-down desktop layouts.
- The user values polished motion and careful alignment. Avoid adding animations that replay unexpectedly or ignore reduced-motion preferences.

### Setup and assistance style
- Explain technical setup one step at a time when directly guiding the user through setup.
- Before substantial code changes, inspect the actual existing implementation and preserve the user's data and current behavior.
- Explain what changed, which file changed, and what was actually tested. Do not claim a test was run when it was not.

## 6. Mobile support — resolved, not an active task

The user has now explicitly clarified that mobile scrolling was **already fixed**.

Repository history corroborates that this was handled in code:
- 2026-10-24: commit `83f81f7a` — “Fix vertical scrolling on mobile browsers”.
- 2026-10-26: commit `0dd404d8` — “Improve document scrolling on iPhone browsers”.

The current `index.html` includes document-level vertical overflow rules, iOS momentum scrolling, `touch-action: pan-y`, responsive layout hardening, a fixed phone navigation dock, safe-area bottom spacing, and a scrollable welcome screen. The app also uses a responsive sidebar/scrim on narrower screens.

**Do not list “mobile page will not scroll” as an open issue. Do not attempt another scroll fix unless the user reports a new, reproducible regression.** This handoff review inspected the relevant source and commit history; it did not perform a fresh physical-device test.

## 7. Firebase and security notes

- Firebase project ID in the app configuration: `northstar-personal-finan-ca543`.
- Firebase client SDK modules are loaded dynamically from Google's hosted SDK.
- Google Authentication and Firestore are implemented in `index.html`.
- Firestore document path: `users/{uid}/northstar/financeData`.
- `firestore.rules` checks that a signed-in user's UID matches the document's `userId` path segment.
- Firebase browser configuration is public client configuration, not a Firebase Admin/service-account credential. Never put service-account JSON, private API keys, or other admin secrets in `index.html` or any public repository file.
- The code in the repository is not proof that Firestore rules are currently published in the Firebase Console, nor proof that all production settings are correct.
- The user previously reported that Google sign-in and cloud sync were working. Treat that as user-reported history, not a fresh end-to-end verification during this handoff update.
- The Settings UI itself warns that browser data is not encrypted. Do not describe localStorage as encrypted or treat client-side UI safeguards as a substitute for proper authorization.
- Do not use real financial details for testing unless the user explicitly chooses to do so. Never ask for bank passwords, full card numbers, or credentials.

## 8. Optional Cloudflare Worker — prepared, not integrated

The `cloudflare-worker/` folder contains a separate backend option for a future AI Guide integration.

What the Worker currently does:
- accepts POST requests only, with an OPTIONS preflight;
- allows the configured GitHub Pages origin `https://corbinplayz.github.io`;
- expects a Firebase ID token in the Authorization Bearer header and validates it through Firebase Authentication;
- expects an `AI` Workers AI binding;
- uses the model string `@cf/zai-org/glm-4.7-flash`;
- limits message/context sizes and returns advisory text rather than modifying finance records;
- reads the Firebase Web API key from the Worker environment variable/secret named `FIREBASE_API_KEY`.

**Important integration gap:** the current front-end `index.html` contains no Worker URL, Worker fetch call, or remote Guide request. Its `answerGuide()` function generates a local rules-based answer and its UI explicitly says it is not an external generative AI model. The Worker README also says that the Worker must be deployed and its URL wired into the front end. Therefore, do not tell the user “Northstar AI is live” or imply the Worker powers the current Guide.

Before integrating it, confirm the user still wants a remote AI feature, check current Cloudflare model availability/pricing/limits, decide exactly what minimum financial context may be sent, and make the URL configurable without exposing private credentials. Do not enable paid usage without explicit user approval.

## 9. Hosting and deployment

The root README documents GitHub Pages deployment from branch `main`, folder `/(root)`. It also documents adding the GitHub Pages hostname as a Firebase Authentication authorized domain and publishing the Firestore rules in Firebase Console.

The optional Worker has a separate Wrangler configuration. Its README describes deployment to Cloudflare and configuration of its AI binding and Firebase API-key environment variable. No fresh check was made in this handoff review to confirm the deployed GitHub Pages site or Worker is live and healthy.

## 10. Useful implementation landmarks inside index.html

The file is large and contains mostly long CSS/JavaScript lines. Use targeted search rather than reading or rewriting it all at once.

| Code landmark | Purpose |
|---|---|
| `FIREBASE_VERSION`, `firebaseConfig`, `blankData` | SDK version, public Firebase config, empty data shape |
| `localKey`, `loadLocal`, `persist`, `normalizeData` | Data migration/normalization and browser persistence |
| `applyTransaction`, `reservedFunds`, `accountBalanceParts`, `maxPurchaseAllocation` | Account arithmetic and purchase protection |
| `showNorthstarDialog` | Reusable styled confirmation/choice dialogs |
| `initWelcomeJourney`, `updateWelcomeProgress` | Intro scroll progress and reveal effects |
| `render`, `renderOverview`, `renderTransactions`, `renderAccounts`, `renderBudgets`, `renderGoals` | Main page rendering |
| `renderPurchases`, `renderPurchaseTile`, `setPurchaseStatus` | Purchase planner, tile/detail display, and bought flow |
| `safePriceHistory`, `estimatePriceTrend`, `renderPurchasePriceTools`, `savePriceCheck` | Manual price logs and local trend estimate |
| `renderGuide`, `saveGuideProfile`, `answerGuide` | Rules-based Guide and saved profile/memory |
| `renderSettings`, `exportBackup`, `importBackup` | Preferences and JSON backup/restore |
| `initFirebase`, `onAuthChanged`, `writeCloudNow`, `queueCloudSave` | Authentication and Firestore synchronization |
| Final purchased-card observer IIFE | Plays each purchased card's entry animation when it first intersects the viewport |

## 11. Recent repository history worth preserving

The most relevant code-history milestones on `main` include:

- 2026-10-23: separate account balance presentation, purchase allocations, minimum-balance protection, transaction recording when marking a purchase bought, and sync conflict handling.
- 2026-10-23: Northstar Guide profile, saved preferences, payday input, manual price history, and trend estimate.
- 2026-10-24: responsive mobile layout; mobile vertical-scroll fix; Cloudflare Worker backend and deployment documentation.
- 2026-10-26: iPhone document-scrolling improvement; purchase planner descriptions and clear-data safeguards; automatic purchase priority sorting; compact square tiles and detail view; separate Purchased group; muted completed cards; one-time animated X; subsequent X/ring alignment refinements.
- 2026-11-03: initial project handoff added.
 
Latest code-focused commits visible during this review were on 2026-10-26. The current handoff update is documentation-only and should not change app behavior.

## 12. Recommended next steps for a new AI/developer

1. Read this handoff and the root `README.md`, then inspect the exact current `index.html` before editing.
2. Treat mobile scrolling as resolved. Do not spend time re-fixing it unless the user reports a new regression.
3. Ask what feature or improvement the user wants next; do not assume the Cloudflare Worker should be integrated just because its files exist.
4. For visual refinements, preserve the existing premium Northstar design language and the compact Purchase Planner behavior. For the dashboard, prioritize useful information density over simply enlarging cards.
5. Protect data integrity: keep user-entered amounts intact, preserve the local/cloud conflict flow, respect account minimums and purchase allocations, and do not add sample balances.
6. After each meaningful change, validate the relevant flows, state precisely what was tested, and update this handoff.

## Work log

- 2026-11-03: Re-reviewed the prior Northstar project context available in this conversation, the current repository inventory, root README, Firestore rules, Worker source/configuration, current `index.html`, and recent Git commit history. Rewrote this handoff to reflect the current static-site architecture and implemented functionality.
- 2026-11-03: Corrected the mobile-scrolling status. The user confirmed scrolling was already fixed; repository commits from 2026-10-24 and 2026-10-26 and the current responsive CSS corroborate that status. No new scrolling code was changed.
- 2026-11-03: Full visual redesign to a monochrome design language. Added the `#mono-design` style layer, remapped every colour literal to a neutral ramp with a single oxblood danger accent, replaced Unicode glyphs with inline SVG line icons (nav, dock, metrics, transactions, accounts, goals, empty states, welcome benefits), rebuilt the monochrome brand marks, and added tabular numerals. Structure, data logic, persistence, sync, and the documented mobile scroll fixes were not changed; the only JS edits are icon/colour values plus the new `ICON` set.
- 2026-11-03: Documented the important Cloudflare integration gap: a Worker backend exists, but the current Guide remains local/rules-based and does not call the Worker.
