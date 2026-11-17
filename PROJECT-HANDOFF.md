# Northstar Personal Finance — Current Project Handoff

> Last reviewed: 2026-11-09 (UTC)
>
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
| Mobile layout and navigation | Responsive floating glass dock replaces the sidebar on both desktop and mobile; narrow screens place Accounts, Budgets, and Settings under More. The top-left icon is a Home shortcut; the adjacent word is not clickable. See 4n and 4r. |
| Mobile scrolling and intro access | The user had confirmed the earlier main-page issue fixed, then reported a **new intro-specific block**. The intro has a pinned direct-entry button, a native touch scroller, and a short garage-inspired reveal on entry. Simulated Chromium swipes pass; confirmation on the user's phone is still needed. See 4m, 4q and section 6. |
| Visual design | Monochrome glass shell with semantic money colors, presentation-only finance feedback, and the compact red purchased badge; see 4a, 4d, and 4n. |
| Local persistence | Browser `localStorage`; plaintext by default. Optional passphrase-protected workspace uses a separate encrypted device copy. |
| Google sign-in / Firestore sync | Implemented in the front end. The user previously reported that Google sign-in and cloud sync worked, then reported an iPhone sync conflict that said only that sync "requires attention". Every paused sync now records and displays a code, reason and time (header, banner, Settings → Sync diagnostics); iOS sign-in falls back to a redirect. A sync paused on `northstar/conflict` is a pending choice between two different copies: the choose dialogs describe both copies in counts, ignore taps for half a second and then let a tap outside leave them, the same question is also a card on Settings → Sync diagnostics that needs no pop-up, and the notice, Settings and the Stocks line take you to it; nothing is chosen automatically. The owner's iPhone once showed only a dimmed page with no dialog card; the likely cause (a card that did not paint) is a hypothesis, not confirmed. Not freshly tested on a physical iPhone, Safari, or live Firebase. See 4t, 4v and 4w. |
| Transactions, accounts, budgets, goals, purchases | Implemented in the main app; recorded expenses appear as completed purchase tiles. Read-only graphs now cover all eight sections; see 4p. |
| Major update | PR #21 shipped the completed-expense and optional protection changes. The two-page user-facing overview is `MAJOR-UPDATE.md`; Settings links to it and the welcome screen labels the update. |
| Purchase priority sorting and compact tile/detail flow | Implemented |
| Purchased state and one-time X animation | Implemented; recent commits refined the visual alignment of the X and impact ring |
| Guide | Implemented as a **local rules-based planner**, not an external generative AI model |
| Jarvis assistant and optional cloud brain (BYOK) | Local rules engine, account-specific answers and review-before-save drafts; optional visitor-supplied provider. Keys are separate from finance data/backups and workspace encryption. See 4i and 4n. |
| Manual price research/history | Implemented; no live retailer feed or automatic price monitoring |
| JSON backup / restore | Implemented; protected workspaces export encrypted JSON, others export plaintext after a warning. |
| Cloudflare AI Worker | Worker code and setup notes exist, but the website is **not wired to call it** and deployment is not confirmed. The visitor-key (BYOK) path in 4f is what shipped instead |
| Automated test suite / build pipeline | Focused dependency-free Node tests in `tests/` cover purchases, crypto, mocked sync/storage failures and the Stocks save line; no `package.json` or React/Vite build is required |

## 3. Repository inventory — verified

| File | Purpose and important notes |
|---|---|
| `index.html` | The static app entry point and primary implementation. It contains the HTML shell, extensive CSS, app state, render functions, forms, event handling, local persistence, Firebase integration, dock, Jarvis, and presentation effects. It imports the vault and graph modules listed below. Make focused edits; do not replace the whole file casually. |
| `README.md` | Product overview, major-update summary and link, GitHub Pages publishing steps, Firebase setup, data-path notes, and privacy/security warnings. It describes the Guide as rules-based. |
| `MAJOR-UPDATE.md` | Two-page explanation of PR #21's purchase tiles, finance safeguards, optional protection, backups, and verification limits. Linked from README, Settings, and the Worker notes. |
| `firestore.rules` | User-scoped Firestore rules with a guard against plaintext merges into a protected document. Publishing and testing these rules in Firebase Console is a separate, unverified deployment step. |
| `vault-crypto.mjs` | Browser/Node Web Crypto envelope helpers: PBKDF2-SHA-256, AES-256-GCM, fresh IV, strict encrypted-format validation. It must be deployed alongside `index.html`. |
| `finance-graphs.mjs` | Pure read-only financial graph models with strict date/amount validation, transfer direction, safe aggregation, and transient goal scenario calculations. No network or storage access. |
| `financial-graphs-view.mjs`, `financial-graphs.css` | Escaped, responsive graph rendering, exact-value disclosures, empty/exclusion states, and reduced-motion-aware glass styling. Deploy these files next to the HTML and model module. |
| `tests/finance-graphs.test.mjs`, `tests/financial-graphs-view.test.mjs`, `tests/finance-graphs-browser.cjs` | Synthetic calculation, escaping, responsive, keyboard, animation and scoped accessibility checks; browser services are mocked or blocked. |
| `cloudflare-worker/README.md` | Setup, deployment, quota, and privacy notes for an optional Cloudflare Workers AI backend. |
| `cloudflare-worker/src/index.js` | Worker endpoint. Restricts origin, checks a Firebase ID token, validates the request, sends the question and supplied context to Workers AI, and returns an advisory response. |
| `cloudflare-worker/wrangler.toml` | Wrangler configuration; Worker name is `northstar-finance-ai`, entry point is `src/index.js`, and AI binding is named `AI`. |
| `tests/major-update.test.cjs`, `tests/welcome.test.cjs` | Dependency-free checks for release links, welcome entry/scroll/replay, focus, storage failure, and vault/sync guards. |
| `tests/welcome-browser.cjs`, `tests/interface-browser.cjs` | Optional Chromium touch/keyboard/viewport, dock, Jarvis, motion, and mocked-provider checks; setup is in README. External services are blocked or mocked. Not Safari, physical-phone, live-provider, or live-Firebase tests. |
| `tests/home-shortcut.test.cjs`, `tests/home-shortcut-browser.cjs` | Dependency-free checks plus 30 optional Chromium scenarios for icon-only Home navigation, responsive hit areas, scroll/focus, reduced motion, timing and workspace safeguards. |
| `tests/jarvis.test.cjs` | Dependency-free tests for the local assistant's arithmetic, follow-ups, reviewable drafts, storage failures, and workspace guards. |
| `tests/source-cleanup.test.cjs` | Checks that the removed AI-reader notices are absent from the current site source. |
| `tests/purchase-expenses.test.cjs` | Node tests for completed purchase projections, explicit ID links, price/date labels, finance edits, and duplicate-charge regressions. |
| `tests/vault-crypto.test.mjs`, `tests/vault-sync.test.cjs` | Node crypto round-trip/tamper tests and mocked cloud/device save conflict tests. Run `node --test tests/*.test.*`. These do not verify live Firebase or published rules. |
| `PROJECT-HANDOFF.md` | This document. Keep it current after meaningful project or requirement changes. |

**Not present in the current repo tree:** `package.json`, `src/`, `tsconfig.json`, or a React/Vite app scaffold. Older discussions about React, TypeScript, Vite, an offline USB desktop app, or npm launch scripts are not the architecture of this repository. Do not tell the user to run npm commands for this static-site repo unless the architecture is intentionally changed later.

## 4. Implemented application behavior

### Main sections

- **Overview:** financial snapshot and recent activity. Keep spending and savings distinct; do not introduce a combined number that could make separate account types look like one spendable balance.
- **Transactions:** income, expense, and transfer records; transactions can be filtered/searched. A recorded income/expense updates its associated account balance.
- **Accounts:** create and manage tracked accounts, account types, balances, optional minimum balances, and purchase allocations. Purchase funds can be shown separately from available funds.
- **Budgets:** user-defined category limits.
- **Goals:** savings goals with target and saved amounts, progress states, and a completion celebration. Goal-completion sound can be disabled in Settings.
- **Purchases:** planned-purchase list with priority, date, saved amount, funding account, category, notes, and reminders. Purchases are automatically organized rather than relying on the user to manually drag/reorder everything. Recorded expenses appear in the Purchased tile group, not a separate history; income and transfers are excluded.
- **Northstar Guide:** profile-based and record-aware planning suggestions, price-history context, and a suggested-next-moves section.
- **Settings:** Google account/cloud sync controls, optional passphrase protection, display currency, JSON backup/restore, data clearing, welcome-screen replay, goal-sound preference, and an About link to the major-update overview.

### Purchase planner — important latest behavior

This area has received multiple rounds of detailed user feedback and should not be simplified or reverted without discussion.

- Purchase tiles are compact cards intended to keep a long list manageable; completed cards are shorter on wide screens and tall enough for content on narrow phones.
- Selecting a plan tile opens its detail view. An expense-only completed tile opens the existing transaction edit form; a linked plan detail also links to its original expense.
- Active purchases are automatically grouped/sorted by priority and target date.
- Purchased items have their own **Purchased** group and a muted/greyed, locked-looking visual treatment.
- The purchased marker stays red while the rest of the completed card is muted.
- The purchased mark is animated when a card first enters the visible area. The code uses an `IntersectionObserver` and unobserves cards once shown so normal scroll revisits do not replay the animation on those same DOM elements.
- **2026-11-09 — the X took four builds. The shipped one is a compact corner badge.** The failures are worth recording because each one was only visible in a real screenshot:
  1. A full-tile `<svg>` with `preserveAspectRatio="none"` — diagonals stretched across the card, slicing the name and price, duplicated by a `×` chip and a 🔒 emoji.
  2. A ~1.4 s choreographed build (perimeter trace, stroke draws, dashed ring sweeps, glint). Progressive drawing meant the frames users actually saw were a half-drawn X, broken dashed arcs and a half-struck price.
  3. A "whole-shape" build at 52% of the card with a full-card veil — the disc blanketed the tile, the X was a small glyph in a large empty circle, the strike appeared to stop mid-price, and the veil made the name/price/Completed nearly illegible.
- **Shipped:** a 34px badge (30px under 600px) in the tile's top-right, `z-index:4`, holding a **complete circle and a complete X** — never clipped, never stretched, never dashed. No veil and no full-card overlay, so the card's own information stays readable. The price keeps its own strike line. The tile's `.purchase-tile-top` gets `padding-right` so the "Purchased" chip never collides with the badge.
- Timeline ~520 ms, once per card on first view: the badge presses in from 1.18× and light (fades 0→1, settles through 0.965), a contact echo expands off the ring, and the strike draws left-to-right at 130 ms.
- **Rules learned — do not undo:** no `stroke-dasharray`/`dashoffset` on this mark (partial arcs read as bugs); no full-card overlays or veils (they hide the price and name); the mark keeps its aspect ratio; the circle must be whole at every frame.
- **Verification was visual, not just structural.** Headless Chromium was run using `@sparticuz/chromium` and `puppeteer-core`; the temporary packages and library paths from that run are not part of the repository. Frame-by-frame screenshots at 40/110/200/320/520 ms confirmed badge opacity 0.50→0.89→0.99→1 and scale 1.18→0.99→0.97→1, strike 0→0.68→0.99→1, badge fully inside the card at both desktop (259px) and phone (174px) card sizes, chip clear of badge, price area clear, and reduced-motion rendering a static complete mark with zero animations.
- Geometry rule: the scale lives on the wrapper element (`.purchase-tile-badge`), never on the SVG child — an ancestor transform makes `vector-effect:non-scaling-stroke` degenerate in Chromium and Safari and would visibly change stroke weight mid-animation.
- The `#purchase-x-visible` class only applies when the card is observed; a purchased group below the fold renders with `opacity:0` on the badge until scrolled into view. That is intended (the mark animates on arrival), but it means a tile can legitimately look unmarked in a screenshot taken without scrolling.
- The mark is drawn with `currentColor`, so a future "completed but archived" state can print it in grey by overriding one colour. It is the deliberate exception to the monochrome palette.
- Behaviour is unchanged and must stay that way: the mark animates once when a purchased card first scrolls into view (`IntersectionObserver`, 0.22 threshold, unobserved after firing), keeps the per-column stagger via `--purchase-x-delay`, keeps the `purchase-x-visible` class hook, keeps the red `#8f2f26` accent as the one intentional non-monochrome component, keeps the muted card treatment, and honours `prefers-reduced-motion` by rendering the final mark with no animation.
- The mark CSS lives in the first `<style>` block under `PURCHASE COMPLETION — compact badge`. It uses `.purchase-tile-badge`, `.purchase-badge-ring`, `.purchase-badge-x`, `.purchase-badge-echo` and `.purchase-tile-strike` with `purchaseBadgePress`, `purchaseBadgeEcho` and `purchaseStrike`. The badge starts at `opacity:0` and the strike at `scaleX(0)` until the observer makes the card visible; the circle and X are whole shapes throughout, never dash-drawn. Do not reintroduce the old full-tile `.purchase-cross-*` art, extra glyph, or lock emoji.
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

The app was deliberately restyled to a **sleek black-and-white** identity (luxury minimalism / premium SaaS), replacing the earlier navy-and-blue fintech palette. Preserve this direction unless the user asks to change it. This section records the original restyle; section 4d describes later semantic money colors, and the completed-tile and vault layers were added afterward.

- **Where the styling lives:** the original sheet (first) is mostly structure, followed by `<style id="mono-design">` and later feature layers in `<head>`. The design layer ends with responsive re-declarations so it does not flatten the mobile layout. Add focused visual rules to the appropriate layer rather than rewriting the sheets.
- **Palette:** ink `#080808`, paper `#ffffff`, canvas `#f7f7f7`, hairlines `#e9e9e9`/`#ececec`, secondary text `#6e6e6e`–`#9a9a9a`. Every legacy hex in the file was remapped to a neutral ramp.
- **Danger and completion:** muted oxblood `#8f2f26` is used for destructive actions, errors, and the purchased X. The complete red X is an explicit user requirement.
- **Money semantics:** the original monochrome treatment was superseded by the user's request for semantic transaction colors; see section 4d. Keep the shell monochrome and preserve the financial color cues.
- **Icons:** the dock, topbar buttons, metric tiles, transaction rows, account cards, goal cards, empty states, and welcome benefits use inline SVG line icons (1.6px stroke, `currentColor`), not Unicode glyphs. The shared set is the `_ico()` helper plus the `ICON` object defined just after `esc()` in the module script. Reuse it instead of adding glyphs.
- **Brand mark:** the Northstar star SVGs (`nsBg*` / `nsStar*` gradients) are monochrome — charcoal tile (`#242424`→`#101010`) with a silver-to-white star and a hairline `#ffffff26` edge. Keep those gradient IDs intact; the avatar and breadcrumb variants are generated as strings in JS.
- **Type and detail:** Manrope for display/values, DM Sans for UI/body, tabular numerals (`font-variant-numeric`) on all money-bearing components, 14px card radius, 9px control radius, hairline borders with a barely-there shadow instead of heavy elevation, black primary buttons with white text, and 180–350ms `cubic-bezier(.22,.61,.36,1)` motion.
- **Mobile:** the black floating dock uses a white active pill. Safe-area bottom padding and the documented scroll fixes were left untouched.

**Historical verification note:** at the time of this restyle, there was no browser available, so it was validated with parsers rather than screenshots: `parse5` reported 0 HTML parse errors, `css-tree` reported 0 CSS parse errors in the then-current style blocks, and the page was served over HTTP. Later browser checks of the purchase and vault changes are described in 4j–4k; they are not a retroactive full-site visual audit.

## 4b. Liquid Black layer — motion, sound, glass (2026-11-03)

The original Liquid Black layer added `<style id="liquid-design">` in `<head>` and `<script id="liquid-runtime">` near the end of the page. Its initial commit was additive and used the app's delegated DOM events (`[data-page]`, `[data-action]`). The bullets below describe that initial design; the ambient effect and mobile performance safeguards were changed afterward (see 4h and the work log).

- **Stacking contract:** `.nsx-ambient` (z 0, drifting blurred colour fields on `#f7f7f7`) → `canvas.nsx-ink` + `.nsx-light` (z 1) → `.app-shell` (z 2). `body` background is transparent so these layers show through gaps and behind glass. The welcome screen now sits at z 3000, above the assistant; confirmation dialogs and the vault remain higher.
- **Glass:** the topbar, floating dock, modals, confirms and toasts use `backdrop-filter` blur + saturation with inset specular highlights and iridescent rim gradients. Cards stay flat and crisp on purpose — that contrast is what makes the glass read as glass. The earlier sidebar was replaced by the dock; see 4n.
- **Iridescence:** pink `#ff9ad5`, lilac `#b79cff`, cyan `#8be8ff`, mint `#a8ffd4` used only on edges, sheen sweeps, progress shimmer and the dock's active pill — never as a wash behind text.
- **Ink cursor:** a fixed canvas spawning up to 60 diffusing plumes that expand and fade over ~0.9–1.35 s, each with an iridescent fringe. Throttled to one spawn per 26 ms with **separate clocks for the spawn throttle and the rAF frame loop** (a shared variable previously froze spawning after the first frame — do not merge them again). Hidden entirely on coarse pointers and under reduced motion.
- **Motion:** `.nsx-enter` adds staggered page entrances (skipped while an input is focused); hover sheen and card lifts respect `prefers-reduced-motion`. The former count-ups on actual money values were removed in 4n so displayed numbers remain truthful. New goal, budget, transaction, and purchase feedback is presentation-only.
- **Sound:** synthesized Web Audio only — no asset files. `tap`, `tick`, `whoosh`, `close`, `success`, `purchase`, `error`, `needle`, plus an optional ambience bed (off by default). **Sound is on by default** per user request; the context is created on first gesture because browsers demand it. Mute state, volume, grain and ambience persist in `localStorage` under `northstar-fx-v1`. The topbar speaker button, `M`, and the palette all toggle it.
- **Command palette:** `⌘K`/`Ctrl+K` — 8 page jumps + 9 actions, arrow keys, Enter, Esc. Actions are executed by clicking the app's real controls, so the palette can never bypass validation.
- **Shortcuts:** `?` cheat sheet, `N` new transaction, `M` mute, `G` grain, `H`/`T`/`A` pages, `Esc` closes overlays.
- **Easter egg:** press and hold the breadcrumb logo ~700 ms — the mark melts, needle-drop plays, and a small toast appears.
- **Historical verification:** `parse5`, `css-tree`, `node --check`, and a jsdom boot harness checked the then-current layers and interactions. At that time, neither audio nor visuals were checked in a browser. Later targeted browser checks are documented in 4j–4l; the original sound design has not been audibly verified.

## 4c. Jarvis — local assistant (2026-11-03)

A floating assistant orb (bottom-right) opens a glass chat panel. Its default rules-based engine is local and needs no API key. An optional visitor-supplied cloud connection was added later (4f–4g); when enabled it can send selected data to the chosen provider. Jarvis reads the active in-memory ledger through `NorthstarLedger`; it does not scan other browser workspaces if that bridge is unavailable. The draft-only typed money-action path can fill existing app forms but never directly changes ledger state; see 4i and 4n.

- **What it can answer:** greeting/status, `roast me` (a candid, numbers-driven assessment), account-specific affordability, spending by month or merchant, income, savings rate, budgets, goals, balances and purchase plans, plus a capability list. Estimates are not bank-verified or guaranteed safe; see 4n.
- **Tone modes:** Playful, Ruthless, Coach (default) — chosen with chips in the header, persisted. The roast is generated from recorded figures, though it is a rules engine rather than a language model.
- **Voice (optional, off by default):** `speechSynthesis` replies, preferring a British male voice for the Jarvis feel; `SpeechRecognition` mic input where the browser supports it.
- **Persistence:** assistant preferences live under `northstar-jarvis-v1`; chat history is intentionally not persisted.
- **Shortcuts:** `J` toggles the panel outside text fields. Within the assistant, `Esc` closes Connections first, then the assistant, and returns focus to the corresponding control.
- **Stacking:** orb z-1500, panel z-1600 — above the mobile dock, below the command palette.
- **Local versus cloud:** the local engine works without a model provider. The optional BYOK connection sends requests directly to a provider when the visitor enables it; see 4f–4g. The separate Cloudflare Worker is not wired into the site, and its live deployment is unconfirmed. Never bundle private API keys into this public static site.

**Historical verification:** `parse5`, `css-tree`, `node --check`, and a jsdom harness checked the initial local assistant with a synthetic ledger. Spoken replies and the mic were not exercised; no audio-device test is claimed. Later targeted browser checks are documented in 4l.

## 4d. Semantic colour + Jarvis ink (2026-11-03)

The design is **monochrome chrome with colour for money only**. The user explicitly asked for transactions to have colour again; do not remove these accents without being asked.

- **Where:** `<style id="color-accents">` (five style blocks now) and `<script id="jarvis-ink">`.
- **Money colours:** income `#1a7f5a` (`--money-in`), expense `#b3402a` (`--money-out`), transfer `#2b57c4` (`--money-move`), with pale tints for pill/icon backgrounds. Applied to `.positive`/`.negative` amounts, `.type-pill.income|expense|transfer`, `.tx-icon.*`, metric tiles, and a six-hue rotating palette for the spending-by-category bars.
- **Still monochrome:** shell chrome, nav, buttons, inputs, headings, cards, tables, modals, Jarvis panel. The rule of thumb: **if it is a number or a category, colour is allowed; if it is UI furniture, it stays black/white.**
- **Jarvis panel ink (historical):** a canvas once rendered plumes inside `.nsj-panel`. It was removed when the user requested a page-wide ambient effect instead; see 4h.
- **Verification:** `parse5` 0 errors, `css-tree` 0 errors across all five blocks, `node --check` clean, and a jsdom run asserting the ink canvas mounts as the panel's first child, synthetic pointer events raise nothing, and every colour rule is present.

## 4e. Jarvis v2 — the "can't see anything" bug and the new brain (2026-11-03)

This section records the earlier implementation; 4n describes the current parsing, safety and workspace behavior.

**Critical bug that was fixed here (do not regress it):** Jarvis v1 read only `northstar-finance-v1:local`. The app actually persists to `localStorage` under **`northstar-finance-v1:<uid>` when signed in** (`localKey(user?user.uid:'local')` in `persist()`). So on any signed-in session Jarvis was reading an empty slot and reported it could see nothing.

The read-only `NorthstarLedger` bridge is defined **inside the module script** where `data` is in scope and returns the active in-memory ledger. It returns no ledger while a protected vault is locked or cloud loading is underway. An earlier fallback scanned stored workspaces and picked the one with most records; it was removed in 4n because it could expose the wrong person's workspace. If the bridge is unavailable, Jarvis now fails closed rather than guessing.

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
- Gear button `#nsjGear` in the panel header opens `#nsjSheet`, a Connections sheet rendered with the panel markup (after `#nsjFootnote`). Its close button and Escape return to the assistant; closing the assistant also closes and makes the sheet inert so it cannot block the page.
- Controls: provider select (`gemini`, `openai`, `anthropic`, `groq`, `openrouter`, `custom`), key field (`type=password`), model field, base URL (custom only), switches for Cloud brain / Remember on this device / Include transactions, buttons Save & test, Preview payload, Clear key, and a status line `#nsjConnStatus`.

**Key isolation (the important part — do not merge this into finance data):**
- Dedicated storage key `northstar-jarvis-conn-v1`, written to `sessionStorage` by default and to `localStorage` only when "Remember on this device" is on. Toggling the switch attempts to move the blob and remove the other copy. If storage fails or copies conflict, the sheet warns that a key may remain and cloud does not silently re-enable on reload; see 4n.
- It is **not** part of `data`, so it is absent from the Firestore document and from `exportBackup()` (which serialises `{...data}` only). It is stored separately in browser storage and is **not encrypted by workspace passphrase protection**. `JSON.stringify(conn)` exists solely inside `saveConn()`.
- The key never appears in the repo, in page source, or in any export. It is sent only to the selected provider (Gemini puts it in the query string; OpenAI-compatible uses `Authorization: Bearer`; Anthropic uses `x-api-key` plus `anthropic-dangerous-direct-browser-access: true`).

**Routing:** `send()` uses the cloud when `connReady()` (key + model + cloud switch on), sending a compact derived brief — month, currency, account counts/totals, this/last month income and spend, top categories, budgets, goals, planned purchases, days left, projection — never the raw ledger unless "Include transactions" is on (then at most 8 recent rows with descriptions trimmed to 40 chars). `max_tokens` ~420, 30 s `AbortController`, last 6 turns of history. Any failure (network, 401, timeout, empty body) silently falls back to the local answer and labels the message `Local fallback · <reason>`; successful cloud answers are labelled `Cloud · <provider>`.

**Guardrail:** `systemPrompt()` forbids inventing balances or transactions, requires citing brief figures, caps length at ~90 words, and states the currency.

**Also fixed here:** intent matching missed "how much can i safely spend" (it matched `spend`); `safely spend` / `safe spend` / `safe daily` were added to the `safe` intent. `brief()` and `systemPrompt()` now self-resolve a snapshot when called without one, and `callCloud()` rejects early with a clear message when the custom provider has no base URL or the provider is unknown.

**Verification:** parse5 0 errors; css-tree 0 errors across six style blocks (the new one has 41 rules); `node --check` clean; a jsdom BYOK suite with **27 assertions** using a stubbed `fetch` (sheet opens, key survives a provider switch, Save & test reaches `api.openai.com` and enables cloud, status lines update, key lands in sessionStorage not localStorage, Remember migrates it, preview payload renders, OpenAI/Anthropic/Gemini/Groq adapters each parse the right response shape, Anthropic sends the browser-access header, provider errors surface, a cloud answer renders with its `Cloud · OpenAI` label, a 401 falls back to the local engine with `Local fallback`, zero runtime errors). A separate 11-assertion regression suite re-checks the local brain (ledger visibility, category MoM, afford yes/no, safe daily, greeting, month-state reset, brief, guardrail). No live provider test or visual/interaction review was performed in that sandbox; later user testing reported a provider authentication error, as described in 4g.

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

Follow-up to the earlier Jarvis-only ink experiment: the user clarified that they wanted ink as an ambient **page background**, not in the Jarvis panel and not tied to cursor movement. Removed the Jarvis ink canvas and the global cursor light/trail. The first page-wide version was hidden because `.main-area` painted an opaque gray gradient above the background; this follow-up makes that shell surface transparent so the ink wash can show through the gutters while cards remain opaque. Three large, soft-edged grayscale clouds morph slowly behind the app shell, layered with a subtle canvas that spawns drifting gray plumes on a timer. It is independent of pointer position, pauses while the document is hidden, and becomes static under reduced-motion preferences. A later mobile-performance change disabled the expensive animated blur/ink/canvas effects on small or coarse-pointer devices. No finance/data behavior changed.

**Verification:** parse5 reported 0 HTML errors; css-tree parsed all six style blocks; both remaining runtime scripts passed syntax checks; jsdom confirmed the three full-page ink clouds and full-viewport ambient canvas mount outside Jarvis, the main-area background is transparent so the underlay is visible, and no pointer-movement handler is installed. Under reduced motion the clouds remain static and the canvas is omitted. `git diff --check` passed. A live preview can be inspected by the user; no visual QA is claimed here.

## 4i. Jarvis manual finance actions (2026-11-03)

Jarvis now recognizes a focused set of explicit money-management phrasings locally, before optional cloud routing, and fills Northstar’s existing forms as drafts. Supported actions: expenses, income, and transfers; tracked account-balance edits; creating/updating a category budget; creating a savings goal or updating its saved-to-date amount; and creating a planned purchase or editing an existing plan’s price, target date, funding account, or priority. The normal app form remains the only write path: nothing is persisted or sent to cloud sync until the user reviews and submits the existing form. Existing validation, account calculations, persistence, and sync are reused.

This is a typed local intent path, not an unlimited natural-language model and not a claim to answer thousands of distinct questions. It is deliberately not bank linking, real transfers/payments, or automatic purchase completion. Balance edits replace the manually tracked balance without creating a transaction. Goal contributions update the goal tracker only and do not move money. Purchase drafts create plans only and do not deduct balances. If required information is ambiguous or missing, Jarvis asks or leaves the account field for the user to select; it does not invent balances.

**Verification:** both runtime scripts pass Node syntax parsing. A jsdom integration harness exercised transaction, explicit-save, balance, budget, goal, planned-purchase creation/editing, transfer direction, bare-amount, and balance-question cases; it verified modal prefills and no persistence before Save. No browser visual QA or live provider call was performed.

## 4j. Completed expense tiles and finance integrity (2026-11-09)

The separate expense history/shortcut shipped in PR #20 was rejected by the user and has been removed. Every existing or future `Expense` is now projected into the existing **Purchased** tile group; income and transfers are excluded. It is a read-only projection, not another purchase or charge. Expense-only tiles open the original transaction editor. A plan and expense with an explicit `transactionId` or `purchaseId` are shown once, and the plan detail links to the expense editor. Never infer a link from matching name or amount: identical purchases can be legitimate. If a linked plan is still active, its completed expense is shown once; the plan's existing allocation still counts until its status changes, and this is explained on the page.

Completed tiles use the recorded transaction amount and actual transaction date. If the expense date is missing, the tile says **No date** rather than borrowing the plan's target date; a completed plan without a linked expense labels its own date as **Target**. The original compact, complete circled X, one-shot entry, price strike, keyboard interaction, and reduced-motion treatment remain; completed items have a local search, clearer context, a smaller wide-screen footprint, and sufficient height at 320px. Marks already seen in the current session stay settled after edits or returning to the planner instead of replaying; newly seen tiles still animate. Confirmation dialogs trap focus, and toasts avoid covering the assistant or phone navigation.

Transaction edits now preserve `purchaseId` and other existing metadata; purchase edits preserve `transactionId`, `priceHistory`, and other existing metadata. If a linked transaction is changed to Income/Transfer, the link is retained and Bought fails safely rather than recording a second expense. Transaction edits still reverse the old account effect before applying the new one; rendering never calls these actions. A stale edit form for a record that no longer exists is rejected instead of silently creating an expense or changing a balance.

**Verification:** PR #21 passed 29 focused Node tests, including read-only rendering, both link directions, identical unlinked expenses, actual/missing/malformed dates, stale edit forms, price history, reclassification, transfer edits, one-shot marks across rerenders, and no duplicate charge after editing and toggling status. The later follow-up added six more tests (4l). Headless Chromium with fictional data exercised desktop/phone tiles, editable expenses, search, keyboard activation, screenshots at 320/390/1440 CSS pixels, animation-frame badge geometry, a 500-tile filtered re-render, toast placement, focus trapping, and reduced motion. Scoped axe reported no definite violations after fixes; color contrast remains partly incomplete. No physical iPhone or live Firebase was tested.

## 4k. Optional protected workspace (2026-11-09)

Protection is **off by default**; no existing data is encrypted until the user explicitly enables it in Settings. Setup currently requires HTTPS, Web Crypto, Web Locks, Google sign-in, and a successfully synced cloud document. It warns about unrecoverable passphrases, requires explicit acknowledgement, and asks the user to close other tabs/devices. `vault-crypto.mjs` uses PBKDF2-SHA-256 (600,000 iterations, random salt) to derive a non-extractable AES-256-GCM key; every save gets a random 96-bit IV and authenticated ciphertext. The passphrase is not persisted or deliberately sent to Firebase.

The encrypted device copy is `northstar-vault-v1:{uid}` and an active-workspace marker makes the app lock before financial UI renders on reload. The lock screen can unlock the device offline; the Jarvis bridge returns no ledger while locked. Auth account mismatch never uploads the protected workspace to a different UID. A new device unlocks the existing cloud envelope and retains any older plaintext browser workspace. Protected JSON backups use the same passphrase; an emergency encrypted export can include unsaved in-memory changes. Plaintext exports and restores into an unprotected workspace are explicitly warned about.

Setup stages and verifies device ciphertext before replacing the entire Firestore document, without `merge:true`. Cloud writes serialize and compare a canonical fingerprint of the observed document inside a Firestore transaction; unsupported values and unsafe integers fail closed, and ordinary plaintext writes use Firestore's native merge to preserve unrelated fields. Conflict, mixed/invalid ciphertext, account changes, storage failures, and uncertain results pause sync instead of silently overwriting. Device writes serialize, use Web Locks, compare the previous stored envelope, and surface quota/cross-tab failures. If setup fails after staging, both old plaintext copies and the encrypted stage are retained; cloud protection is explicitly unconfirmed until reviewed/retried. Setup can optionally remove only exact matching old browser copies **after** both new copies are confirmed. Distinct local workspaces, downloaded backups, other browsers/devices, and provider backups/history may remain unencrypted.

The updated `firestore.rules` add a protected-document update guard intended to reject older clients that merge plaintext into an encrypted document. They must be published and tested in Firebase separately; neither their deployment nor actual live Firestore behavior has been verified. Do not claim a security audit, independent cryptographic review, recovery of lost passphrases, protection against malicious code/extensions/unlocked devices, rollback of an older valid ciphertext, or protection of historical provider backups. The optional Jarvis cloud feature can still send selected data when the user enables it.

**Verification:** Node tests cover crypto round trips, unique IVs, wrong passphrases, tampering, strict envelope format, plaintext merge preservation, SDK-value fingerprints, transaction retries, full encrypted replacement, mocked server conflicts, account switches, queued writes, storage quota, and local copy conflicts. An offline check with the real Firebase SDK 13.1.0 verified merge field masks and fingerprints for its timestamp, geopoint, bytes, reference, and vector values; it did not contact Firebase. Headless Chromium used a **mocked** Firebase SDK to exercise explicit opt-in, cleanup, wrong/right unlock, protected edits, failed cloud conversion and explicit retry, divergent cloud copies, a new device, storage quota failure, emergency encrypted export, encrypted restore, cross-tab device conflict, and flushing an immediate edit before locking or sign-out. No live Firebase project/rules, independent security audit, or physical phone was tested. A real Firebase test project and security review are recommended before trusting real financial data.

## 4l. Major-update write-up and interface follow-up (2026-11-09)

PR #21 is labeled **major update**. The root [two-page overview](MAJOR-UPDATE.md) explains its purchase tiles, financial integrity, optional passphrase protection, backups, and security/verification limits. README, Worker notes, the welcome badge, Settings → About, and the app footer now point to or accurately summarize the update. The optional Jarvis connection's text distinguishes local answers from requests sent to a provider and clarifies that its separately stored key is not protected by the workspace passphrase.

While checking the new copy, a browser test found that closing Jarvis with Connections open left an invisible sheet able to intercept mobile taps. The sheet now has its own close button, becomes inert when closed, closes with Escape, and restores focus. The assistant panel itself is inert when closed and cannot open behind the welcome or a locked vault. Welcome dismissal is now remembered on reload, replay remains available in Settings, and the welcome overlay sits above the assistant so it does not cover the introduction. The welcome update badge remains visible on narrow phones; footer padding leaves room for the assistant orb. No purchase, balance, encryption, or sync logic was changed in this follow-up.

**Verification:** all 35 Node tests pass, including six release/interface checks. HTML parsed with no errors, all eight CSS blocks and five inline scripts were checked, module/Worker syntax and local Markdown links passed, and `git diff --check` was clean. Headless Chromium checks at 320, 390, 768, and 1440 CSS pixels covered screenshots, welcome reload/replay, keyboard focus and activation of the Settings link, Connections close/Escape/focus, tap-through after closing, footer spacing, and expense tile search/editor without ledger changes. Normal-motion badge frames at 320 and 1440 pixels and reduced-motion layouts were checked. A synthetic encrypted device copy was also unlocked with both first-visit and returning welcome states, after a wrong-passphrase check. Firebase was stubbed for these browser checks; no live Firebase, live AI provider, physical iPhone, or independent security review was performed.

## 4m. Intro access on phones (2026-11-09)

The user clarified a new report: the **intro**, not necessarily the main page, prevented them from reaching Northstar. Previously the first button only scrolled to the journey and the dismiss button was at the bottom. The original iPhone-specific cause was not established: simulated Chromium touch swipes also worked before this change, while automatic focus could move the intro down on short/landscape screens.

The intro now has a prominent **Enter Northstar** button pinned above a separate native touch-scroll area, so entering never requires a swipe. The optional Explore button and bottom action remain; progress/reveals use the new scroller. The toolbar accommodates safe areas and short screens, initial focus no longer scrolls the journey, keyboard focus stays in the dialog, background navigation is inert, and Settings replay restores focus on exit. Dismissal remains a browser-local preference, and the intro can be dismissed during an unresolved cloud load without permitting background edits. A locked vault still takes precedence. Blocked preference writes do not prevent entry, but cannot persist dismissal; an unreadable vault marker still fails closed rather than assuming there is no protected workspace.

**Verification:** 43 dependency-free Node tests and 11 optional headless Chromium scenarios cover simulated touch swipes in both directions and to the bottom, entry without scrolling at 320×240 through desktop sizes, landscape/rotation, main-page scrolling, replay/reload, keyboard and reduced motion, blocked preference writes, unreadable vault storage, synthetic encrypted device unlock, and pending/offline or encrypted cloud results. Finance records stayed unchanged in the tested flows; external services were blocked or mocked. Scoped axe checks reported no definite violations, with some contrast checks incomplete. A WebKit renderer was attempted but could not run because its native dependencies were unavailable. **No physical iPhone or Safari test was performed, and the original iOS failure is not confirmed fixed until the user tries the deployed site.**

## 4n. Glass dock, Jarvis and financial motion (2026-11-09)

The user chose a floating, Apple-inspired glass dock on both desktop and phone instead of the sidebar. The dock directly exposes all eight sections on wider screens; at 700px or narrower it shows Home, Activity, Goals, Plan, Guide and More, with Accounts, Budgets and Settings in More. The current section and reminder count remain accessible; More supports keyboard focus, Escape, outside dismissal and resize. Safe-area padding, a scrollable short-screen menu, the assistant orb, and toasts are arranged to avoid blocking the controls. `#glass-dock-design`, `renderDock`, `positionDockIndicator`, and `setDockMore` are the relevant landmarks; the old sidebar markup is gone.

Jarvis has a larger responsive panel, suggestion chips, quick draft buttons, an accessible scrollable conversation and a clear-chat button. Local follow-ups retain the relevant account or month, recognize merchants and categories, and preserve cents and numeric names. Affordability asks for a specific account, then subtracts its configured minimum and active purchase allocations; it never presents combined accounts as spendable cash. Responses disclose that future obligations and actual bank balances are not verified. Daily estimates and over-allocated accounts disclose recorded shortfalls rather than hiding them behind a zero. Requests that are ambiguous ask for details or leave fields unset. Transactions, transfers, account balances, budgets, goals, and purchase plans still open the real form for review; no ledger change happens before explicit Save. An open finance/confirmation dialog cannot be displaced by assistant, navigation, or command-palette shortcuts.

The assistant reads only the active in-memory ledger and is unavailable while the welcome, vault lock, or cloud loading blocks the workspace. Closing the panel, changing account/workspace, or clearing the chat cancels or ignores stale cloud requests and tests. Save & test discloses that it sends the key and finance summary; the optional recent-transactions setting also sends date, type, amount, category and description. Provider errors redact the literal and URL-encoded key. Connection storage checks both the chosen store and removal from the other store; failures and conflicting copies are surfaced, and cloud is not silently re-enabled from conflicting/unreadable copies. The key remains separate from workspace encryption and backups; no provider call was tested live.

`#finance-motion` and `#finance-motion-runtime` add goal-marker and budget progress transitions, a transaction toast cue, and a planned-purchase move into the completed list. They only affect presentation and do not alter balances or records. Money-value count-ups were removed to avoid briefly displaying fictional values. A goal celebration for a protected workspace waits for the encrypted device save and is skipped on failure or a stale workspace/goal. Reduced motion suppresses the new movement. Preserve the accepted compact red purchased badge, its once-per-seen behavior, and all transaction/link safeguards in 4j.

**Verification:** 53 dependency-free Node tests, nine optional interface Chromium scenarios, and 11 welcome Chromium scenarios passed. Interface checks exercised all eight sections at 320×240, 320×568, 390×844, 667×375, 844×390, 768×1024 and 1440×900; More keyboard/resize, reviewable drafts, finance motion and reduced motion, encrypted-device save success/failure, mocked provider cancellation/errors, account changes and blocked connection storage were covered. HTML/CSS/inline JavaScript parsing, duplicate-ID checks, and `git diff --check` passed. Scoped axe runs on the dock, More, assistant and Connections at 320×240, 390×844 and 1440×900 reported no definite violations; some contrast checks were incomplete. All browser services were mocked or blocked. **No physical iPhone, Safari, live AI provider, or live Firebase test was performed.**

## 4o. Removed AI-reader notices (2026-11-09)

At the owner's request, both the inline AI-reader comment and the separate legacy notice were removed. They did not implement website access control, and removing them does not alter the finance app's logic. Previously published versions can still remain in Git history and existing copies.

## 4p. Financial graphs across Northstar (2026-11-09)

PR #28 adds graphs without changing the ledger, saving projections, importing a chart library, or contacting an external data service. Models in `finance-graphs.mjs` consume the active in-memory workspace; renderers in `financial-graphs-view.mjs` escape labels and expose exact values as text or tables. `financial-graphs.css` is a required static asset, not a build output. The HTML only wires these pieces into existing pages and keeps goal what-if inputs in transient UI state.

- **Overview:** six calendar months of valid recorded income and spending, excluding transfers; current-month expense categories.
- **Transactions:** income, expense, and transfer amounts with valid numeric values for the current search and filters. Transfers are counted once, not as income or spending.
- **Accounts:** three months of valid recorded inflows/outflows for each individual account, with transfer sides attributed to the correct account. These are flows, not reconstructed bank balances.
- **Budgets and Goals:** validated current-month category spending versus limits; goal progress plus an optional comparison of up to two explicitly entered monthly contributions, assuming no interest or fees. Scenarios neither check cash availability nor move money; inputs are transient and reset on page rerender.
- **Purchases:** active planned-purchase funding, not bank funds or completed expenses; each purchase detail has an equally spaced timeline of manually logged price checks, not a live retailer feed or a forecast.
- **Guide and Settings:** saved income, bills, and cushion with any arithmetic shortfall, not actual transactions or a verified balance; active workspace record counts, not monetary totals. Imported profiles missing a buffer retain that absence during normalization and are not graphed as though the Guide's existing form default were saved. The form's default remains unchanged; users should review it before saving.

Strict graph validation can make a graph differ from older list/card calculations when imported records have malformed dates or amounts. Excluded entries and capped marks are disclosed; totals and differences use cents, and magnitudes that cannot retain cent precision are not presented as exact. The UI includes honest empty states, exact-value alternatives, and legends so color is not the only signal. Motion is presentation-only: the graph is marked seen when its entrance actually starts, preventing auth/sync rerenders from consuming the animation before paint. Reduced-motion turns it off, including mid-animation.

**Verification:** 76 dependency-free Node tests, 11 synthetic/mocked graph Chromium scenarios, nine interface Chromium scenarios and 11 welcome Chromium scenarios passed. Graph checks covered 320, 390, 768 and 1440 CSS-pixel widths, duplicate IDs, filter/Save/read-only behavior, a missing imported Guide buffer, keyboard controls, long escaped labels, empty and invalid data, and reduced motion. HTML, CSS and inline scripts parsed without errors, and `git diff --check` passed. Scoped axe found no definite violations but returned 10 incomplete/manual-review results on translucent surfaces; a separate conservative opaque-background contrast check passed, not a complete accessibility audit. External services were mocked or blocked; no physical iPhone, Safari, live AI provider, or live Firebase/rules test was performed.

## 4q. Garage-inspired entrance (2026-11-09)

At the user's request, the existing **Enter Northstar** action now feels like opening a luxury garage: a dark, paneled shutter carrying the Northstar mark lifts away to reveal the actual app beneath it. The bottom intro action and Escape use the same transition. It is a CSS-only visual treatment with no sound, external image, fake financial data, or change to the ledger; it takes about 1.3 seconds and the app remains inert until it finishes. The pinned entry and native intro scroller remain in place. The animation only plays when the intro is shown; Settings can replay it.

The shutter is decorative and hidden from assistive technology. Focus stays in the intro while it opens and returns to the dashboard or replay control afterward. Reduced motion skips the reveal, including when the preference changes mid-animation. A replay cancels a pending entry; a locked vault and unresolved cloud load still prevent editing. The implementation landmarks are `#welcome-garage-motion`, `.ns-garage`, `dismissWelcome`, and `clearWelcomeMotionListener`.

**Verification:** 77 dependency-free Node tests and 14 welcome, nine interface, and 11 graph Chromium scenarios passed with external services mocked or blocked. Synthetic phone/desktop frames were inspected; browser tests covered a short viewport, keyboard focus, storage failures, reduced-motion changes, replay, and encrypted cloud data arriving during the animation. HTML, CSS, inline JavaScript, duplicate-ID and diff checks passed. No physical iPhone, Safari, live Firebase/rules, or independent accessibility/security review was performed.

## 4r. Icon-only Home shortcut (2026-11-09)

The top-left compass **icon** is a native, labeled button for the existing Home/Overview destination. The adjacent NORTHSTAR word remains plain text, with no onboarding hint. The icon has subtle hover/press feedback and a 44px target; Home briefly highlights in the dock after activation. Reduced motion keeps a short static highlight and disables scaling/transitions. A second activation restarts the timer, and navigating elsewhere clears it.

The header is sticky at desktop as well as phone widths, so the shortcut can be reached without first losing the current scroll position; scroll padding keeps focused or scrolled-to controls clear of it. At the narrowest widths the page name is omitted from the breadcrumb to make room for the wordmark and header controls; the page heading and active dock item still identify the destination. From another section, the shortcut uses the existing navigation and moves focus to the Overview heading. On Home it does not rerender or scroll, and it closes an open More menu. It is blocked behind unfinished financial forms, confirmations, welcome, vault lock, and pending sync; it neither saves nor changes financial data.

**Verification:** 30 focused Chromium scenarios, 83 dependency-free Node tests, and 14 welcome, nine interface, and 11 graph Chromium scenarios passed. The focused checks used synthetic records, covered seven source sections, 320px through desktop and short/landscape viewports, keyboard and accessibility-tree semantics, hover/press feedback, scroll preservation, repeated highlights, reduced-motion changes, unclickable text, modal drafts, intro, pending mocked sync, and encrypted vault lock. External services were blocked or mocked; this is not a physical-phone, Safari, screen-reader, live Firebase/rules, or independent accessibility/security audit.

## 4s. Stocks replace Guide in the dock (2026-11-09)

The user asked for a stock watchlist in place of the Guide, chose a **curated 100-stock list** (not the S&P 100) and preferred a free solution. `Stocks` replaces the main dock and command-palette Guide entry. Existing Guide profile/memory and the complete local planner/graph are retained at **Settings → Saved Guide profile**. The welcome copy now describes Stocks. No share holdings, trading, bank integration or invented prices were added.

- `stock-watchlist.mjs` contains 100 distinct curated U.S.-listed tickers/names, syntactic symbol validation, feed parsing and an injectable scheduler. `stock-watchlist-view.mjs` safely renders the page and quote cells; `stock-watchlist.css` supplies responsive styles. No provider key is in source.
- Symbols can be searched, added or removed (up to 200 total) and reset after confirmation. An explicit empty list stays empty. Custom symbols are not exchange-validated, and starter names are static. The customized list is stored in `settings.stockWatchlist` using the normal ledger, backup, vault and cloud paths; simply viewing the defaults does not write data. A default `null` value represents the display-only starter list. Clearing the workspace or restoring a backup without a saved list explicitly stores the 100 starters, so Firestore merges replace an earlier list and an offline clear/restore is meaningful during later sync. `hasRecords` treats a saved list (even empty) and saved Guide-only data as meaningful for sync conflict detection. Different meaningful local and account-device copies require an explicit choice; after deferral the account copy stays editable and the choice is offered again on retry. A device copy changed during a choice is checked before cloud/local writes.
- Visitors must supply their own Finnhub key. It and price values exist only in tab memory, never in finance backups, browser storage or Firebase. It is cleared on disconnect, reload, account change, restore, or clear; switching away from Stocks pauses the feed but retains it. Requests go directly to Finnhub over HTTPS and include the key in request/WebSocket URLs; browser tools, extensions or provider logs can see it. Do not ask users to paste keys into chat or commit them.
- The free plan is advertised for personal use, with 50 WebSocket symbols, 60 API calls/minute and one socket per key; verify current [provider pricing](https://api.finnhub.io/pricing), licensing and exchange rules. Northstar requests 50 at a time, rotates every minute, spaces snapshots at least 1.5s apart, and refreshes each after ~15min. Initial 100 snapshots take ~2½ minutes or longer. Manual refresh is limited to once per minute per tab. Rate limits, `Retry-After`, timeouts, 401/403, unavailable symbols, reconnect backoff, visibility, workspace locks and stale/out-of-order data are handled explicitly. Another tab/app can share the quota and interrupt the one-socket connection.
- Only a recent trade for a currently subscribed symbol is labeled live; other trades/snapshots include provider timestamps, and zero/invalid data produces no price. A text-only timer updates an aging live label even if no further provider messages arrive. Prices are USD regardless of finance display currency. Extended-hours/special-condition trades may differ from official closing or executable prices. Snapshot change uses the provider's snapshot previous close, never a stale baseline combined with a new trade. Do not imply 100 simultaneous real-time streams, full coverage, verified bank balances or investment advice.
- Verification: 102 dependency-free Node tests and 21 synthetic stock Chromium scenarios cover 100 starters, management, responsive layout, keyboard/axe, mocked provider stream/snapshots, expiring live labels, rate limiting, privacy, clear/restore/account changes, encrypted local saves and mocked sign-in conflicts including changed-source/device races and Firestore-style merge behavior. Axe reported two incomplete/manual-review results for the stock page. **No live Finnhub key, browser CORS against the real service, real market feed, live Firebase/rules, physical iPhone or Safari was tested.** Let the user enter their own key directly in the app for a personal live check; never solicit it in chat. Code in the working branch is not yet deployed to GitHub Pages.

## 4t. Sync diagnostics and phone error codes (2026-11-16)

The user reported that on an iPhone a **sync conflict error** showed only that sync "requires attention", with no error code after that. The old build did pause safely, but the reason could not be read: on a phone the header status text is capped at 74px (and hidden below 380px), so `Cloud sync needs attention · <code>` was ellipsized to `Cloud sync n…`; several catch paths set a status without any code at all; and the only other feedback was a toast that disappeared after 3.5 seconds.

What changed:

- **One recorded issue per device.** `reportSyncIssue(error, stage)` stores `{code, stage, message, at, mode, online}` under `northstar-sync-issue-v1` and renders a banner under the top bar with the stage, the reason, the code and the time. It is restored on reload (`restoreSyncIssue()`), so a code survives the moment the toast disappears and can be copied later. `clearSyncIssue()` runs on every confirmed successful load or save.
- **Codes everywhere.** `syncFailureStatus(stage, error)` produces `"<stage> needs attention · <code>"`, and every paused-save, paused-load, protection, sign-out and sign-in failure now reports through `reportSyncIssue` instead of a bare "needs attention". `firebaseErrorCode` no longer returns `unknown-error`: Firestore/auth codes are preserved, a missing code becomes `northstar/app`, and an offline device reports `northstar/offline`. `firebaseErrorDetails` keeps its hint, always appends the code, and now appends the underlying message for known codes too. New hints cover `northstar/conflict`, `northstar/offline`, `northstar/app`, `auth/popup-blocked` and `auth/operation-not-supported-in-this-environment`.
- **Readable on a phone.** The banner is dismissible (session-only) and has a **Details** action; Settings has a **Sync diagnostics** panel showing code, stage, reason, time, workspace mode, connection state and whether the cloud copy loaded, plus **Sync details** and **Retry cloud sync**. The details dialog shows a read-only textarea (select-and-copy works when the Clipboard API is blocked) and a copy button. Diagnostics deliberately contain no email address, user ID or finance records.
- **iOS sign-in hardening.** `signInWithPopup` is unreliable in iOS Safari and in an installed home-screen app, and a blocked popup used to leave only a paused status. `prefersRedirectSignIn()` now chooses `signInWithRedirect` for iOS/standalone, popup failures with `auth/popup-blocked` / `auth/operation-not-supported-in-this-environment` / `cancelled-popup-request` fall back to a redirect, and `initFirebase` surfaces `getRedirectResult` failures with a code.
- **Transient recovery.** `maybeAutoRetrySync()` retries only explicitly transient codes (`unavailable`, `deadline-exceeded`, `cancelled`, `northstar/offline`, `auth/network-request-failed`, `auth/timeout`, `auth/web-storage-unsupported`) on `online`, on returning to a visible tab, and on a back/forward-cache `pageshow`, at most once per 20 seconds. A conflict still pauses, because every write remains a conditional transaction that re-checks the fingerprint.

Follow-up (same day): the owner reported the exact state this section targets — "Google sign-in succeeded, but Northstar has not confirmed a successful cloud sync" — with no code. That state could previously have **no** recorded error at all: `onAuthChanged` and `syncProtected` bail out silently when a newer auth event bumps `cloudEpoch`, leaving `cloudLoaded === false` and `lastSyncError === null`. `confirmSyncOutcome(stage)` now runs in both load `finally` blocks and records `northstar/app` with "Google sign-in completed, but Northstar could not confirm the cloud copy. Nothing was uploaded or overwritten." whenever a load ends unconfirmed. Settings also gained **Check cloud access** (`checkCloudAccess()`): one server read of the signed-in user's own document, mapped to the real code (`permission-denied` → publish the rules; `not-found`/`failed-precondition` → create Firestore/check the project; `unavailable` → network), shown with the configured project and database so a wrong-project mismatch is visible. It proves read access only, clears a stale access-related code, and never sets `cloudLoaded`. The Settings paragraph now always points at the diagnostics instead of dead-ending.

Verification: 112 dependency-free Node tests pass, including `tests/sync-status.test.cjs` (code normalization for conflicts, Firestore, generic and offline errors; status text and details contain the code; the record persists across a simulated reload and clears on success; dismissal keeps the code; diagnostics contain no account or record data; an unconfirmed load always records a code; `checkCloudAccess` maps `permission-denied` and conflicts, clears a stale access code and confirms a missing document; the old code-less status strings are gone and the redirect path exists). The settings panel and the details dialog were also exercised with a stubbed DOM (render, close, clipboard payload). No physical iPhone, Safari, live Firebase, or deployed-rules test was performed; the original iPhone conflict cause is still unconfirmed, and the new code display is what should identify it next time.

## 4u. Stocks save line: does the watchlist reach the cloud? (2026-11-16)

The owner reported "the stock market doesn't save to cloud". That sentence fits several different situations, and **the sandbox cannot tell which one the owner saw**, so this change makes the app say which one applies instead of assuming.

What was established (code review plus mocked tests, not live):

- The watchlist is `settings.stockWatchlist` in the normal workspace. Every add, remove and reset goes through `saveStockSymbols` → `persist()`, which queues a Firestore write only when `user && cloudLoaded`. With a mocked confirmed sign-in, each edit reached the cloud document and a fresh second device showed it. No stock-specific code bug was found.
- The likeliest real cause is a sync that is **not confirmed** (the unresolved iPhone problem from 4t): the edit then stays in this browser, and nothing on the Stocks page said so. Other things that look the same: not being signed in (a different browser or device shows its own list), and an untouched list being stored as `null` on purpose, so the Firestore console shows no tickers until the first edit.
- The Finnhub key and prices are memory-only by design (4s). They are never saved anywhere, so they are gone after a reload or on another device. This is the one thing that genuinely "does not save to the cloud", and it is deliberate.

What changed:

- **Save line under "Your watchlist"** (`stockSaveStatus`, `renderStockSaveStatus` in `stock-watchlist-view.mjs`; `stockSaveState` in `index.html`). It is derived from the live sync variables and never claims the account copy unless `user && cloudLoaded && !lastSyncError` and nothing is in flight. States: not signed in, checking sign-in, loading, saving, paused (with the recorded code and an **Open sync diagnostics** button), Firebase unavailable, starter list not yet customised, and confirmed (with the confirmation time, and "encrypted with your passphrase" for a protected workspace). The code is printed in the line because the header text is truncated on phones.
- **Toasts say where the edit went.** `stockSaveSuffix()` appends "saving to your account…", "saved on this device only" or "saved on this device only; cloud sync is paused". The protected-workspace wording is unchanged.
- **In-place updates.** `setSync` calls `updateStockSaveStatus()`, which rewrites the line only when its content changed. `cloudSaving`, `cloudSaveTicket` and `cloudSavedAt` are display-only state; `cancelCloudSave()` replaces the bare `clearTimeout(saveTimer)` calls so a cancelled save can never leave the line on "Saving…", and an older write finishing never marks a newer pending edit as saved. `authResolved` records that Firebase has reported the sign-in state at least once, so a signed-in visitor does not briefly see "Sign in".
- **Bug fixed on the way.** After every cloud save succeeded or failed, `queueCloudSave` called a full `render()`. On the Stocks page that re-created the search and add inputs about a second after each edit, dropping focus and any text typed in the meantime. `renderAfterCloudSave()` now skips that render on Stocks (the line updates itself). The new scenario "typing in the search box survives a cloud save" fails if the old behaviour returns (checked by temporarily restoring it).
- **Nothing about the key or prices changed.** The key is still tab memory only and is not in the ledger, backups, assistant or Firebase. A design that remembered or synced the key was written and then deliberately **not shipped**: stored inside the workspace it would sit in the Firestore document in plain text for anyone not using passphrase protection. The existing precedent is the assistant's provider key (4f): session storage by default, a per-device "Remember on this device" switch, and never in the Firestore document or backups. Remembering the Finnhub key therefore needs an explicit owner decision between (a) that same per-device switch, (b) syncing it only inside a passphrase-protected workspace, and (c) workspace-wide. Do not add it without that decision.
- **Test harness fix.** PR #30 made `initFirebase` call `getRedirectResult`, which none of the five Chromium suites' fake `firebase-auth.js` defined. Firebase therefore "failed to load" inside the tests, the header showed a long error label, and `tests/home-shortcut-browser.cjs` failed at 381px. The mocks now define `getRedirectResult` (resolving `null`, like the SDK with no redirect pending). Not an app bug. Separately noticed and **not changed**: at exactly 381px the ordinary signed-in label "Cloud sync on" is 74px wide and pushes the NORTHSTAR word about 7.5px past its box (no squeeze at 390px and wider; the label is hidden at 380px and narrower). That layout scenario only measures the signed-out "Local only" label (64px), so it does not see this. The 74px cap and the label text pre-date this work.

Verification (sandbox, mocked Firebase and Finnhub; **no physical iPhone, Safari, live Firebase, deployed-rules or live-Finnhub test**): 126 dependency-free Node tests pass, including `tests/stock-save-status.test.cjs` (the production wiring run against fake sync state, a fake clock and fake writes; five deliberate mutations of the production code were each caught). The 32 stock Chromium scenarios pass (11 new: signed out, confirmed sync with a second device, paused sync with the diagnostics link and a retry that uploads the waiting edit, a failed write after confirmation, typing surviving a save, a save dropped by an outside sign-out, Firebase SDK blocked, a protected workspace with no cloud copy, a protected workspace saving encrypted, layout at 320/390/768/1440 with 44px targets, and scoped axe in the neutral, confirmed and paused tones). The graph (12), interface (9), welcome (14) and Home shortcut (30) suites also pass.

## 4v. A paused sync that is waiting for a choice (2026-11-17)

> **Superseded in part by 4w.** The sticky backdrop described below (a tap outside ignored) was removed after it left a phone frozen behind a dialog it could not see. The half-second guard, the safe focus, the counts and the pending-choice buttons remain; the three buttons now carry `data-action="choose-sync-data"` instead of `retry-sync`.

After 4u the owner said they meant that **watchlist edits do not reach Firestore or another device**, and sent a phone screenshot of Settings → Sync diagnostics. It showed code `northstar/conflict`, stage Cloud sync, reason "Choose which data to keep to resume cloud sync.", workspace "Signed-in workspace (plaintext)", connection Online, cloud copy **Not loaded**, project `northstar-personal-finan-ca543`, database `(default)`, and the last check "Read access confirmed". Its header read "Cloud access confirmed" in the ok state.

Reading of the screenshot (from the code, **not observed live**):

- When the owner signed in with Google, the account's cloud document and this browser's data both held records and differed, so `onAuthChanged` asked which to keep ("Choose which data to keep": Use cloud copy / Keep this device / Decide later). The dialog was closed without a choice. **Decide later**, a tap on the dimmed area and Escape all resolve `null`, which records `northstar/conflict`, leaves `cloudLoaded` false and pauses sync on purpose. `persist()` queues a cloud write only when `user && cloudLoaded`, so every edit, stock edits included, stayed on the phone. Nothing was uploaded, replaced or lost.
- "Read access confirmed" rules out the Firestore rules, the project, the database and the network for reads. It does not test writes.
- **Why the dialog was closed is unknown** (a stray tap is plausible; the access check ran two seconds after the code was recorded). **Which copy holds the owner's real data is also unknown and is their decision.** The sandbox cannot see either copy.
- The access check set the header to "Cloud access confirmed" while sync was still paused, which reads as "sync works". That was misleading.

What changed (all in `index.html` unless noted):

- **The three "which copy to keep" dialogs cannot be dismissed by a stray tap.** `showNorthstarDialog` takes `sticky:true`, used by 'Choose a device workspace', 'Choose which data to keep' and 'Protected copies are different'. A tap on the dimmed area is ignored (`confirmSticky`), and every choice button ignores taps for the first 500 ms (`confirmArmedAt`), so a double tap on the button that opened the dialog cannot land on a choice that replaces data. Escape and **Decide later** still work and still change and upload nothing. The dialog sets `data-ready="true"` at 550 ms. Initial focus is on **Decide later** (`focus:true` on that choice, opt-in per choice) instead of the first, data-replacing, button. Buttons are 46px tall (`confirm-dialog-choice`) and were checked reachable at 320x568.
- **Both copies are described.** `describeWorkspace(d)` returns counts only (transactions, accounts, budgets, goals, planned purchases, the length of a custom stock list, or "only settings or a saved Guide profile" / "no records"), never amounts, names or notes. `cloudSavedLabel(raw)` appends "(last saved Nov 15, 9:12 PM)" from the document's `updatedAt`, which the app writes as `Date.now()` (epoch milliseconds, no Firestore server timestamps), and is blank when absent or not a number. A note says when the counts match but the contents differ.
- **A pending choice is visible and one tap away.** `syncNeedsChoice(issue)` is true only for code `northstar/conflict` with a message starting "Choose which" or "Choose a", so a write that lost a race ("changed in another tab") is **not** treated as a pending choice. When true: the banner under the header gets a primary **Choose which data to keep** button (`data-action="retry-sync"`); Settings → Sync diagnostics shows `.sync-choice-note` and the same button instead of "Retry cloud sync"; the Stocks line says "Cloud sync is waiting for you to choose which data to keep (code)" with a button for the same action (`needsChoice` and `command` in `stockSaveStatus`, `stock-watchlist-view.mjs`); copied diagnostics end with the matching instruction. `retryCloudSync` re-runs `onAuthChanged` while `!cloudLoaded`, which asks again.
- **Deferring explains itself.** The plaintext cloud chooser's Decide later toasts "Choice deferred. Nothing was changed. Tap Choose which data to keep when you are ready."; the device-workspace chooser toasts "Choice deferred. Showing the account device copy; your other copy was kept."
- **Honest header after Check cloud access.** `checkCloudAccess` keeps `syncIssueStatus(syncIssue)` in the err state while an issue remains ("Sync conflict · action needed · northstar/conflict"); it only says "Cloud access confirmed" when no issue is left. A successful read still does not resolve a conflict, and a stale non-conflict issue is still cleared as before.
- **Contrast in the diagnostics panel.** An axe check of this panel failed WCAG AA contrast, including on the new note. The detail labels written for 4t (#8a8a8a, 3.45:1) are now #666, and the panel's subtitle and hints are #666 (`#syncDiagnosticsPanel` scope), the new note #4d4d4d. The legacy global greys (`.panel-head p` #8f8f8f, `.form-hint` #9a9a9a) are used across the whole app and were **not** changed; they still fall below 4.5:1 elsewhere, and only the areas named in the new axe scenario were audited.
- **README defect from 4u fixed.** PR #31 overwrote the sentence "The provider integration has only been tested with mocked responses, not with a live Finnhub account or a real exchange feed." in the ticker-list paragraph (found with `git log -S`; it came from commit `bb282bc`). It is restored.

Not changed, on purpose or as a known gap:

- **No copy is ever chosen automatically.** Nothing here weakens "no copy is overwritten without the owner's choice".
- The protected chooser got the sticky backdrop, the tap guard and the safe focus, and its Decide later reaches the same banner button and Stocks line, but it shows **no confirmation toast** and has **no Chromium scenario**: a differing protected cloud copy needs a second encrypted envelope under the same key, and the existing vault test stubs the dialog. It is covered only by source-level checks of the shared dialog code.
- The 381px header residual from 4u and the long "Firebase unavailable" header are unchanged.
- The Finnhub key and prices remain memory-only. Remembering the key is still an undecided owner question (4u) and was not built.

How the owner resolves their phone: Settings → Choose which data to keep (or the button in the notice or on the Stocks line). **Use cloud copy** if the account's data is the real data; it replaces what the phone shows. **Keep this device** if the phone's data is the real data; it uploads and replaces the cloud document. If unsure, Settings → Export backup first. Afterwards the header says "Cloud sync on" and the Stocks line says "Saved to your Google account".

Verification (sandbox, mocked Firebase and Finnhub; **no physical iPhone, Safari, live Firebase, deployed-rules or live-Finnhub test**): 132 dependency-free Node tests pass (6 new: the pending-choice predicate and header text, the banner button and copied details, the access-check header, counts-only summaries and the saved-time label, the sticky/guard/focus source checks, and the Stocks line wiring). The 36 stock Chromium scenarios pass (4 new: a differing account copy shows both counts, ignores a tap outside and an immediate tap, defers with a one-tap way back and each choice does what it says; the device-workspace chooser; the dialog at 320x568 with Escape; scoped axe on the dialog, notice, Stocks line and panel). The graph (12), interface (9), welcome (14) and Home-shortcut (30) suites pass. Sixteen deliberate one-line mutations of the production code were each caught by a test. The app was not driven by a person on a phone, so how the dialog feels to tap on a real device is unverified, and the cause of the original dismissal remains unconfirmed.

## 4w. The "which data to keep" question did not appear on the phone (2026-11-17)

After 4v shipped (PR #32), the owner sent an iPhone screenshot (1170x2532) and said that choosing a copy "just shows up with this screen and freezes", and guessed that either "use cloud copy" was not loading or the dialog was not appearing. The picture shows only Settings, dimmed and blurred, with **no dialog card and no buttons**.

Reading of the picture and the code (**not observed live and not reproduced**):

- The dimmed backdrop was painted and the card was not. A pixel check found no bright card anywhere (median luminance 136 and maximum 152 out of 255); the dark pill is a blurred button behind the overlay.
- **Likely cause (a hypothesis):** the card had its own `backdrop-filter: blur(30px)` inside a backdrop that already blurred by 10px, and faded in from opacity 0 (`confirmRise`). Search results describe WebKit failing to paint nested backdrop-filter layers or layers that are invisible on their first frame. Nothing was tested in WebKit. Headless Chromium paints the old dialog correctly (a probe saw opacity go 0 to 1 over about 400ms), and the earlier browser suites ran with reduced motion, so they could not have shown it.
- 4v made this worse: the backdrop ignored taps and `.app-shell` is inert while a dialog is open, so a card that did not paint left no way out. Nothing was lost, replaced or uploaded; sync stayed paused with `northstar/conflict`.

What changed (all in `index.html` unless noted):

- **Dialogs no longer rely on the fragile painting.** Every `.confirm-dialog` and `.modal` has no `backdrop-filter` and no entry animation of its own (the backdrops keep their blur). The three choosers also get a flat overlay, `.confirm-backdrop-plain` (rgba(8,8,8,.62), no blur, no animation), and an opaque white card. The rules sit after `.confirm-backdrop{z-index:4000}`; the flat-overlay rules use `!important` so the earlier theme layers cannot bring the blur back.
- **`sticky` is gone, replaced by `guarded`.** `showNorthstarDialog({guarded:true})` keeps the 500ms early-tap guard (`confirmGuarded`, `confirmArmedAt`), focus on Decide later and 46px buttons, but a tap on the dimmed area after the guard now closes the dialog, resolving `null` like Decide later. A tap in the first 500ms is still ignored, so a double tap cannot close or answer it.
- **The question is also on the page.** The three choosers call `askSyncChoice()`, which remembers the question as `pendingChoice` (uid, title, message, a card note and the offered values; Decide later is not one of them). Settings → Sync diagnostics renders it as `#syncChoiceCard` ("Which copy should Northstar keep?", the same counts, **Use cloud copy** and **Keep this device**, no Decide later, "Nothing changes until you tap a button."). The card ignores taps for 600ms after a dialog is left or the page is taken to it (`syncChoiceGuardUntil`), so the tap that left the dialog cannot land on a button. A card button (`data-action="answer-sync-choice"`) sets `scriptedChoice` and runs `retryCloudSync()`. The question that is asked again takes that answer only if the uid, title and message are identical to the remembered one and the value is one of the offered choices; the answer is one shot and is consumed even when refused. Otherwise a toast says "That question changed since you looked, so nothing was applied. Review it and choose again." and the dialog opens as usual.
- **One button for a pending choice.** The banner, Settings and Stocks-line buttons now use `data-action="choose-sync-data"`, handled by `chooseSyncData()`: with a remembered question it goes to Settings and focuses the card; with none (for example after a reload) it runs `retryCloudSync()`, which asks again. `stockSaveStatus` in `stock-watchlist-view.mjs` returns `command: 'choose-sync-data'`. The plain **Retry cloud sync** button (`retry-sync`) remains for issues that are not a pending choice. `clearSyncIssue` also clears `pendingChoice`.

Not changed, on purpose or as a known gap:

- **No copy is ever chosen automatically.** The card and the dialog both need an explicit tap, counts only are shown (no amounts, names or notes), and Decide later and Escape still change and upload nothing.
- **Whether the hypothesis is right is unknown.** If the dialog still does not paint on the owner's phone, the Settings card does not depend on any overlay or blur. If neither works, Settings → Sync diagnostics → Copy details gives the code and stage to continue from.
- The protected-workspace chooser still has no confirmation toast and no Chromium scenario of its own (a differing protected cloud copy needs a second encrypted envelope under one key); it shares the dialog code and the source-level checks.
- A phone that is already stuck on the old build stays stuck until this change is merged and GitHub Pages rebuilds; the old build cannot be told to behave differently.
- The Finnhub key and prices remain memory-only, and the other residuals from 4u and 4v are unchanged.

How the owner resolves their phone once this build is live: reload, Settings → Sync diagnostics → the card ("Which copy should Northstar keep?") or **Choose which data to keep**. If the pop-up appears at sign-in and looks like a dimmed page only, wait half a second and tap the dimmed area to leave it; the card is waiting on Settings. **Use cloud copy** if the account's data is the real data (it replaces what the phone shows); **Keep this device** if the phone's data is the real data (it uploads and replaces the cloud document). If unsure, Settings → Export backup first. Afterwards the header says "Cloud sync on" and the Stocks line says "Saved to your Google account".

Verification (sandbox, mocked Firebase and Finnhub; **no physical iPhone, Safari or WebKit, live Firebase, deployed-rules or live-Finnhub test**): 138 dependency-free Node tests pass (`sync-status` is 21: the old sticky check was replaced by 7 tests, two source-level and five behavioural, covering the remembered and forgotten question, the one-shot answer and a changed question, the answer being ignored without a waiting question, the in-page card, and the one-tap routing). The 39 stock Chromium scenarios pass (5 new or rewritten: both choosers deferred and then answered from the page, an overlay that cannot be seen being left with a tap, a changed copy not being applied, and dialogs having no blur or animation of their own on the first frame, checked with motion enabled; the axe scenario now includes the card). The graph (12), interface (9), welcome (14) and Home-shortcut (30) suites pass. Twenty-one deliberate one-line mutations of the production code were each caught (14 by the Node tests, 7 by the Chromium scenarios). The Chromium scenarios check computed styles and behaviour; they cannot show how Safari paints, so the cause above stays unconfirmed.

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
- Keep phone layouts usable, not merely scaled-down desktop layouts. The current floating dock replaces the sidebar at all sizes; preserve access to all eight sections.
- The user values polished motion and careful alignment. Avoid adding animations that replay unexpectedly, make financial values temporarily inaccurate, or ignore reduced-motion preferences.

### Setup and assistance style
- Explain technical setup one step at a time when directly guiding the user through setup.
- Before substantial code changes, inspect the actual existing implementation and preserve the user's data and current behavior.
- Explain what changed, which file changed, and what was actually tested. Do not claim a test was run when it was not.

## 6. Mobile support — intro report awaiting device confirmation

The user had previously confirmed that the older mobile page-scrolling issue was fixed. Repository history includes the 2026-10-24 `83f81f7a` vertical-scroll fix and the 2026-10-26 `0dd404d8` iPhone document-scrolling improvement. Do not describe that historical main-page issue as newly unresolved.

The user subsequently reported that the **welcome intro** prevented them from entering the app. Section 4m documents the pinned direct-entry action and native intro scroller added in response. Existing document scrolling, the responsive floating dock, safe-area spacing, and mobile performance safeguards remain. Simulated touch checks now cover both the intro and the main page, but the cause on the user's iPhone remains unverified. Ask the user to try the deployed site on their phone before claiming the new report is resolved; do not claim a physical-device test was performed.

## 7. Firebase and security notes

- Firebase project ID in the app configuration: `northstar-personal-finan-ca543`.
- Firebase client SDK modules are loaded dynamically from Google's hosted SDK.
- Google Authentication and Firestore are implemented in `index.html`.
- Firestore document path: `users/{uid}/northstar/financeData`.
- `firestore.rules` checks that a signed-in user's UID matches the document's `userId` path segment.
- Firebase browser configuration is public client configuration, not a Firebase Admin/service-account credential. Never put service-account JSON, private API keys, or other admin secrets in `index.html` or any public repository file.
- The code in the repository is not proof that Firestore rules are currently published in the Firebase Console, nor proof that all production settings are correct.
- The user previously reported that Google sign-in and cloud sync were working. Treat that as user-reported history, not a fresh end-to-end verification during this handoff update.
- Browser/cloud data is plaintext unless protection is explicitly enabled. Even with a protected active copy, old copies/backups and an unlocked session can expose data. Do not treat passphrase encryption or client UI as a substitute for published, tested Firestore authorization.
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

GitHub Pages reported `built` at [the public site](https://corbinplayz.github.io/personal-finance/) after PR #23; its [deployment run](https://github.com/CorbinPlayz/personal-finance/actions/runs/42916131325) succeeded for merge commit `d73f84b`. Check GitHub Actions and Pages status for later changes. Deployment success does not validate Firebase, providers, or physical-device behavior.

The optional Worker has a separate Wrangler configuration. The unchanged Worker's PR #21 preview check failed without diagnostics, while its production build check succeeded on the merge commit. Neither result confirms a live endpoint or front-end integration. Its README describes Cloudflare setup, AI binding, and Firebase API-key environment variable.

## 10. Useful implementation landmarks inside index.html

The file is large and contains mostly long CSS/JavaScript lines. Use targeted search rather than reading or rewriting it all at once.

| Code landmark | Purpose |
|---|---|
| `FIREBASE_VERSION`, `firebaseConfig`, `blankData` | SDK version, public Firebase config, empty data shape |
| `localKey`, `loadLocal`, `persist`, `normalizeData` | Data migration/normalization and browser persistence |
| `applyTransaction`, `reservedFunds`, `accountBalanceParts`, `maxPurchaseAllocation` | Account arithmetic and purchase protection |
| `showNorthstarDialog`, `settleNorthstarDialog`, `confirmGuarded`, `confirmArmedAt` | Reusable styled confirmation/choice dialogs; `guarded:true` gives the flat overlay (`confirm-backdrop-plain`), ignores taps for 500ms and then lets a tap outside close it like Decide later; `focus:true` on a choice sets initial focus (see 4v, 4w) |
| `initWelcomeJourney`, `updateWelcomeProgress` | Intro scroll progress and reveal effects |
| `renderDock`, `positionDockIndicator`, `setDockMore` | Shared responsive navigation, active indicator and More menu |
| `render`, `renderOverview`, `renderTransactions`, `renderAccounts`, `renderBudgets`, `renderGoals` | Main page rendering and graph integration |
| `finance-graphs.mjs`, `financial-graphs-view.mjs`, `financial-graphs.css`, `prepareGraphEntrances` | Pure graph models, escaped accessible rendering, styling and one-shot visible-entry motion |
| `#jarvis-runtime`, `NorthstarLedger`, `routeMoneyAction` | Active-workspace assistant, local answers and reviewable form drafts |
| `#finance-motion-runtime`, `celebrateSavedGoal` | Presentation-only feedback and protected-save celebration guard |
| `renderPurchases`, `renderPurchaseTile`, `completedPurchaseEntries`, `setPurchaseStatus` | Read-only completed expense projections, explicit-ID deduplication, tile/detail display, and bought flow |
| `safePriceHistory`, `estimatePriceTrend`, `renderPurchasePriceTools`, `savePriceCheck` | Manual price logs and local trend estimate |
| `renderGuide`, `saveGuideProfile`, `answerGuide` | Rules-based Guide and saved profile/memory |
| `renderSettings`, `exportBackup`, `importBackup` | Preferences and JSON backup/restore |
| `initFirebase`, `onAuthChanged`, `writeCloudNow`, `cloudWritePayload`, `syncProtected` | Authentication, conditional Firestore writes, and protected sync conflicts |
| `enableVault`, `showVaultUnlock`, `queueProtectedLocalSave`, `vault-crypto.mjs` | Explicit protection setup, lock/unlock, serialized encrypted device writes, cryptographic envelope |
| `stockSaveState`, `updateStockSaveStatus`, `stockSaveSuffix`, `cancelCloudSave`, `renderAfterCloudSave`; `stockSaveStatus` in `stock-watchlist-view.mjs` | The Stocks save line, edit toasts and the display-only save-in-flight state (see 4u) |
| `describeWorkspace`, `cloudSavedLabel`, `syncNeedsChoice`, `syncIssueStatus`; `needsChoice` in `stockSaveStatus` | Counts-only copy summaries in the choose-data dialogs, and the pending-choice banner/panel/Stocks line/header (see 4v) |
| `askSyncChoice`, `answerSyncChoice`, `chooseSyncData`, `renderSyncChoiceCard`, `syncChoiceReady`; `pendingChoice`, `scriptedChoice`, `syncChoiceGuardUntil`; `.sync-choice-card`, the dialog CSS override after `.confirm-backdrop{z-index:4000}` | The in-page version of the choose-data question, its one-shot scripted answer and the paint-safe dialog styles (see 4w) |
| Final purchased-card observer IIFE | Plays each purchased card's entry animation when it first intersects the viewport |

## 11. Recent repository history worth preserving

The most relevant code-history milestones on `main` include:

- 2026-10-23: separate account balance presentation, purchase allocations, minimum-balance protection, transaction recording when marking a purchase bought, and sync conflict handling.
- 2026-10-23: Northstar Guide profile, saved preferences, payday input, manual price history, and trend estimate.
- 2026-10-24: responsive mobile layout; mobile vertical-scroll fix; Cloudflare Worker backend and deployment documentation.
- 2026-10-26: iPhone document-scrolling improvement; purchase planner descriptions and clear-data safeguards; automatic purchase priority sorting; compact square tiles and detail view; separate Purchased group; muted completed cards; one-time animated X; subsequent X/ring alignment refinements.
- 2026-11-03: initial project handoff added.
 
Recent work includes local Jarvis review-before-save drafts (PR #12), the compact purchased badge, the completed expense tiles and optional protected workspace (PR #21, sections 4j–4k), the major-update write-up (4l), the pinned intro entry (PR #23, 4m), and the dock/Jarvis/motion refinements (4n).

## 12. Recommended next steps for a new AI/developer

1. Read this handoff and the root `README.md`, then inspect the exact current `index.html` before editing.
2. The earlier main-page scroll issue was confirmed fixed, but the user has since reported a separate intro-access problem. After deployment, ask them to try the pinned entry and intro swipes on their phone; no physical-device test is claimed.
3. Publish and test the new Firestore rules and protected sync against a non-production Firebase project; get independent security review before treating this as fully verified. Do not assume the Cloudflare Worker should be integrated just because its files exist.
4. For visual refinements, preserve the existing premium Northstar design language and the compact Purchase Planner behavior. For the dashboard, prioritize useful information density over simply enlarging cards.
5. Protect data integrity: keep user-entered amounts intact, preserve the local/cloud conflict flow, respect account minimums and purchase allocations, and do not add sample balances.
6. After each meaningful change, validate the relevant flows, state precisely what was tested, and update this handoff.

## Work log

- 2026-11-17 (question did not appear): The owner sent an iPhone screenshot of the "choose which data to keep" step showing only the dimmed, blurred Settings page: no dialog card, no buttons, and the page frozen behind it. PR #32's backdrop ignored taps and the page is inert while a dialog is open, so a card that did not paint left no way out. The likely cause (not confirmed; nothing was tested in WebKit) is the card's own backdrop blur nested inside the blurred backdrop, plus its fade-in from invisible. The dialogs now have no blur or entry animation of their own and the three choosers use a flat overlay; a tap outside leaves after half a second; and the same question is a card on Settings → Sync diagnostics that needs no pop-up, answered only if the question is unchanged. Nothing is ever chosen automatically. 138 Node tests, 39 stock Chromium scenarios and the four other browser suites pass (mocked); 21 mutations caught; no physical iPhone, Safari, live Firebase or deployed-rules test. See 4w.
- 2026-11-17 (conflict choice): The owner meant that watchlist edits do not reach the cloud, and sent a screenshot showing `northstar/conflict` with "Cloud copy: Not loaded" and "Read access confirmed". The cause fits a "which data to keep" dialog that was closed without a choice (sync pauses by design, so every edit stayed on the phone); it is not a rules or network problem, but the sandbox cannot see why it was closed or which copy is the real one. The choose dialogs now ignore a tap outside and an immediate tap, start on Decide later, describe both copies in counts, and a pending choice has a one-tap button in the notice, Settings and the Stocks line; Check cloud access no longer claims "confirmed" while a choice is pending. Also restored a README sentence PR #31 had overwritten. 132 Node tests and 36 stock Chromium scenarios pass (mocked); no physical iPhone, Safari, live Firebase or deployed-rules test. See 4v.
- 2026-11-16 (stocks): The owner said the stock market "doesn't save to cloud". No stock-specific bug was found: with confirmed sync every edit reached the (mocked) cloud document and a second device. The Stocks page now states where an edit went (signed out, saving, confirmed with a time, or paused with its code and a diagnostics link), toasts say the same, and a full re-render that wiped typing after each cloud save is gone. The key and prices stay memory-only; remembering or syncing the key was not shipped and needs an owner decision. Also fixed a stale `getRedirectResult` mock that failed `home-shortcut-browser`. See 4u; nothing was tested on a physical iPhone, Safari, live Firebase or live Finnhub.
- 2026-11-16 (follow-up): The owner then reported the exact "sign-in succeeded but cloud sync not confirmed" state with no code. That state could be completely silent (an auth event aborting a load); every load now records a code, and Settings gained a one-tap Firestore access check naming the code plus the project/database. 112 Node tests pass; still no physical iPhone, Safari or live Firebase test, so the owner's actual code is not yet known.
- 2026-11-16: Responded to the iPhone report that sync only said it "requires attention" with no code. Paused syncs now record and display a code, reason and time (banner, header title, Settings → Sync diagnostics, copyable details), iOS sign-in falls back to a redirect, and only transient codes auto-retry. 109 Node tests pass; no physical iPhone, Safari or live Firebase test was performed, and the original conflict cause is still unconfirmed. See 4t.
- 2026-11-09: Added a curated stock watchlist in the dock with optional visitor-key Finnhub updates, retained the saved Guide in Settings, and tested local persistence, mock sync, privacy and responsive behavior. See 4s; the provider and cloud have not been live-tested.
- 2026-11-09: Added an icon-only Home shortcut with scroll preservation on Home, brief dock feedback, keyboard support and 30 focused browser checks. See 4r.
- 2026-11-09: Added a brief, reduced-motion-aware garage-door reveal to the existing welcome entry, preserving intro replay, focus and vault/cloud guards. See 4q.
- 2026-11-09: Added read-only graphs across all eight sections and transient goal contribution comparisons, with exact-value alternatives, responsive layouts, reduced motion, and synthetic model/browser checks. See 4p for graph meanings and verification limits.
- 2026-11-09: Removed the inline and legacy AI-reader notices at the owner's request. The page otherwise matches the previous release byte-for-byte; the removed inline comment reduced the uncompressed page by about 258 KB. All 54 Node tests, 20 simulated Chromium scenarios, HTML/CSS/JavaScript parser checks, and duplicate-ID checks passed. Services were mocked or blocked; no physical device or live-provider test was performed. See 4o.
- 2026-11-09 (superseded by removal; see 4o): Replaced the original source pointer with a 3,000-line HTML comment. All 57 Node tests and 21 simulated Chromium scenarios passed; the notice stayed invisible, navigation worked, and the page was otherwise byte-for-byte unchanged. HTML/CSS/JavaScript parser and duplicate-ID checks passed. Services were mocked or blocked; no physical device or live-provider test was performed.
- 2026-11-09 (superseded by removal; see 4o): Added the original 3,000-line, comment-only AI-reader notice and an inert source pointer. All 55 Node tests and 20 simulated Chromium scenarios passed; no notice requests were made, and the site HTML otherwise matched the previous release. External services were mocked or blocked; no physical device or live-provider test was performed.
- 2026-11-09: Replaced the sidebar with a responsive glass dock, refined Jarvis's local answers and reviewable drafts, added safe presentation-only financial feedback, and checked key-storage and protected-save failure paths. See 4n for verification and limits.
- 2026-11-09: Responded to the new intro-specific mobile report with a pinned Enter Northstar action and native touch scroller. Simulated swipes, replay, storage and vault guards were checked; physical-phone confirmation is pending. See 4m.
- 2026-11-09: Labeled PR #21 a major update, added the two-page repository write-up, updated README/Worker notes and app copy, and fixed the hidden Connections sheet and welcome replay issues found during responsive QA. See 4l for tests and limits.
- 2026-11-09: Replaced the rejected expense-history panel with completed expense tiles, fixed lost links/price history and misleading dates, and added optional passphrase-protected device/cloud workspaces. Tests and limitations are in 4j–4k; Firebase rules still require separate deployment and live verification.
- 2026-11-09 (superseded by 4j): Added an expense-only transaction history to the Purchase Planner, with a jump shortcut, linked-plan labels, and actions to record/manage expenses; the list is a read-only view of the existing records and does not affect balances or plan totals. Added dependency-free Node rendering tests and checked desktop/mobile layouts and transaction flows in headless Chromium. No physical iPhone or live Firebase test was performed; see 4j.
- 2026-11-09: After rejected full-card, drawn-stroke, and veiled iterations, shipped the compact corner badge: a complete circle and X with a price strike. The final badge was checked frame-by-frame in headless Chromium at desktop and phone widths, including reduced motion; older attempts had only structural checks before browser rendering became available. See the purchase-planner section for the design constraints.
- 2026-11-03: Added the BYOK cloud brain — paste-in key slot in a Connections sheet, Gemini/OpenAI/Anthropic/Groq/OpenRouter/custom adapters, session-by-default key storage isolated from finance data, principal-free brief, silent local fallback with per-message source labels. Widened the `safe` intent. 27 BYOK + 11 local-brain jsdom assertions pass; no live API call or visual QA was possible.
- 2026-11-03: Fixed BYOK reliability issues reported during visitor testing: stale model defaults, false `Connected` status, hidden-field CSS leak, short probe tokens, truncated upstream errors, and no transient retry. All assistant replies now identify their source; see 4g. Focused jsdom/parser checks pass; live provider access and visual QA were not available.
- 2026-11-03: Moved ambient ink out of Jarvis to a page-wide grayscale background per user clarification. It drifts independently of pointer movement, runs on coarse pointers, pauses in hidden tabs, and is disabled for reduced motion.
- 2026-11-03: Added local Jarvis drafts for transaction, tracked balance, budget, goal, and planned-purchase actions. Existing forms remain the only save path; jsdom verified prefills and no writes before explicit submit. See 4i; no visual QA or provider call was performed.
- 2026-11-04 (historical report): User reported mobile scrolling stopped. An initial CSS correction restored mobile `overflow-y:auto`, but scrolling still failed in Chrome on iPhone 13 and the app felt laggy at that point. For current status, follow the user's confirmation in section 6.
- 2026-11-04: Consolidated mobile page scrolling so `html` owns document scrolling and `body` plus app sections remain in normal flow, avoiding nested root/body scroll containers. Disabled animated blurred ambient/ink layers, the full-screen grain overlay, and canvas ink loop on small/coarse-pointer devices to reduce GPU work. Parser/jsdom checks passed; the current status follows the user's confirmation in section 6, not a new physical-device test.

- 2026-11-03: Re-reviewed the prior Northstar project context available in this conversation, the current repository inventory, root README, Firestore rules, Worker source/configuration, current `index.html`, and recent Git commit history. Rewrote this handoff to reflect the current static-site architecture and implemented functionality.
- 2026-11-03: Corrected the mobile-scrolling status. The user confirmed scrolling was already fixed; repository commits from 2026-10-24 and 2026-10-26 and the current responsive CSS corroborate that status. No new scrolling code was changed.
- 2026-11-03: Fixed Jarvis reading the wrong storage key when signed in (uid-scoped), added the in-module `NorthstarLedger` bridge, and rebuilt the brain with intent scoring, entity extraction, multi-turn context, projections and comparisons.
- 2026-11-03: Restored semantic colour for money (income/expense/transfer, category palette) while keeping the chrome monochrome, and added the ink plume layer inside the Jarvis panel.
- 2026-11-03: Added Jarvis — a local, offline, data-aware assistant with tone modes, optional speech output/input, and a glass panel. Reads the ledger read-only; no network, no API keys.
- 2026-11-03: Added the Liquid Black layer — glass shell, iridescent accents, drifting ambient fields, ink-in-water cursor, staggered motion + count-ups, a synthesized sound system with a topbar mute, a ⌘K command palette, keyboard shortcuts, a grain toggle and a logo easter egg. All additive (+790/-0); core app logic untouched.
- 2026-11-03: Full visual redesign to a monochrome design language. Added the `#mono-design` style layer, remapped every colour literal to a neutral ramp with a single oxblood danger accent, replaced Unicode glyphs with inline SVG line icons (nav, dock, metrics, transactions, accounts, goals, empty states, welcome benefits), rebuilt the monochrome brand marks, and added tabular numerals. Structure, data logic, persistence, sync, and the documented mobile scroll fixes were not changed; the only JS edits are icon/colour values plus the new `ICON` set.
- 2026-11-03: Documented the important Cloudflare integration gap: a Worker backend exists, but the current Guide remains local/rules-based and does not call the Worker.
