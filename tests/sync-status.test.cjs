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
const accessHelpers = section('async function checkCloudAccess(', 'function queueCloudSave(');

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
    cloudLoaded: false, lastSyncError: null,
    fb: {},
    setSync: () => {},
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

function cloudHarness({ result = { exists: () => false }, rejection = null, issueCode = null, issueMessage = 'Previous failure.' } = {}) {
  const store = new Map(), toasts = [], statuses = [];
  const context = vm.createContext({
    window: { localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    } },
    navigator: { onLine: true },
    vault: { state: 'off' },
    user: { uid: 'user-1' },
    cloudLoaded: false, lastSyncError: null,
    fb: { auth: { currentUser: { uid: 'user-1' } }, db: {}, getDocFromServer: async () => { if (rejection) throw rejection; return result; } },
    docRef: () => 'users/user-1/northstar/financeData',
    cloudValue: snapshot => (snapshot.exists() ? snapshot.data() : null),
    looksEncrypted: value => value?.format === 'northstar-encrypted-v1',
    setCloudLoading: () => {}, render: () => {},
    setSync: (text, kind) => statuses.push({ text, kind }),
    showToast: text => toasts.push(text),
    esc: value => String(value),
    $: () => null,
    console
  });
  vm.runInContext(errorHelpers + '\n' + issueHelpers + '\n' + accessHelpers, context);
  if (issueCode) context.reportSyncIssue(Object.assign(new Error(issueMessage), { code: issueCode }), 'Cloud sync');
  return { context, store, toasts, statuses, read: expression => vm.runInContext(expression, context) };
}

test('a load that ends unconfirmed is never left without a code', () => {
  const h = harness();
  assert.equal(h.context.confirmSyncOutcome('Cloud load'), true);
  assert.equal(h.read('syncIssue.code'), 'northstar/app');
  assert.equal(h.read('syncIssue.stage'), 'Cloud load');
  assert.match(h.read('syncIssue.message'), /could not confirm the cloud copy/i);
  assert.match(h.read('syncIssue.message'), /Nothing was uploaded or overwritten/i);
  assert.match(h.context.syncFailureStatus('Cloud load', new Error('x')), /needs attention · northstar\/app/);

  assert.equal(harness({ signedIn: false }).context.confirmSyncOutcome(), false, 'signed out: nothing to confirm');
  const confirmed = harness();
  confirmed.context.cloudLoaded = true;
  assert.equal(confirmed.context.confirmSyncOutcome(), false, 'a confirmed copy is not an issue');
  const failed = harness();
  failed.context.lastSyncError = new Error('already reported');
  assert.equal(failed.context.confirmSyncOutcome(), false, 'an existing error keeps its own code');
  const locked = harness();
  locked.context.vault = { state: 'locked' };
  assert.equal(locked.context.confirmSyncOutcome(), false, 'a locked workspace is not a failure');
});

test('check cloud access names the Firestore failure on a phone', async () => {
  const denied = cloudHarness({ rejection: Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }) });
  await denied.context.checkCloudAccess();
  const check = denied.read('cloudCheck');
  assert.equal(check.ok, false);
  assert.equal(check.code, 'permission-denied');
  assert.equal(denied.read('syncIssue.code'), 'permission-denied');
  assert.equal(denied.read('syncIssue.stage'), 'Cloud access check');
  assert.match(denied.toasts.at(-1), /Firestore denied access.*\[permission-denied\]/);
  assert.match(denied.statuses.at(-1).text, /Cloud access check failed · permission-denied/);
  assert.equal(denied.statuses.at(-1).kind, 'err');

  const ok = cloudHarness({ result: { exists: () => false }, issueCode: 'permission-denied' });
  await ok.context.checkCloudAccess();
  assert.equal(ok.read('cloudCheck').ok, true);
  assert.match(ok.read('cloudCheck').detail, /No cloud document exists yet/);
  assert.equal(ok.read('syncIssue'), null, 'a working read clears a stale access code');
  assert.equal(ok.store.has('northstar-sync-issue-v1'), false);
  assert.equal(ok.statuses.at(-1).text, 'Cloud access confirmed');

  const conflict = cloudHarness({ rejection: Object.assign(new Error('The cloud copy changed on another device.'), { code: 'northstar/conflict' }) });
  await conflict.context.checkCloudAccess();
  assert.equal(conflict.read('cloudCheck').code, 'northstar/conflict');
  assert.match(conflict.toasts.at(-1), /\[northstar\/conflict\]/);
});

const pendingChoice = (message = 'Choose which data to keep to resume cloud sync.') => Object.assign(new Error(message), { code: 'northstar/conflict' });

test('only a conflict that is waiting for the visitor to choose is treated as a pending choice', () => {
  const h = harness();
  for (const message of ['Choose which data to keep to resume cloud sync.', 'Choose a device workspace to resume cloud sync.', 'Choose which protected copy to keep to resume cloud sync.']) {
    h.context.reportSyncIssue(pendingChoice(message), 'Cloud sync');
    assert.equal(h.context.syncNeedsChoice(), true, message);
    assert.equal(h.context.syncIssueStatus(), 'Sync conflict · action needed · northstar/conflict');
  }
  // A write that lost a race, another tab, other codes and no issue at all are different situations.
  for (const error of [conflict(), pendingChoice('The device copy changed in another tab. No local copy was overwritten.'), Object.assign(new Error('Choose which data to keep.'), { code: 'permission-denied' })]) {
    h.context.reportSyncIssue(error, 'Cloud sync');
    assert.equal(h.context.syncNeedsChoice(), false, error.message);
  }
  assert.equal(h.context.syncIssueStatus(), 'Cloud sync needs attention · permission-denied');
  h.context.clearSyncIssue();
  assert.equal(h.context.syncNeedsChoice(), false);
});

test('the notice and the copied details point at the choice, and only when there is one', () => {
  const choice = harness();
  choice.context.reportSyncIssue(pendingChoice(), 'Cloud sync');
  assert.match(choice.root.innerHTML, /<button type="button" class="primary-btn small" data-action="retry-sync">Choose which data to keep<\/button>/);
  assert.match(choice.context.syncDiagnosticsText(), /tap Choose which data to keep\. Nothing has been overwritten\.$/);
  const other = harness();
  other.context.reportSyncIssue(conflict(), 'Cloud save');
  assert.doesNotMatch(other.root.innerHTML, /retry-sync/);
  assert.match(other.context.syncDiagnosticsText(), /then Retry cloud sync to review both copies\.$/);
});

test('Check cloud access never reports "confirmed" in the header while sync is still waiting on a choice', async () => {
  const h = cloudHarness({ result: { exists: () => true, data: () => ({ data: {} }) }, issueCode: 'northstar/conflict', issueMessage: 'Choose which data to keep to resume cloud sync.' });
  await h.context.checkCloudAccess();
  assert.equal(h.read('cloudCheck').ok, true, 'the read itself worked');
  assert.equal(h.read('syncIssue.code'), 'northstar/conflict', 'a successful read does not resolve the conflict');
  assert.deepEqual(h.statuses.at(-1), { text: 'Sync conflict · action needed · northstar/conflict', kind: 'err' });
  assert.match(h.toasts.at(-1), /Tap Choose which data to keep to finish syncing\.$/);
  assert.doesNotMatch(h.toasts.at(-1), /Retry cloud sync/);
  // A stale access failure is still cleared and reported as confirmed, as before.
  const stale = cloudHarness({ result: { exists: () => true, data: () => ({ data: {} }) }, issueCode: 'permission-denied' });
  await stale.context.checkCloudAccess();
  assert.deepEqual(stale.statuses.at(-1), { text: 'Cloud access confirmed', kind: 'ok' });
  assert.match(stale.toasts.at(-1), /Use Retry cloud sync to reconcile both copies\.$/);
});

test('both copies are described in plain counts, with no amounts, names or notes', () => {
  const helpers = section('const hasRecords=d=>{', 'const VAULT_MARKER=');
  const context = vm.createContext({ console });
  vm.runInContext(helpers, context);
  const one = { transactions: [{ amount: 123456.78, description: 'Secret payee' }], accounts: [{ name: 'Private account' }], budgets: [], goals: [], purchases: [], settings: { stockWatchlist: null } };
  assert.equal(context.describeWorkspace(one), '1 transaction, 1 account');
  const text = context.describeWorkspace({ ...one, transactions: [{}, {}, {}], goals: [{}], purchases: [{}, {}], settings: { stockWatchlist: ['AAPL', 'MSFT'] } });
  assert.equal(text, '3 transactions, 1 account, 1 goal, 2 planned purchases, a custom stock list (2)');
  assert.doesNotMatch(context.describeWorkspace(one), /Secret|Private|123456/);
  assert.equal(context.describeWorkspace({ settings: { stockWatchlist: [] } }), 'a custom stock list (0)');
  assert.equal(context.describeWorkspace({ settings: { guideMemory: { answer: 'x' } } }), 'only settings or a saved Guide profile');
  assert.equal(context.describeWorkspace({ transactions: [], settings: {} }), 'no records');
  assert.equal(context.describeWorkspace(null), 'no records');
  const saved = Date.UTC(2026, 10, 15, 21, 12);
  assert.match(context.cloudSavedLabel({ updatedAt: saved }), /^ \(last saved [^)]*\d[^)]*\)$/, 'a readable date and time, whatever the machine locale');
  for (const bad of [null, {}, { updatedAt: 0 }, { updatedAt: 'soon' }, { updatedAt: 1e30 }, { updatedAt: { seconds: 5 } }]) assert.equal(context.cloudSavedLabel(bad), '', JSON.stringify(bad));
});

test('the three "which copy to keep" dialogs ignore a stray tap outside them, and the two plaintext ones show both copies', () => {
  const dialogs = [...moduleScript.matchAll(/showNorthstarDialog\(\{title:'(Choose a device workspace|Choose which data to keep|Protected copies are different)'[\s\S]*?choices:\[/g)];
  assert.equal(dialogs.length, 3);
  for (const [text, title] of dialogs) assert.match(text, /sticky:true,choices:\[$/, title);
  assert.match(moduleScript, /contains\('confirm-backdrop'\)&&!confirmSticky\)\{settleNorthstarDialog\(null\)\}/);
  assert.match(moduleScript, /confirmSticky=config\.sticky===true/);
  assert.match(moduleScript, /function settleNorthstarDialog\(value\)\{[^}]*confirmSticky=false/);
  // A double tap on the button that opened the dialog cannot land on a choice in its first half second, and the window always closes.
  assert.match(moduleScript, /confirmArmedAt=confirmSticky\?Date\.now\(\)\+500:0/);
  assert.match(moduleScript, /if\(Date\.now\(\)<confirmArmedAt\)return;const index=Number\(option\.dataset\.confirmIndex\)/);
  assert.match(moduleScript, /function settleNorthstarDialog\(value\)\{[^}]*confirmArmedAt=0/);
  assert.match(moduleScript, /This browser has \$\{here\}\. Your Google account has \$\{there\}\$\{cloudSavedLabel\(raw\)\}/);
  assert.match(moduleScript, /The Google-account copy has \$\{accountCopy\}\. The local workspace has \$\{localCopy\}/);
  // Every other dialog keeps its tap-outside-to-cancel behaviour.
  assert.equal((moduleScript.match(/sticky:true/g) || []).length, 3);
  // Initial focus is on the choice that changes and uploads nothing, in these three dialogs only.
  for (const [text, title] of dialogs) {
    const choices = moduleScript.slice(moduleScript.indexOf(text), moduleScript.indexOf('})', moduleScript.indexOf(text) + text.length));
    assert.match(choices, /\{value:'cancel',label:'Decide later',style:'quiet',focus:true\}/, title);
    assert.equal((choices.match(/focus:true/g) || []).length, 1, title);
  }
  assert.equal((moduleScript.match(/focus:true\}/g) || []).length, 3);
  assert.match(moduleScript, /choices\.findIndex\(choice=>choice\.focus===true\)/);
});

test('the diagnostics offer a direct Firestore check and name the project', () => {
  assert.match(html, /data-action="check-cloud-access"/);
  assert.match(moduleScript, /confirmSyncOutcome\('Cloud load'\)/);
  assert.match(moduleScript, /confirmSyncOutcome\('Protected sync'\)/);
  assert.match(moduleScript, /Sync diagnostics below shows the code, and Check cloud access tests Firestore directly\./);
  assert.match(moduleScript, /firebaseConfig\.projectId/);
});
