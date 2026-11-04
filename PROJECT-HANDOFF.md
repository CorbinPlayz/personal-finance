# Northstar Personal Finance — Project Handoff

> Keep this document current as the project changes. It is intended to let a new developer or AI continue work without relying on prior chat history.

## Project purpose

Northstar is a personal finance planner built as a static, mobile-friendly web app. It helps the user manually track spending and savings, accounts, transactions, budgets, savings goals, and planned purchases. It is not connected to banks and does not verify balances. Avoid adding guessed/example balances as if they were real.

## Repository and current implementation

- Repository: https://github.com/CorbinPlayz/personal-finance
- Default branch: `main`
- The current repository is a small static-site implementation centered on a very large root `index.html`; it is not currently organized as the earlier planned React/Vite multi-file app.
- The root README describes the app as having overview, transactions, accounts, budgets, savings goals, planned purchases, a rule-based Northstar Guide, JSON backup/restore, local storage, and optional Google sign-in / user-scoped Firestore sync. Treat README feature claims as documentation; verify behavior in the live code before asserting it works.

## File inventory (verified from the repository tree)

| Path | Purpose |
|---|---|
| `index.html` | Main app entry point and primary implementation. It is approximately 203 KB and contains most/all client-side UI and logic. Inspect before editing; avoid replacing it wholesale. |
| `README.md` | Project overview, feature claims, GitHub Pages deployment instructions, Firebase setup notes, and security caveats. |
| `firestore.rules` | Firestore security rules. Review and test before changing; intended to limit signed-in users to their own data. |
| `cloudflare-worker/README.md` | Documentation for the optional Cloudflare Worker. |
| `cloudflare-worker/src/index.js` | Cloudflare Worker implementation. Inspect its routes and bindings before modifying. |
| `cloudflare-worker/wrangler.toml` | Wrangler deployment/configuration for the Worker. |

The repository tree was checked on 2026-11-03. No package.json or React/Vite source tree was present in that tree. If files are added or removed later, update this inventory.

## Current user-reported issue / immediate priority

The user says the app is unusable on mobile because the page will not scroll. They want the app to be mobile compatible. Prioritize diagnosing and fixing scrolling first, then verify responsive layout across screens.

Suggested investigation:
1. Inspect `index.html` for global/body/root overflow rules, fixed-height containers, nested scroll regions, touch-action, and any JavaScript that locks scrolling (including overlays/modals or intro animation states).
2. Identify whether the page or an inner content pane is intended to scroll. Avoid trapping touch scrolling inside a non-scrollable fixed-height wrapper.
3. Ensure the document can grow vertically on narrow screens; use responsive sizing and safe-area spacing where appropriate. Check navigation, dialogs, and animated intro separately.
4. Test on a phone-sized viewport and a real mobile browser if possible: scroll from top to bottom, open/close navigation and dialogs, rotate, and confirm there is no horizontal overflow.
5. Make the smallest targeted fix, then check desktop behavior and existing flows.

Do not claim mobile compatibility is fixed until it has been tested. The exact cause of the scroll failure has not yet been established.

## Product and design constraints from the user

- Premium, clear fintech design; compact useful dashboard content rather than large empty cards.
- Keep spending and savings balances separate; do not combine them into a misleading total.
- Do not restore old placeholder balances (previous examples were estimates, not real user data).
- Planned purchases should remain organized and easy to scan; completed purchases belong in a distinct purchased state/group.
- Mobile usability is a priority.
- Manual data entry is preferred; no bank linking.
- Keep setup and troubleshooting step-by-step when guiding the user.

## Technical / deployment notes

- Static site with GitHub Pages instructions in README.
- Firebase Authentication (Google sign-in) and Firestore sync are documented as optional.
- Firestore path documented in README: `users/{signed-in-user-uid}/northstar/financeData`.
- The app should never contain Firebase service-account credentials or private API keys. Browser Firebase config is public configuration, not an admin secret.
- README says the Guide is rule-based, not an external AI service, and price estimates are based only on manually entered prices.
- Verify the deployed Firebase rules and authorized domains before entering real financial data.

## Handoff instructions for the next AI/developer

1. Read this file and `README.md`.
2. Inspect the actual current `index.html` before proposing or making changes; it is the primary app source.
3. First reproduce and fix the mobile scrolling bug with a minimal, testable change.
4. Preserve user data and existing features. Do not invent balances or imply bank verification.
5. Explain exactly which file changed and why; summarize tests performed and any remaining limitations.
6. Update this handoff document after meaningful code changes so it remains useful across chats.

## Work log

- 2026-11-03: Confirmed repository access and inspected the repository tree and README. Added this handoff document. Mobile scroll failure is user-reported and still needs code-level diagnosis and testing.
