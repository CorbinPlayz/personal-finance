# Northstar Personal Finance — clean restart

Files:
- `index.html` — complete static app, styles, and Firebase web config.
- `firestore.rules` — per-user Firestore access rules.
- `README.md` — publishing checklist.

## Publish with GitHub Pages
1. Upload the files to the root of your GitHub repository.
2. Open repository **Settings → Pages**.
3. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After the site publishes, open Firebase Console → Authentication → Settings → Authorized domains and add the GitHub Pages hostname (for example `corbinplayz.github.io`, without a path).
5. In Firebase Console → Firestore Database → Rules, paste and publish the contents of `firestore.rules`.

Google sign-in must be enabled in Firebase Authentication. Data is stored at `users/{signed-in-user-uid}/northstar/financeData`. The Firebase values in `index.html` are public web-app configuration, not admin credentials. Never add service-account credentials to a browser app.

This starter supports manual income/expense entry and cloud sync. It does not connect to banks.
