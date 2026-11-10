# Northstar Personal Finance — Major Update

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
