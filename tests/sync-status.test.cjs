// Run with: node --test tests/sync-status.test.cjs
// Guards the "sync needs attention but no error code" report: every paused sync
// must keep a readable code, reason, and time on the device, and the code must
// survive the phone-width header text and a page reload.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleScript);

function section(start, end) {
  const a = moduleScript.indexOf(start), b = moduleScript.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing section: ${start}`);
  return moduleScript.slice(a, b);
}
const issueHelpers = section('const SYNC_ISSUE_KEY=', 'function showSyncDetailsDialog(');
const errorHelpers = section('function firebaseErrorCode(', 'function isWelcomeVisible(');

function harness({ signedIn = true, online = true, stored = null } = {}) {
  const store = new Map();
  if (stored) store.set('northstar-sync-issue-v1', stored);
  const root = { hidden: true, innerHTML: '', replaceChildren() { this.hidden = true; this.innerHTML = ''; } };
  const context = vm.createContext({
    window: { localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    } },
    navigator: { onLine: online },
    vault: { state: 'off' },
    user: signedIn ? { uid: 'user-1', email: 'private@example.com' } : null,
    cloudLoaded: false,
    esc: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),
    $: id => (id === 'syncIssueRoot' ? root : null),
    console
  });
  vm.runInContext(errorHelpers + '\n' + issueHelpers, context);
  // syncIssue and syncIssueDismissed are module-level `let` bindings, so they
  // are read and written through the same script scope instead of the sandbox object.
  const read = expression => vm.runInContext(expression, context);
  return { context, store, root, read, run: statement => vm.runInContext(statement, context) };
}
const conflict = () => {
  const error = new Error('The cloud copy changed on another device. Review the conflict before saving.');
  error.code = 'northstar/conflict';
  return error;
};

test('sync codes survive missing, offline, and Firestore error objects', () => {
  const { context } = harness();
  assert.equal(context.firebaseErrorCode(conflict()), 'northstar/conflict');
  assert.equal(context.firebaseErrorCode({ code: 'permission-denied', message: 'x' }), 'permission-denied');
  assert.equal(context.firebaseErrorCode(new Error('plain failure')), 'northstar/app');
  assert.equal(context.firebaseErrorCode(null), 'northstar/app');
  const offline = harness({ online: false }).context;
  assert.equal(offline.firebaseErrorCode(new Error('plain failure')), 'northstar/offline');
});

test('status text and details always carry the code, even for a conflict without a hint', () => {
  const { context } = harness();
  const status = context.syncFailureStatus('Cloud sync', conflict());
  assert.equal(status, 'Cloud sync needs attention · northstar/conflict');
  assert.match(context.syncFailureStatus('Device save', conflict()), /^Device save needs attention · northstar\/conflict$/);

  const details = context.firebaseErrorDetails(conflict(), 'Cloud save');
  assert.match(details, /\[northstar\/conflict\]/);
  assert.match(details, /another copy of this workspace changed in the cloud after this device loaded it/i);
  assert.match(details, /Review the conflict before saving\./);
  assert.doesNotMatch(details, /\[unknown-error\]/);

  const denied = context.firebaseErrorDetails({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }, 'Cloud load');
  assert.match(denied, /Firestore denied access/);
  assert.match(denied, /\[permission-denied\]/);
  assert.match(denied, /Missing or insufficient permissions\./);

  const plain = context.firebaseErrorDetails(new Error('Something specific broke.'), 'Cloud save');
  assert.match(plain, /\[northstar\/app\]/);
  assert.match(plain, /Something specific broke\./);
});

test('a paused sync is recorded, shown with its code, and restored after a reload', () => {
  const first = harness();
  const code = first.context.reportSyncIssue(conflict(), 'Cloud save');
  assert.equal(code, 'northstar/conflict');
  assert.equal(first.read('syncIssue.code'), 'northstar/conflict');
  assert.equal(first.read('syncIssue.stage'), 'Cloud save');
  assert.equal(first.read('syncIssue.online'), true);
  assert.equal(first.root.hidden, false);
  assert.match(first.root.innerHTML, /Cloud save needs attention/);
  assert.match(first.root.innerHTML, /<code>northstar\/conflict<\/code>/);
  assert.match(first.root.innerHTML, /data-action="sync-details"/);
  const saved = JSON.parse(first.store.get('northstar-sync-issue-v1'));
  assert.equal(saved.code, 'northstar/conflict');
  assert.equal(saved.stage, 'Cloud save');
  assert.equal(typeof saved.at, 'number');

  const reloaded = harness({ stored: first.store.get('northstar-sync-issue-v1') });
  reloaded.context.restoreSyncIssue();
  assert.equal(reloaded.read('syncIssue.code'), 'northstar/conflict');
  assert.equal(reloaded.root.hidden, false);
  assert.match(reloaded.root.innerHTML, /northstar\/conflict/);
});

test('a successful sync clears the stored code and the banner', () => {
  const h = harness();
  h.context.reportSyncIssue(conflict(), 'Cloud save');
  h.context.clearSyncIssue();
  assert.equal(h.read('syncIssue'), null);
  assert.equal(h.store.has('northstar-sync-issue-v1'), false);
  assert.equal(h.root.hidden, true);
  assert.equal(h.root.innerHTML, '');
});

test('dismissing the banner hides it without losing the recorded code', () => {
  const h = harness();
  h.context.reportSyncIssue(conflict(), 'Cloud save');
  h.run('syncIssueDismissed = true');
  h.context.renderSyncIssueBanner();
  assert.equal(h.root.hidden, true);
  assert.equal(h.read('syncIssue.code'), 'northstar/conflict');
});

test('copied diagnostics explain the state without leaking the account or records', () => {
  const h = harness({ online: false });
  h.context.reportSyncIssue(new Error('Failed to get document because the client is offline.'), 'Cloud load');
  const text = h.context.syncDiagnosticsText();
  assert.match(text, /^Northstar sync issue/);
  assert.match(text, /Code: northstar\/offline/);
  assert.match(text, /Stage: Cloud load/);
  assert.match(text, /Reason: Failed to get document because the client is offline\./);
  assert.match(text, /Connection: offline/);
  assert.match(text, /Cloud copy loaded: no/);
  assert.match(text, /Protection: off/);
  assert.doesNotMatch(text, /private@example\.com/);
  assert.doesNotMatch(text, /user-1/);
  assert.equal(harness().context.syncDiagnosticsText(), 'Northstar has no recorded sync problem on this device.');
});

test('the page keeps the new surfaces and no longer pauses silently', () => {
  assert.match(html, /id="syncIssueRoot"/);
  assert.match(html, /id="syncDiagnosticsPanel"|renderSyncIssuePanel\(\)/);
  assert.match(html, /data-action="sync-details"/);
  assert.match(html, /restoreSyncIssue\(\);/);
  // Every paused-save path reports a code instead of a bare "needs attention".
  assert.doesNotMatch(moduleScript, /setSync\('Cloud sync needs attention','err'\)/);
  assert.doesNotMatch(moduleScript, /setSync\('Protected sync needs attention','err'\)/);
  assert.match(moduleScript, /reportSyncIssue\(e,'Cloud save'\)/);
  assert.match(moduleScript, /reportSyncIssue\(error,'Protected sync'\)/);
  // iOS Safari cannot reliably use a popup, so sign-in falls back to a redirect.
  assert.match(moduleScript, /signInWithRedirect/);
  assert.match(moduleScript, /getRedirectResult/);
});
