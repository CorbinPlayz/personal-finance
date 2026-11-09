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
| Mobile vertical scrolling | User reports scrolling still fails and the page is laggy in Chrome on iPhone 13 (2026-11-04). Earlier fixes left both `html` and `body` as scroll containers at mobile sizes; now `html` is the document scroller and `body`/app sections stay in normal flow. Expensive animated blur/ink/canvas effects are disabled on small/coarse-pointer devices. Parser checks pass; physical-device confirmation is still required. |
| Visual design | Monochrome black/white system in the `#mono-design` layer (2026-11-03) |
| Local persistence | Implemented with browser `localStorage` |
| Google sign-in / Firestore sync | Implemented in the front end. The user previously reported that Google sign-in and cloud sync worked; this has not been freshly tested during this handoff update. |
| Transactions, accounts, budgets, goals, purchases | Implemented in the main app |
| Purchase priority sorting and compact tile/detail flow | Implemented |
| Purchased state and one-time X animation | Implemented; recent commits refined the visual alignment of the X and impact ring |
| Guide | Implemented as a **local rules-based planner**, not an external generative AI model |
| Jarvis cloud brain (BYOK) | Implemented. Visitors paste their own key in the panel's Connections sheet; key is per-browser, excluded from data/backups; local engine is the default and fallback. Reliability fixes, honest verification status, source labels, and provider diagnostics are in 4g. Local review-before-save finance-action drafts are documented in 4i |
| Manual price research/history | Implemented; no live retailer feed or automatic price monitoring |
| JSON backup / restore | Implemented |
| Cloudflare AI Worker | Worker code and setup notes exist, but the website is **not wired to call it** and deployment is not confirmed. The visitor-key (BYOK) path in 4f is what shipped instead |
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
- The purchased mark is animated when a card first enters the visible area. The code uses an `IntersectionObserver` and unobserves cards once shown so normal scroll revisits do not replay the animation on those same DOM elements.
- **2026-11-09 — the X was replaced.** The old mark was a full-tile `<svg>` with `preserveAspectRatio="none"`, so two diagonal strokes were stretched across the whole 1:1 card and ran straight through the purchase name and price, plus a `×` glyph chip and a 🔒 emoji doing the same job. That is the "looks awful" the user reported. The replacement is a **completion seal**: a 26px seal in the tile's top-right corner (two strokes that draw in sequence, over one expanding contact ring) and a single rule struck through the price. No element is stretched across the card, nothing touches the title, and the emoji/glyph duplicates are gone. The static purchased state is identical with animation disabled, which matters because the observer unobserves a card after it first shows.
- Behaviour is unchanged and must stay that way: the mark animates once when a purchased card first scrolls into view (`IntersectionObserver`, 0.22 threshold, unobserved after firing), keeps the per-column stagger via `--purchase-x-delay`, keeps the `purchase-x-visible` class hook, keeps the red `#8f2f26` accent as the one intentional non-monochrome component, keeps the muted card treatment, and honours `prefers-reduced-motion` by rendering the final mark with no animation.
- CSS classes for the new mark live in the style block at the end of `<head>`: `.purchase-tile-seal`, `.purchase-seal-ring`, `.purchase-seal-stroke` (`.purchase-seal-a` / `.purchase-seal-b`), `.purchase-tile-strike`, with `purchaseSealIn`, `purchaseSealRing`, `purchaseSealDraw` and `purchaseStrike`. Each mark has a hidden pre-animation state (seal `opacity:0`, strokes `stroke-dashoffset:1`, strike `scaleX(0)`) so a card waiting out its stagger delay does not flash the finished mark and then retract it; do not switch those back to the final values. The old `.purchase-cross-*`, `.purchase-tile-cross`, `.purchase-tile-lock`, `purchaseXDraw` and `purchaseXBadge` rules were deleted rather than overridden. Reuse these names instead of reintroducing a full-tile overlay.
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

## 4b. Liquid Black layer — motion, sound, glass (2026-11-03)

On top of the monochrome system there is a third additive layer: `<style id="liquid-design">` in `<head>` and `<script id="liquid-runtime">` just before `</body>`. Both are strictly **additive** — the commit that introduced them was +790 lines / 0 deletions, so no app logic, data model, sync or persistence code was modified. The runtime integrates only through the app's own delegated DOM events (`[data-page]`, `[data-action]`).

- **Stacking contract:** `.nsx-ambient` (z 0, drifting blurred colour fields on `#f7f7f7`) → `canvas.nsx-ink` + `.nsx-light` (z 1) → `.app-shell` (z 2). `body` background is transparent so these layers show through gaps and behind glass. Modals/dialogs sit above; the welcome screen (z 1000) covers everything.
- **Glass:** sidebar, topbar, mobile dock, modals, confirms and toasts use `backdrop-filter` blur + saturation with inset specular highlights and iridescent rim gradients. Cards stay flat and crisp on purpose — that contrast is what makes the glass read as glass.
- **Iridescence:** pink `#ff9ad5`, lilac `#b79cff`, cyan `#8be8ff`, mint `#a8ffd4` used only on edges, sheen sweeps, progress shimmer and the dock's active pill — never as a wash behind text.
- **Ink cursor:** a fixed canvas spawning up to 60 diffusing plumes that expand and fade over ~0.9–1.35 s, each with an iridescent fringe. Throttled to one spawn per 26 ms with **separate clocks for the spawn throttle and the rAF frame loop** (a shared variable previously froze spawning after the first frame — do not merge them again). Hidden entirely on coarse pointers and under reduced motion.
- **Motion:** `.nsx-enter` staggered entrances on each `#content` mutation (skipped while an input is focused, so search typing does not re-animate), count-up on `.metric-value`/`.account-balance`/`.purchase-summary strong` via `dataset.nsxTarget` de-duplication, hover sheen sweeps, spring card lifts. All gated by `prefers-reduced-motion`.
- **Sound:** synthesized Web Audio only — no asset files. `tap`, `tick`, `whoosh`, `close`, `success`, `purchase`, `error`, `needle`, plus an optional ambience bed (off by default). **Sound is on by default** per user request; the context is created on first gesture because browsers demand it. Mute state, volume, grain and ambience persist in `localStorage` under `northstar-fx-v1`. The topbar speaker button, `M`, and the palette all toggle it.
- **Command palette:** `⌘K`/`Ctrl+K` — 8 page jumps + 9 actions, arrow keys, Enter, Esc. Actions are executed by clicking the app's real controls, so the palette can never bypass validation.
- **Shortcuts:** `?` cheat sheet, `N` new transaction, `M` mute, `G` grain, `H`/`T`/`A` pages, `Esc` closes overlays.
- **Easter egg:** press and hold the sidebar logo ~700 ms — the mark melts, needle-drop plays, small toast appears.
- **Verification:** `parse5` 0 errors, `css-tree` 0 errors across all three style blocks, 0 low-contrast rule pairs, `node --check` on the runtime, and a jsdom boot harness that asserts the layers mount, the palette opens with 17 items, overlays close, mute toggles, and 40 synthetic `pointermove` events raise no errors. **Audio was never actually heard and the visual result was never seen** — no browser or output device exists here. Treat sound design and motion feel as unverified until the user confirms.

## 4c. Jarvis — local assistant (2026-11-03)

A floating assistant orb (bottom-right) opens a glass chat panel. It is **entirely local**: `<style id="jarvis-design">` + `<script id="jarvis-runtime">`, no network calls of any kind, no API key, no third party. It reads the same live ledger the app writes and uses a localStorage fallback. The draft-only typed money-action path can fill existing app forms but never directly changes ledger state; see 4i.

- **What it can answer:** greeting/status, `roast me` (a candid, numbers-driven assessment), `can I afford <amount>`, spending by month + top categories, income, savings rate, budget status (and overruns), goal progress, total balance minus account minimums, open purchase plans, `what should I do next` (three ranked moves), plus a capability list.
- **Tone modes:** Playful (default), Ruthless, Coach — chosen with chips in the header, persisted. The roast is generated from real figures (over-budget categories, negative savings rate, unfunded purchases), not canned filler, though it is a rules engine rather than a language model.
- **Voice (optional, off by default):** `speechSynthesis` replies, preferring a British male voice for the Jarvis feel; `SpeechRecognition` mic input where the browser supports it.
- **Persistence:** assistant preferences live under `northstar-jarvis-v1`; chat history is intentionally not persisted.
- **Shortcuts:** `J` toggles the panel, `Esc` closes it.
- **Stacking:** orb z-1500, panel z-1600 — above the mobile dock, below the command palette.
- **Why not an LLM:** an API key in a static page is public, and the repo's Cloudflare Worker (`cloudflare-worker/`) is not deployed or wired. The local engine was chosen deliberately so the feature works offline with no cost and no financial data leaving the device. Upgrading to a real model means deploying that Worker (or another backend) and sending only the minimum context the user opts into — do not add a client-side API key.

**Verification:** `parse5` 0 errors, `css-tree` 0 errors across four style blocks, 0 low-contrast pairs, `node --check` clean, and a jsdom harness with a seeded ledger asserting arithmetic (spend 2300, income 5200, 56% savings rate, two over-budget categories), the roast/affordability/advice/balance/goals answers, panel opening via `J`, and no runtime errors. **Spoken replies and the mic were never exercised** — no audio device or real browser here.

## 4d. Semantic colour + Jarvis ink (2026-11-03)

The design is **monochrome chrome with colour for money only**. The user explicitly asked for transactions to have colour again; do not remove these accents without being asked.

- **Where:** `<style id="color-accents">` (five style blocks now) and `<script id="jarvis-ink">`.
- **Money colours:** income `#1a7f5a` (`--money-in`), expense `#b3402a` (`--money-out`), transfer `#2b57c4` (`--money-move`), with pale tints for pill/icon backgrounds. Applied to `.positive`/`.negative` amounts, `.type-pill.income|expense|transfer`, `.tx-icon.*`, metric tiles, and a six-hue rotating palette for the spending-by-category bars.
- **Still monochrome:** shell chrome, nav, buttons, inputs, headings, cards, tables, modals, Jarvis panel. The rule of thumb: **if it is a number or a category, colour is allowed; if it is UI furniture, it stays black/white.**
- **Jarvis panel ink:** a canvas inside `.nsj-panel` (z 1, content at z 2, border ring at z 3) renders white/iridescent plumes behind the chat text — on pointer move, on tap, and one soft bloom per incoming message. Clipped by the panel's rounded corners, respects reduced motion, capped at 26 plumes.
- **Verification:** `parse5` 0 errors, `css-tree` 0 errors across all five blocks, `node --check` clean, and a jsdom run asserting the ink canvas mounts as the panel's first child, synthetic pointer events raise nothing, and every colour rule is present.

## 4e. Jarvis v2 — the "can't see anything" bug and the new brain (2026-11-03)

**Critical bug that was fixed here (do not regress it):** Jarvis v1 read only `northstar-finance-v1:local`. The app actually persists to `localStorage` under **`northstar-finance-v1:<uid>` when signed in** (`localKey(user?user.uid:'local')` in `persist()`). So on any signed-in session Jarvis was reading an empty slot and reported it could see nothing. Two fixes, both required:

1. **Live bridge (primary):** a read-only hook is defined **inside the module script**, immediately before the final `render();initFirebase();initWelcomeJourney();` line:
   `window.NorthstarLedger = () => JSON.parse(JSON.stringify(data))`
   This exposes the in-memory ledger, including cloud-synced data that hasn't been persisted locally yet. The hook MUST stay inside the module — `data` is module-scoped, and an earlier attempt that placed it after `</script>` silently fell back to storage because `data` was out of scope.
2. **Storage scan (fallback):** `scanStorage()` enumerates every `northstar-finance-v1*` key and picks the one with the most records, so it also works if the bridge is unavailable.

**Brain v2 (rules engine, still no network):**
- Intent classifier with weighted keywords (17 intents) plus entity extraction: amounts (`400`, `1.5k`), any category name present in the data (canonical casing preserved), and month references (`last month`, `this month`, month names).
- Month-over-month comparison per category, end-of-month projection from the current run rate, days remaining, and safe daily spend.
- Multi-turn context: `last` holds intent/category/amount/month, so `and rent?`, `why?`, `what about 600` resolve against the previous answer. A bare number (`250`) is treated as an affordability question, not a follow-up.
- New answers: "what can you see" (proves what it is reading), projections, comparisons, safe-to-spend, and richer advice that cites real figures.
- Panel header shows a live status line: `Local · N acct · M tx`, or `No ledger found`.

**Verification:** parse5 0 errors; css-tree 0 errors across five blocks; `node --check` clean; a jsdom suite **seeded under a UID-scoped key** (the exact failing case) with 25 assertions covering totals, current and previous month spend, category queries, prior-month queries, affordability both ways, projection, comparison, budgets, goals, balance, safe-daily, advice, roast, help, follow-ups (`and rent`, `why`), bare amount, greeting and zero runtime errors. The in-memory bridge itself cannot be exercised in jsdom (it does not run module scripts) — it was verified statically to sit inside the module where `data` is in scope.

## 4f. BYOK cloud brain for Jarvis, plus a routing fix (2026-11-03)

Jarvis now has an optional visitor-supplied LLM. The site ships **no keys** and has no server: the visitor pastes their own key into a slot inside the panel, and requests go browser → provider directly. The local rules engine stays the default and the fallback.

**Where it lives (all inside `#jarvis-runtime`, plus one CSS block):**
- Gear button `#nsjGear` in the panel header opens `#nsjSheet`, a Connections sheet rendered with the panel markup (after `#nsjFootnote`).
- Controls: provider select (`gemini`, `openai`, `anthropic`, `groq`, `openrouter`, `custom`), key field (`type=password`), model field, base URL (custom only), switches for Cloud brain / Remember on this device / Include transactions, buttons Save & test, Preview payload, Clear key, and a status line `#nsjConnStatus`.

**Key isolation (the important part — do not merge this into finance data):**
- Dedicated storage key `northstar-jarvis-conn-v1`, written to `sessionStorage` by default and to `localStorage` only when "Remember on this device" is on. Toggling the switch moves the blob and clears the other copy.
- It is **not** part of `data`, so it is absent from the Firestore document and from `exportBackup()` (which serialises `{...data}` only). `JSON.stringify(conn)` exists solely inside `saveConn()`.
- The key never appears in the repo, in page source, or in any export. It is sent only to the selected provider (Gemini puts it in the query string; OpenAI-compatible uses `Authorization: Bearer`; Anthropic uses `x-api-key` plus `anthropic-dangerous-direct-browser-access: true`).

**Routing:** `send()` uses the cloud when `connReady()` (key + model + cloud switch on), sending a compact derived brief — month, currency, account counts/totals, this/last month income and spend, top categories, budgets, goals, planned purchases, days left, projection — never the raw ledger unless "Include transactions" is on (then at most 8 recent rows with descriptions trimmed to 40 chars). `max_tokens` ~420, 30 s `AbortController`, last 6 turns of history. Any failure (network, 401, timeout, empty body) silently falls back to the local answer and labels the message `Local fallback · <reason>`; successful cloud answers are labelled `Cloud · <provider>`.

**Guardrail:** `systemPrompt()` forbids inventing balances or transactions, requires citing brief figures, caps length at ~90 words, and states the currency.

**Also fixed here:** intent matching missed "how much can i safely spend" (it matched `spend`); `safely spend` / `safe spend` / `safe daily` were added to the `safe` intent. `brief()` and `systemPrompt()` now self-resolve a snapshot when called without one, and `callCloud()` rejects early with a clear message when the custom provider has no base URL or the provider is unknown.

**Verification:** parse5 0 errors; css-tree 0 errors across six style blocks (the new one has 41 rules); `node --check` clean; a jsdom BYOK suite with **27 assertions** using a stubbed `fetch` (sheet opens, key survives a provider switch, Save & test reaches `api.openai.com` and enables cloud, status lines update, key lands in sessionStorage not localStorage, Remember migrates it, preview payload renders, OpenAI/Anthropic/Gemini/Groq adapters each parse the right response shape, Anthropic sends the browser-access header, provider errors surface, a cloud answer renders with its `Cloud · OpenAI` label, a 401 falls back to the local engine with `Local fallback`, zero runtime errors). A separate 11-assertion regression suite re-checks the local brain (ledger visibility, category MoM, afford yes/no, safe daily, greeting, month-state reset, brief, guardrail). No live provider call was ever made — no credentials exist in the sandbox — and no visual/interaction review was possible.

## 4g. BYOK reliability follow-up (2026-11-03)

The visitor's screenshot showed `Local fallback · Missing authentication header`. This proves the cloud route was attempted and rejected; the answer itself was generated by the local rules engine. The former `Connected` label was only a configuration check, not proof that an API request worked.

**Fixes in this follow-up:**
- Replaced the stale Gemini, Anthropic, Groq, and OpenRouter defaults with the current recommended IDs in the app and migrate those exact old defaults for existing saved connections. OpenRouter now defaults to the free Gemma 4 31B chat slug.
- Base URL is truly hidden for non-custom providers (`.nsj-field[hidden]` overrides the general flex display rule).
- The test probe allows 64 output tokens, accommodating models with reasoning overhead. Transient HTTP 5xx and timeouts are retried once.
- Provider errors now retain the HTTP status, provider/upstream name, full useful detail (including OpenRouter's `metadata.raw`), and are no longer chopped at 120 characters. 401/403 details are not replaced with a generic error; 404s add model/endpoint guidance.
- Status says `Cloud on · unverified` until an actual successful request occurs in the current page session. Configuration edits invalidate the verification state. Every assistant message now labels its source (`Cloud`, `Local rules engine`, or `Local fallback`).
- BYOK request still sends the key directly in the selected provider's expected authentication header; the saved key remains isolated in session/local storage and does not enter finance data or backups.

**Verification:** `node --check`/`vm.Script` syntax validation, parse5 and css-tree parsing, and focused jsdom tests cover stale-model migration, session-only key storage, OpenRouter Authorization header and model, 64-token probe, hidden Base URL, verified-vs-unverified status, cloud source labels, full auth error detail, bounded long error text, a single retry recovering a 502, and attribution on all assistant responses. All passed. No live provider call or browser visual QA was possible in this sandbox.

## 4h. Site-wide ambient ink background (2026-11-03)

Follow-up to the earlier Jarvis-only ink experiment: the user clarified that they wanted ink as an ambient **page background**, not in the Jarvis panel and not tied to cursor movement. Removed the Jarvis ink canvas and the global cursor light/trail. The first page-wide version was hidden because `.main-area` painted an opaque gray gradient above the background; this follow-up makes that shell surface transparent so the ink wash can show through the gutters while cards remain opaque. Three large, soft-edged grayscale clouds morph slowly behind the app shell, layered with a subtle canvas that spawns drifting gray plumes on a timer. It is independent of pointer position, runs on coarse-pointer devices, pauses while the document is hidden, and becomes static under reduced-motion preferences. No 3D transforms or finance/data behavior changes.

**Verification:** parse5 reported 0 HTML errors; css-tree parsed all six style blocks; both remaining runtime scripts passed syntax checks; jsdom confirmed the three full-page ink clouds and full-viewport ambient canvas mount outside Jarvis, the main-area background is transparent so the underlay is visible, and no pointer-movement handler is installed. Under reduced motion the clouds remain static and the canvas is omitted. `git diff --check` passed. A live preview can be inspected by the user; no visual QA is claimed here.

## 4i. Jarvis manual finance actions (2026-11-03)

Jarvis now recognizes a focused set of explicit money-management phrasings locally, before optional cloud routing, and fills Northstar’s existing forms as drafts. Supported actions: expenses, income, and transfers; tracked account-balance edits; creating/updating a category budget; creating a savings goal or updating its saved-to-date amount; and creating a planned purchase or editing an existing plan’s price, target date, funding account, or priority. The normal app form remains the only write path: nothing is persisted or sent to cloud sync until the user reviews and submits the existing form. Existing validation, account calculations, persistence, and sync are reused.

This is a typed local intent path, not an unlimited natural-language model and not a claim to answer thousands of distinct questions. It is deliberately not bank linking, real transfers/payments, or automatic purchase completion. Balance edits replace the manually tracked balance without creating a transaction. Goal contributions update the goal tracker only and do not move money. Purchase drafts create plans only and do not deduct balances. If required information is ambiguous or missing, Jarvis asks or leaves the account field for the user to select; it does not invent balances.

**Verification:** both runtime scripts pass Node syntax parsing. A jsdom integration harness exercised transaction, explicit-save, balance, budget, goal, planned-purchase creation/editing, transfer direction, bare-amount, and balance-question cases; it verified modal prefills and no persistence before Save. No browser visual QA or live provider call was performed.

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
 
The latest code-focused work added local Jarvis review-before-save finance-action drafts; see section 4i. The feature landed in PR #12.

## 12. Recommended next steps for a new AI/developer

1. Read this handoff and the root `README.md`, then inspect the exact current `index.html` before editing.
2. Mobile scroll and performance are not yet confirmed on the user's iPhone 13 Chrome after the 2026-11-04 viewport/performance changes. Verify both the first-visit welcome overlay and the main app page on-device before calling them resolved.
3. Ask what feature or improvement the user wants next; do not assume the Cloudflare Worker should be integrated just because its files exist.
4. For visual refinements, preserve the existing premium Northstar design language and the compact Purchase Planner behavior. For the dashboard, prioritize useful information density over simply enlarging cards.
5. Protect data integrity: keep user-entered amounts intact, preserve the local/cloud conflict flow, respect account minimums and purchase allocations, and do not add sample balances.
6. After each meaningful change, validate the relevant flows, state precisely what was tested, and update this handoff.

## Work log

- 2026-11-09: Rebuilt the purchase "X" animation as a bounded completion seal. The previous full-tile SVG cross (`preserveAspectRatio="none"`) stretched two diagonals across the card's title and price and was duplicated by a `×` chip and a 🔒 emoji. The new mark is a small top-right seal with sequentially drawn strokes and a contact ring, plus a single strike through the price. Animation trigger, stagger, `purchase-x-visible` hook, red accent, muted card state and reduced-motion behaviour are all preserved; the old CSS was deleted. Verified with parse5 (0 HTML errors), css-tree (all 6 style blocks parse), `node --check` on the module body, and a jsdom boot that rendered the Purchases page with 3 purchased tiles and confirmed seal + strike present, old SVG and emoji absent, stagger delays applied, and no runtime errors. No browser is available in this sandbox, so no visual QA is claimed.
- 2026-11-03: Added the BYOK cloud brain — paste-in key slot in a Connections sheet, Gemini/OpenAI/Anthropic/Groq/OpenRouter/custom adapters, session-by-default key storage isolated from finance data, principal-free brief, silent local fallback with per-message source labels. Widened the `safe` intent. 27 BYOK + 11 local-brain jsdom assertions pass; no live API call or visual QA was possible.
- 2026-11-03: Fixed BYOK reliability issues reported during visitor testing: stale model defaults, false `Connected` status, hidden-field CSS leak, short probe tokens, truncated upstream errors, and no transient retry. All assistant replies now identify their source; see 4g. Focused jsdom/parser checks pass; live provider access and visual QA were not available.
- 2026-11-03: Moved ambient ink out of Jarvis to a page-wide grayscale background per user clarification. It drifts independently of pointer movement, runs on coarse pointers, pauses in hidden tabs, and is disabled for reduced motion.
- 2026-11-03: Added local Jarvis drafts for transaction, tracked balance, budget, goal, and planned-purchase actions. Existing forms remain the only save path; jsdom verified prefills and no writes before explicit submit. See 4i; no visual QA or provider call was performed.
- 2026-11-04: User reported mobile scrolling stopped. An initial CSS correction restored mobile `overflow-y:auto`, but the user later confirmed that scrolling still failed in Chrome on iPhone 13 and that the app felt laggy.
- 2026-11-04: Consolidated mobile page scrolling so `html` owns document scrolling and `body` plus app sections remain in normal flow, avoiding nested root/body scroll containers. Disabled animated blurred ambient/ink layers, the full-screen grain overlay, and canvas ink loop on small/coarse-pointer devices to reduce GPU work. CSS/JS parser checks pass, and jsdom confirms the coarse-pointer runtime skips the animated ink canvas while keeping the static background; real-device confirmation is still needed.

- 2026-11-03: Re-reviewed the prior Northstar project context available in this conversation, the current repository inventory, root README, Firestore rules, Worker source/configuration, current `index.html`, and recent Git commit history. Rewrote this handoff to reflect the current static-site architecture and implemented functionality.
- 2026-11-03: Corrected the mobile-scrolling status. The user confirmed scrolling was already fixed; repository commits from 2026-10-24 and 2026-10-26 and the current responsive CSS corroborate that status. No new scrolling code was changed.
- 2026-11-03: Fixed Jarvis reading the wrong storage key when signed in (uid-scoped), added the in-module `NorthstarLedger` bridge, and rebuilt the brain with intent scoring, entity extraction, multi-turn context, projections and comparisons.
- 2026-11-03: Restored semantic colour for money (income/expense/transfer, category palette) while keeping the chrome monochrome, and added the ink plume layer inside the Jarvis panel.
- 2026-11-03: Added Jarvis — a local, offline, data-aware assistant with tone modes, optional speech output/input, and a glass panel. Reads the ledger read-only; no network, no API keys.
- 2026-11-03: Added the Liquid Black layer — glass shell, iridescent accents, drifting ambient fields, ink-in-water cursor, staggered motion + count-ups, a synthesized sound system with a topbar mute, a ⌘K command palette, keyboard shortcuts, a grain toggle and a logo easter egg. All additive (+790/-0); core app logic untouched.
- 2026-11-03: Full visual redesign to a monochrome design language. Added the `#mono-design` style layer, remapped every colour literal to a neutral ramp with a single oxblood danger accent, replaced Unicode glyphs with inline SVG line icons (nav, dock, metrics, transactions, accounts, goals, empty states, welcome benefits), rebuilt the monochrome brand marks, and added tabular numerals. Structure, data logic, persistence, sync, and the documented mobile scroll fixes were not changed; the only JS edits are icon/colour values plus the new `ICON` set.
- 2026-11-03: Documented the important Cloudflare integration gap: a Worker backend exists, but the current Guide remains local/rules-based and does not call the Worker.
