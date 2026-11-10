# Northstar Personal Finance

Northstar is a static, mobile-friendly personal finance planner with an animated compass-themed welcome journey.

## Major update — purchases and optional protection

Recorded expenses now appear as completed purchase tiles, with explicitly linked plans shown once. This update also adds completed-purchase search, safer editing and sync, responsive refinements, and optional passphrase protection for the active device and cloud workspace. [Read the two-page major update](MAJOR-UPDATE.md) for what changed and how it affects your data.

**Protection is off by default.** Before enabling cloud protection, publish and test the updated Firestore rules separately. A lost passphrase can make encrypted data unrecoverable; older copies may remain readable. Live Firebase behavior and an independent security review are still unverified.

## Included features

- Overview, transactions, accounts, budgets, savings goals, and planned purchases.
- Goal progress states and optional sound/visual celebration when a goal is first reached.
- Responsive phone navigation and an optional, scrollable introduction. **Enter Northstar** skips it immediately; you can replay it from Settings.
- Northstar Guide with a saved planning profile, remembered preferences, and rule-based saving/purchase suggestions.
- Purchase priority ordering, links to search current shopping listings, and manual price-history logging.
- Recorded expenses appear as completed purchase tiles. Linked expense/plan pairs appear once; selecting an expense-only tile edits the original transaction. Income and transfers are excluded.
- A simple 30-day price trend estimate after at least three price checks on different dates. This estimate uses only prices you enter; it is not a live retailer feed or guaranteed prediction.
- JSON backup and restore, browser storage, optional Google sign-in and Firestore sync, and optional passphrase protection for the active device/cloud workspace.

The intro remembers dismissal when browser storage is available. If saving that preference is blocked, you can still enter but the intro may return on reload. If storage cannot be read at all, the protected-workspace check fails closed rather than bypassing a possible vault; restore browser storage access before proceeding.

The Guide is a local rules-based helper, not an external generative AI service. Jarvis also has an optional visitor-supplied cloud connection; if enabled, selected data and the key are sent to the chosen provider. Its key is stored separately in browser storage (session by default, optionally remembered), not encrypted by workspace protection or included in finance backups. The separate Cloudflare Worker is not wired into the site. Do not put private API keys in this static site.

Northstar does not connect to bank accounts or verify your real balance. Figures depend on information you enter. Double-check your actual accounts before spending.

## Passphrase protection and backups

**Protection is off by default.** Existing browser and cloud data remains readable unless you explicitly enable it in Settings. Enabling protection currently requires a secure HTTPS page, a browser with Web Crypto and Web Locks, Google sign-in, and a successful cloud sync. It creates a protected device copy and replaces the current cloud document with ciphertext. The passphrase is not stored or deliberately sent to Firebase; PBKDF2-SHA-256 derives a non-extractable AES-256-GCM key, with a fresh random IV for each encryption. A new device needs the same Google account and passphrase to unlock the protected cloud copy.

- **There is no passphrase recovery.** Losing it can make the encrypted copy and encrypted backups unrecoverable. Keep a secure backup and record the passphrase somewhere safe.
- **Publish and test the updated `firestore.rules` before enabling cloud protection**, and close other Northstar tabs/devices first. The rules are intended to restrict each user to their own document and reject older clients that try to add plaintext to a protected document. Merely merging this repository does **not** publish Firebase rules. Their deployment and live Firebase behavior have not been verified in this change.
- Older browser workspaces, files downloaded before protection, other devices, and cloud-provider backups or historical versions may still contain plaintext. Setup offers an explicit option to remove *matching* old browser copies only after both new copies are verified; different copies are left alone. That option cannot erase backups or copies elsewhere.
- While unlocked, financial data is in browser memory and can be read by the app and scripts running on the page. Protection cannot defend against a compromised device, malicious site code, browser extensions, or data intentionally sent to an external service. It also cannot prevent someone from restoring an older valid encrypted copy. This implementation has not received an independent security audit.
- Protected-workspace exports are encrypted JSON backups. Unprotected exports are readable JSON, and the app warns before downloading them. Restoring an encrypted backup into an unprotected workspace creates a readable browser copy after confirmation.
- Changes are saved to the protected device first. Cloud writes use conditional Firestore transactions; errors and conflicts pause cloud sync instead of silently overwriting another copy. If setup is interrupted, the original plaintext copies are kept and cloud protection may need an explicit retry. On a different Google account, protected data is not uploaded. Protection cannot currently be enabled for a local-only workspace or removed through an automatic decrypt/disable button.

## Optional developer checks

Run `node --test tests/*.test.*` with Node.js 18 or later. These dependency-free tests cover welcome entry and replay, release links, purchase projections, transaction/link integrity, encryption, and mocked sync/storage conflicts. They do not validate deployed Firestore rules. The website itself remains a static page and does not require Node.js or a build step.

For optional Chromium touch and interface checks, install `puppeteer-core` outside this repository and point the script to a Chromium executable (Node.js 22 recommended):

```sh
npm install --prefix /tmp/northstar-browser-qa --no-save puppeteer-core
NODE_PATH=/tmp/northstar-browser-qa/node_modules CHROMIUM_PATH=/path/to/chromium node tests/welcome-browser.cjs
```

The browser checks block or mock external services; they are not a physical iPhone, Safari, or live Firebase test. Some sandboxed Chromium builds need additional flags via `CHROMIUM_FLAGS`.

## GitHub Pages publishing

1. Keep `index.html` and `vault-crypto.mjs` together in the repository root, alongside `firestore.rules` and `README.md`.
2. Open repository **Settings → Pages**.
3. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then save.
4. In Firebase Console → Authentication → Settings → Authorized domains, add your GitHub Pages hostname (for example, `corbinplayz.github.io`, without a path).
5. Enable Google as a Firebase Authentication provider.
6. In Firebase Console → Firestore Database → Rules, paste and publish the current contents of `firestore.rules`; test them using a non-production project before trusting them with financial data.

## Cloud data and security

Northstar stores a signed-in user's data at:

`users/{signed-in-user-uid}/northstar/financeData`

The Firebase configuration inside `index.html` is public web-app configuration, not admin credentials. Never place service-account credentials or private API keys in a browser app. Authentication and properly published Firestore rules remain necessary even when passphrase protection is enabled.
