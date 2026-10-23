# Northstar Personal Finance

Northstar is a static, mobile-friendly personal finance planner with an animated compass-themed welcome journey.

## Included features

- Overview, transactions, accounts, budgets, savings goals, and planned purchases.
- Goal progress states and optional sound/visual celebration when a goal is first reached.
- Responsive phone navigation and a scrollable animated introduction.
- Northstar Guide with a saved planning profile, remembered preferences, and rule-based saving/purchase suggestions.
- Purchase priority ordering, links to search current shopping listings, and manual price-history logging.
- A simple 30-day price trend estimate after at least three price checks on different dates. This estimate uses only prices you enter; it is not a live retailer feed or guaranteed prediction.
- JSON backup and restore, local storage, and optional Google sign-in plus user-scoped Firestore sync.

The Guide is a local rules-based helper, not an external generative AI service. An actual AI service or automatic price monitor would need a secure backend/API integration; do not put private API keys in this static site.

Northstar does not connect to bank accounts or verify your real balance. Figures depend on information you enter. Double-check your actual accounts before spending.

## GitHub Pages publishing

1. Keep `index.html`, `firestore.rules`, and `README.md` in the repository root.
2. Open repository **Settings → Pages**.
3. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then save.
4. In Firebase Console → Authentication → Settings → Authorized domains, add your GitHub Pages hostname (for example, `corbinplayz.github.io`, without a path).
5. Enable Google as a Firebase Authentication provider.
6. In Firebase Console → Firestore Database → Rules, paste and publish the contents of `firestore.rules`.

## Cloud data and security

Northstar stores a signed-in user's data at:

`users/{signed-in-user-uid}/northstar/financeData`

The Firestore rules are intended to restrict each user to their own document. Confirm that a Firestore database exists and that these rules are published before entering real financial information.

The Firebase configuration inside `index.html` is public web-app configuration, not admin credentials. Never place service-account credentials or private API keys in a browser app.
