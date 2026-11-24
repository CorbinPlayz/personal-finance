# Northstar Personal Finance — Major Update

**Latest: a real AI assistant, stock charts you can zoom, shop-link prices, recurring bills and a smoother look**

This is the second major update. It is 23 pull requests, [#29 to #51](https://github.com/CorbinPlayz/personal-finance/pulls?q=is%3Apr+is%3Amerged), merged between November 15 and November 24, 2026. The first major update ([PR #21](https://github.com/CorbinPlayz/personal-finance/pull/21): completed-purchase tiles and optional protection) is kept below, unchanged.

**Do this once:** redeploy the Worker `northstar-finance-ai` in your Cloudflare account. The 5-year stock charts and the clearer shop-link and search messages need the new Worker code. Without it the site still works, but the charts will say they could not load history.

## What is new

### Jarvis is now a real AI assistant

- **Free and keyless.** Jarvis runs on your own Cloudflare Worker with Cloudflare's Llama 3.3 70B model. There are no API keys. The old key-based providers (Gemini, OpenAI, Anthropic, Groq, OpenRouter, custom) were removed, and old setups move to the hosted AI with the saved key dropped. Settings are two switches plus **Check connection** and **See what is sent**.
- **It reads your data.** Jarvis sees your accounts, goals, watchlist prices and portfolio holdings, from any page. It remembers the recent turns of the chat, so a follow-up like "and the cheaper one?" keeps its context.
- **It always uses the cloud.** The old offline answers are switched off (`LOCAL_BRAIN_ENABLED=false`). The code is kept, so they can be turned back on. Form drafts still work without the AI.
- **It drafts, you confirm.** "Buy 3 shares of TSLA at 200" opens a prefilled portfolio form. Nothing is saved until you press save.
- **Shop links.** Paste a product link and the Worker reads the price from the page's product data (no AI, public https sites only, redirects checked). Jarvis opens a prefilled transaction or purchase plan. If the page shows a finance plan as well as a full price, Jarvis asks whether you mean outright or finance. If a page lists several amounts, it lists them so you can pick one.
- **"Buy <product>".** Jarvis searches the web for a price, reads the shop pages it finds, and drafts the transaction with that price.
- **Clear reasons when it fails.** Instead of a vague message, Jarvis says what went wrong: the shop blocked the page, the page took too long, the search engine blocked the Worker, no shops were found, or shops were opened but none showed a price (and which ones).

### Stocks tab

- **Watchlist.** A curated list of 100 U.S.-listed tickers you can search, add to and remove from, saved with your workspace.
- **Portfolio tracker.** Holdings with shares, price paid and optional purchase date, gain or loss, total value, and daily value history, using the prices the page already loads.
- **Portfolio value chart (new).** The top of the tab shows your portfolio value over time, from your first purchase date, with a dashed line for the money you put in. The line **steps up on the day you add shares**, and a dot marks each purchase. Hover or tap to read any day. This chart is read-only by design.
- **Zoomable 5-year chart per stock (new).** Tap a stock to open its share price for the past five years. On a computer: scroll wheel or trackpad pinch to zoom, drag to move, double-click to zoom in, plus 1M / 6M / 1Y / 5Y, +, − and Reset buttons, and the keyboard (+, −, arrows, Home). On an iPhone or Android phone: pinch, drag, double-tap and the same buttons, sized for thumbs. The sheet opens above the Jarvis button and panel. The price axis refits to what you are looking at, and your own purchases show as dots.
- **Where the history comes from.** The Worker fetches daily closing prices (split-adjusted) from Stooq, with Yahoo Finance as a backup, and asks nothing about you except the ticker. Purchases without a date start "today" and the chart tells you so. A ticker with no history is counted at the price you paid.

### Everyday money tools

Recurring bills; a money split for new income across the accounts you choose (a confirm dialog asks first, and the percents must add up to 100); CSV export; undo after delete; goal end dates on the Goals and Plan charts; richer sounds; and your Finnhub key saved to your account.

### Look and feel

A second motion layer: cards enter in a stagger, bars, lists and rings grow in, tap feedback is springy, portfolio values flash when they change, new rows glow, and toasts slide. Everything respects the system "reduce motion" setting, and dialogs are left alone so the Safari fix stays.

### Sign-in and sync you can trust

Sign-in uses a popup in normal browser tabs, because the redirect version could loop back with no user where browser storage is partitioned. A paused sync now shows the real reason, watchlist edits say where they went, and the "which data to keep" question is easy to answer on a phone and hard to dismiss by accident.

## Privacy: what leaves your device

- **Jarvis:** your question and a short summary of the relevant finance data go to your Cloudflare Worker and Cloudflare's model. **See what is sent** shows it first. Do not type passwords or card numbers.
- **Shop links and "buy":** the link, or the product words you typed, are sent to your Worker, which contacts the shop or a search engine.
- **Stock history:** only the ticker symbol is sent, along with your sign-in token. No amounts, accounts or holdings.
- **Passphrase protection is switched off in this version.** Setup is blocked (`PASSPHRASE_SETUP_AVAILABLE=false`) and the code is kept so it can be turned back on. Unless protection was already turned on earlier, data is stored as readable text on your device and in your cloud workspace.

## What was checked, and what was not

- **Checked:** the Node test suite passes (250 tests). For the new charts, 19 headless Chromium checks passed at desktop and iPhone size, including real touch pinch, one-finger drag and double-tap, with the Worker and Firebase faked. Screenshots were reviewed at both sizes.
- **Not checked:** live Stooq or Yahoo data (this build environment cannot reach them), a real iPhone running Safari, and live shop pages. Apple pages often show no clean price, and the web search has not been tested live. If something is wrong, Jarvis now says which step failed, which makes it easy to report.
- **Known limits:** prices can be delayed or missing, the 100-ticker watchlist is curated and other tickers are not validated against an exchange, and nothing here is investment advice. Northstar does not connect to banks.

---

# Earlier major update — completed purchases and optional protection (PR #21)

**What changed: completed purchases, optional protection, and everyday polish**

This two-page overview describes the major update merged in [PR #21](https://github.com/CorbinPlayz/personal-finance/pull/21). It explains what is different, what stays under your control, and what still needs verification. Publishing these notes does not enable encryption or move your data.

## Page 1 — Purchases and everyday use

### Expenses now look like completed purchases

The Purchase Planner no longer puts recorded expenses in a separate history section. Existing and future expense transactions appear as tiles in the **Purchased** group, alongside completed purchase plans. Income and transfers do not appear there.

These tiles are a view of the records you already have. Displaying an expense does not create another purchase, record another charge, or change a balance. Northstar still uses manually entered figures; it does not connect to a bank or verify your account balances.

A purchase plan and an expense are shown once when their saved IDs explicitly link them. Northstar does **not** guess that two items match because they have the same name or price. Two similar, unlinked expenses remain two separate tiles.

Select an expense-only tile to open its existing transaction editor. Select a linked tile to open the purchase-plan details, where there is also an **Edit expense** action. A linked tile shows the amount and date recorded on the expense. If the expense has no usable date, it says **No date** rather than using the plan's target date. An unlinked completed plan labels its own date as a target.

If an active plan is linked to an expense, it appears once in the Purchased group; its saved allocation still counts in plan totals until you change the plan's status. The planner explains this distinction so a display change does not silently change your money.

### Safer edits and a more useful view

Editing a transaction preserves its purchase link, while editing a purchase plan preserves its transaction link and price history. When a transaction amount changes, the app reverses the old account effect and applies the new one once. A linked transaction that has been reclassified as income or a transfer will not silently cause a second expense when the plan is marked bought. A stale edit form is rejected if its original record no longer exists.

The Purchased group now has a search for finding completed items without changing the ledger. The compact tile retains the complete circled X and the struck-through price. The mark animates when it is first seen and stays settled after later edits or when you return to the planner during the same session. Reduced-motion preferences are respected.

Other refinements make the experience more usable on smaller screens: confirmation dialogs keep keyboard focus inside, the passphrase dialog can be scrolled on a narrow phone, and notifications are positioned away from the phone navigation and floating assistant. The welcome screen now remembers when you dismiss it and can be replayed from Settings. The assistant's Connections panel has a close button and keyboard Escape support, and closing it no longer leaves an invisible layer blocking taps.

## Page 2 — Privacy, backups, and sync

### Passphrase protection is optional

Northstar can now protect the **active device and cloud workspace** with a passphrase. It is **off by default**: existing data stays as it is until you explicitly enable protection in Settings. Setup currently requires HTTPS, a browser with Web Crypto and Web Locks, Google sign-in, and a successful cloud sync. Close other Northstar tabs and devices before starting.

The app derives a non-extractable key from your passphrase using PBKDF2-SHA-256 and encrypts the workspace with AES-256-GCM. It uses a random salt and a fresh random IV for each encryption. The passphrase is not stored or deliberately sent to Firebase. When unlocked, however, the app must hold your data in browser memory to show and edit it.

**There is no passphrase recovery.** Losing your passphrase can make the encrypted workspace and encrypted backups unrecoverable. Keep the passphrase somewhere safe, and make a backup before making major changes.

**Before enabling cloud protection, publish and test the updated `firestore.rules` separately**, preferably in a non-production Firebase project. Merging the website does not publish those rules. Their deployment and live behavior have not been verified, and this implementation has not had an independent security audit.

Protection covers the active workspace, not every copy that may already exist. Older browser workspaces, previous downloads, other devices, and cloud-provider backups or historical versions may still contain plaintext. Setup offers an optional cleanup of matching older browser copies only after the protected copies are verified; different copies and copies elsewhere remain untouched.

### Backups and conflict handling

A protected workspace exports an encrypted JSON backup. An unprotected export is readable JSON, and Northstar warns before downloading it. If you restore an encrypted backup into an unprotected workspace, the app warns that the resulting browser copy will be readable.

Protected edits are saved to the device first. Conditional cloud transactions and device-write checks help detect conflicts, account changes, and storage failures. If a save or conflict cannot be resolved safely, sync pauses and the app warns you rather than knowingly overwriting another copy. An emergency encrypted export can preserve changes that are still only in memory. Locking or signing out attempts to flush pending protected changes first.

Encryption does not protect against a compromised device, malicious site code, browser extensions, or access to an unlocked session. It cannot prevent an older valid encrypted copy from being restored. Authentication and properly published Firestore rules are still necessary. The optional Jarvis cloud connection can send selected information and its key to your chosen provider. That key is stored separately in browser storage, not encrypted by workspace protection. The separate Cloudflare Worker is not wired into the website.

### What was checked

PR #21 passed **29 focused Node tests** and desktop/phone-sized headless Chromium checks, including purchase rendering, edit safeguards, backups, lock/unlock, and simulated sync failures. The documentation and interface follow-up passed **35 Node tests** and additional desktop/phone-sized browser checks. Browser cloud scenarios used a **mocked Firebase SDK**; an additional real-SDK check ran offline. No live Firebase rules, physical iPhone, or independent security audit were tested. The GitHub Pages deployment of PR #21 succeeded. Its Worker preview check failed without diagnostics, while the production build check succeeded.
