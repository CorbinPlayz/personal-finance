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
  assert.match(choice.root.innerHTML, /<button type="button" class="primary-btn small" data-action="choose-sync-data">Choose which data to keep<\/button>/);
  assert.match(choice.context.syncDiagnosticsText(), /tap Choose which data to keep\. Nothing has been overwritten\.$/);
  const other = harness();
  other.context.reportSyncIssue(conflict(), 'Cloud save');
  assert.doesNotMatch(other.root.innerHTML, /choose-sync-data|retry-sync/);
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

test('the three "which copy to keep" questions go through askSyncChoice, are guarded against an early tap, and can never hold the page', () => {
  const dialogs = [...moduleScript.matchAll(/askSyncChoice\(\{title:'(Choose a device workspace|Choose which data to keep|Protected copies are different)'[\s\S]*?choices:\[/g)];
  assert.equal(dialogs.length, 3);
  for (const [text, title] of dialogs) assert.match(text, /guarded:true,cardNote:'[^']+',choices:\[$/, title);
  assert.equal((moduleScript.match(/guarded:true/g) || []).length, 3, 'every other dialog is unchanged');
  assert.doesNotMatch(moduleScript, /showNorthstarDialog\(\{title:'(Choose a device workspace|Choose which data to keep|Protected copies are different)'/, 'no chooser skips askSyncChoice');
  assert.doesNotMatch(moduleScript, /confirmSticky|config\.sticky|sticky:true/, 'a tap outside no longer traps an overlay that cannot be seen');
  // A tap outside leaves the dialog once its first half second is over; a choice button ignores taps for that half second too.
  assert.match(moduleScript, /contains\('confirm-backdrop'\)&&Date\.now\(\)>=confirmArmedAt\)\{settleNorthstarDialog\(null\)\}/);
  assert.match(moduleScript, /confirmGuarded=config\.guarded===true;confirmArmedAt=confirmGuarded\?Date\.now\(\)\+500:0/);
  assert.match(moduleScript, /if\(Date\.now\(\)<confirmArmedAt\)return;const index=Number\(option\.dataset\.confirmIndex\)/);
  assert.match(moduleScript, /function settleNorthstarDialog\(value\)\{[^}]*confirmGuarded=false;confirmArmedAt=0/);
  // The two plaintext questions say what each side holds.
  assert.match(moduleScript, /This browser has \$\{here\}\. Your Google account has \$\{there\}\$\{cloudSavedLabel\(raw\)\}/);
  assert.match(moduleScript, /The Google-account copy has \$\{accountCopy\}\. The local workspace has \$\{localCopy\}/);
  // Initial focus is on the choice that changes and uploads nothing, in these three dialogs only.
  for (const [text, title] of dialogs) {
    const choices = moduleScript.slice(moduleScript.indexOf(text), moduleScript.indexOf('})', moduleScript.indexOf(text) + text.length));
    assert.match(choices, /\{value:'cancel',label:'Decide later',style:'quiet',focus:true\}/, title);
    assert.equal((choices.match(/focus:true/g) || []).length, 1, title);
  }
  assert.equal((moduleScript.match(/focus:true\}/g) || []).length, 3);
  assert.match(moduleScript, /choices\.findIndex\(choice=>choice\.focus===true\)/);
});

test('no dialog combines a blur of its own with an entry animation, and the three questions use a flat overlay', () => {
  // iPhone Safari painted the dimmed page but not the dialog. The dialog had a backdrop-filter of its own nested in the backdrop's, plus an entry animation starting at opacity 0.
  assert.match(html, /\.confirm-backdrop \.confirm-dialog,\.modal-backdrop \.modal\{-webkit-backdrop-filter:none;backdrop-filter:none;animation:none\}/);
  assert.match(html, /\.confirm-backdrop\.confirm-backdrop-plain\{background:rgba\(8,8,8,\.62\)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;animation:none!important\}/);
  assert.match(html, /\.confirm-backdrop-plain \.confirm-dialog\{background:#fff!important;/);
  assert.match(moduleScript, /'<div class="confirm-backdrop'\+\(config\.guarded\?' confirm-backdrop-plain':''\)\+'" role="presentation">/);
  // The override has to come after the layers that set the blur and the animation, or it would lose.
  const override = html.indexOf('.confirm-backdrop .confirm-dialog,.modal-backdrop .modal{-webkit-backdrop-filter:none');
  for (const earlier of ['animation:confirmRise', 'backdrop-filter:blur(30px) saturate(180%)']) assert.ok(html.indexOf(earlier) > 0 && html.lastIndexOf(earlier, override) > 0 && html.lastIndexOf(earlier) < override, `${earlier} comes before the override`);
});

function choiceHarness({ user = { uid: 'alice' }, issueMessage = 'Choose which data to keep to resume cloud sync.', loading = false } = {}) {
  const log = { dialogs: [], toasts: [], retries: [], navigated: [] };
  const h = { log, answer: 'cancel', next: null, asked: [] };
  const context = vm.createContext({
    user, syncLoading: loading, pendingChoice: null, scriptedChoice: null, syncChoiceGuardUntil: 0,
    syncIssue: issueMessage === null ? null : { code: 'northstar/conflict', stage: 'Cloud sync', message: issueMessage },
    esc: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),
    showToast: text => log.toasts.push(text),
    showNorthstarDialog: config => { log.dialogs.push(config); return Promise.resolve(h.answer); },
    // Stands in for onAuthChanged: it asks the question it finds when it runs again.
    retryCloudSync: async () => { log.retries.push(true); if (h.failRetry) throw new Error('retry failed'); for (const asked of [].concat(h.next || [])) h.asked.push(await context.askSyncChoice(asked)); },
    navigate: page => log.navigated.push(page), requestAnimationFrame: callback => callback(), $: () => null,
  });
  vm.runInContext([section('function syncNeedsChoice(', 'function syncIssueStatus('), section('function syncChoiceReady(', 'function syncDiagnosticsText(')].join('\n'), context);
  h.context = context;
  h.read = expression => vm.runInContext(expression, context);
  h.run = code => vm.runInContext(code, context);
  return h;
}
const question = (overrides = {}) => ({
  title: 'Choose which data to keep',
  message: 'Northstar found different finance data. This browser has 1 transaction. Your Google account has 3 transactions (last saved Nov 15, 9:12 PM).',
  cardNote: 'Use cloud copy replaces what this device shows.',
  choices: [{ value: 'cloud', label: 'Use cloud copy' }, { value: 'local', label: 'Keep this device' }, { value: 'cancel', label: 'Decide later', focus: true }],
  ...overrides,
});

test('askSyncChoice remembers the question, forgets it after a real choice, and keeps it after a deferral', async () => {
  const h = choiceHarness();
  for (const deferred of ['cancel', null]) {
    h.answer = deferred;
    assert.equal(await h.context.askSyncChoice(question()), deferred);
    assert.deepEqual(JSON.parse(JSON.stringify(h.read('pendingChoice'))), {
      uid: 'alice', title: 'Choose which data to keep', message: question().message, cardNote: 'Use cloud copy replaces what this device shows.',
      choices: [{ value: 'cloud', label: 'Use cloud copy' }, { value: 'local', label: 'Keep this device' }]
    });
    assert.ok(h.read('syncChoiceGuardUntil') > Date.now(), 'the card ignores an immediate tap after a deferral');
    assert.equal(h.context.syncChoiceReady(), true);
  }
  h.answer = 'local';
  assert.equal(await h.context.askSyncChoice(question()), 'local');
  assert.equal(h.read('pendingChoice'), null);
  assert.equal(h.log.dialogs.length, 3, 'each ask without a scripted answer opens the dialog');
});

test('an answer given from the page applies to an identical question once, and never to a different one', async () => {
  const h = choiceHarness();
  await h.context.askSyncChoice(question());
  h.run('syncChoiceGuardUntil = 0'); h.next = question();
  await h.context.answerSyncChoice('cloud');
  assert.deepEqual(h.asked, ['cloud'], 'the identical question is answered with the visitor\'s choice');
  assert.equal(h.log.dialogs.length, 1, 'no dialog was needed');
  assert.equal(h.read('pendingChoice'), null);
  assert.equal(h.read('scriptedChoice'), null);
  // One shot: the next question opens the dialog.
  h.answer = 'cancel'; assert.equal(await h.context.askSyncChoice(question()), 'cancel'); assert.equal(h.log.dialogs.length, 2);
  // One shot within a single run too: a retry can ask two questions in a row, and only an identical first one is answered for the visitor.
  const twice = choiceHarness(); await twice.context.askSyncChoice(question());
  twice.run('syncChoiceGuardUntil = 0'); twice.next = [question(), question()]; twice.answer = 'cancel';
  await twice.context.answerSyncChoice('local');
  assert.deepEqual(twice.asked, ['local', 'cancel'], 'the stored answer was used up by the first question');
  assert.equal(twice.log.dialogs.length, 2, 'the second question opened the dialog');
  assert.equal(twice.log.toasts.length, 0, 'it was not treated as a changed question');

  for (const [name, changed] of [['the counts changed', { message: question().message.replace('3 transactions', '40 transactions') }], ['another question came first', { title: 'Choose a device workspace' }]]) {
    const g = choiceHarness(); await g.context.askSyncChoice(question());
    g.run('syncChoiceGuardUntil = 0'); g.next = question(changed); g.answer = 'cancel';
    await g.context.answerSyncChoice('local');
    assert.deepEqual(g.asked, ['cancel'], `${name}: the visitor's choice was not applied`);
    assert.equal(g.log.dialogs.length, 2, `${name}: the new question was shown`);
    assert.match(g.log.toasts.at(-1), /^That question changed since you looked, so nothing was applied\./, name);
    assert.equal(g.read('scriptedChoice'), null, name);
    assert.equal(g.read('pendingChoice.message'), changed.message || question().message, `${name}: the card now shows the new question`);
  }
});

test('the page answer is ignored unless a deferred question is really waiting, and it never outlives a failure', async () => {
  const waiting = async overrides => { const h = choiceHarness(overrides); await h.context.askSyncChoice(question()); h.run('syncChoiceGuardUntil = 0'); h.next = question(); return h; };
  const refused = [
    ['an unoffered value', await waiting(), 'cancel'], ['a made-up value', await waiting(), 'delete-everything'],
    ['while syncing', await waiting({ loading: true }), 'cloud'], ['for a different issue', await waiting({ issueMessage: 'Missing or insufficient permissions.' }), 'cloud'], ['with no issue recorded', await waiting({ issueMessage: null }), 'cloud'],
  ];
  for (const [name, h, value] of refused) { await h.context.answerSyncChoice(value); assert.equal(h.log.retries.length, 0, name); assert.equal(h.read('scriptedChoice'), null, name); }
  const other = await waiting(); other.run("user = { uid: 'mallory' }"); await other.context.answerSyncChoice('cloud');
  assert.equal(other.log.retries.length, 0, 'another account cannot answer it'); assert.equal(other.context.syncChoiceReady(), false);
  const early = choiceHarness(); await early.context.askSyncChoice(question()); early.next = question();
  await early.context.answerSyncChoice('cloud'); assert.equal(early.log.retries.length, 0, 'a tap in the first moments after the card appears is ignored');
  const failing = await waiting(); failing.failRetry = true;
  await assert.rejects(failing.context.answerSyncChoice('cloud'), /retry failed/);
  assert.equal(failing.read('scriptedChoice'), null, 'a failed attempt leaves no stored answer behind');
});

test('the in-page question shows the remembered one, escapes it and offers no Decide later', async () => {
  const h = choiceHarness();
  assert.equal(h.context.renderSyncChoiceCard(), '', 'nothing before a question has been deferred');
  h.answer = 'cancel'; await h.context.askSyncChoice(question({ message: 'This browser has <b>1</b> transaction & "more".' }));
  const card = h.context.renderSyncChoiceCard();
  assert.match(card, /id="syncChoiceCard"[^>]*role="group"/);
  assert.match(card, /This browser has &lt;b&gt;1&lt;\/b&gt; transaction &amp; &quot;more&quot;\./);
  assert.match(card, /data-action="answer-sync-choice" data-value="cloud">Use cloud copy<\/button>/);
  assert.match(card, /data-action="answer-sync-choice" data-value="local">Keep this device<\/button>/);
  assert.doesNotMatch(card, /cancel|Decide later/);
  assert.match(card, /Nothing changes until you tap a button\./);
  h.run('syncLoading = true'); assert.equal(h.context.renderSyncChoiceCard(), '', 'hidden while a sync is running');
});

test('the one-tap button opens the in-page question when there is one, and asks again when there is not', async () => {
  const h = choiceHarness(); h.context.chooseSyncData();
  assert.deepEqual([h.log.retries.length, h.log.navigated.length], [1, 0], 'no remembered question yet: ask again');
  h.answer = 'cancel'; await h.context.askSyncChoice(question()); h.run('syncChoiceGuardUntil = 0');
  h.context.chooseSyncData();
  assert.deepEqual(h.log.navigated, ['Settings']); assert.equal(h.log.retries.length, 1);
  assert.ok(h.read('syncChoiceGuardUntil') > Date.now(), 'a double tap on the button cannot land on the card');
  h.run('syncLoading = true'); h.context.chooseSyncData();
  assert.equal(h.log.navigated.length, 1); assert.equal(h.log.retries.length, 1, 'ignored while a sync runs');
});

test('the diagnostics offer a direct Firestore check and name the project', () => {
  assert.match(html, /data-action="check-cloud-access"/);
  assert.match(moduleScript, /confirmSyncOutcome\('Cloud load'\)/);
  assert.match(moduleScript, /confirmSyncOutcome\('Protected sync'\)/);
  assert.match(moduleScript, /Sync diagnostics below shows the code, and Check cloud access tests Firestore directly\./);
  assert.match(moduleScript, /firebaseConfig\.projectId/);
});
