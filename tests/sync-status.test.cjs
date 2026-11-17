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

test('the three "which copy to keep" questions go through askSyncChoice, which never opens a dialog, and each carries both copies in its signature', () => {
  const titles = ['Choose a device workspace', 'Choose which data to keep', 'Protected copies are different'];
  assert.equal((moduleScript.match(/askSyncChoice\(\{title:/g) || []).length, 3);
  for (const title of titles) {
    const from = moduleScript.indexOf(`askSyncChoice({title:'${title}'`);
    assert.ok(from > 0, title);
    const call = moduleScript.slice(from, moduleScript.indexOf('})', moduleScript.indexOf('choices:[', from)) + 2);
    assert.match(call, /,signature:dataSignature\([A-Za-z]+\)\+'\\n'\+dataSignature\([A-Za-z]+\),cardNote:'[^']+',choices:\[\{value:'[a-z]+',label:'[^']+'\},\{value:'[a-z]+',label:'[^']+'\}\]\}\)$/, title);
    assert.doesNotMatch(call, /cancel|Decide later|guarded|focus:true|detail:|icon:|label:'[A-Z ]+'/, `${title}: nothing is left of the pop-up`);
  }
  assert.doesNotMatch(moduleScript, /showNorthstarDialog\(\{title:'(Choose a device workspace|Choose which data to keep|Protected copies are different)'/, 'no chooser skips askSyncChoice');
  const asking = section('function askSyncChoice(', 'async function answerSyncChoice(');
  assert.doesNotMatch(asking, /showNorthstarDialog/, 'asking never opens an overlay that could fail to paint or hold the page');
  assert.match(asking, /return Promise\.resolve\(null\)\s*\}\s*$/, 'the callers get "not decided yet" at once');
  assert.doesNotMatch(moduleScript, /confirmGuarded|confirmArmedAt|confirm-backdrop-plain|confirm-dialog-choice|config\.guarded|confirmSticky|config\.sticky|sticky:true/, 'the guarded overlay is gone');
  // The two plaintext questions say what each side holds.
  assert.match(moduleScript, /This browser has \$\{here\}\. Your Google account has \$\{there\}\$\{cloudSavedLabel\(raw\)\}/);
  assert.match(moduleScript, /The Google-account copy has \$\{accountCopy\}\. The local workspace has \$\{localCopy\}/);
  // The bar lives outside the page shell (which is inert while a sync runs), and every change of state redraws it.
  assert.match(html, /<div id="toastRoot" aria-live="polite"><\/div><div id="syncChoiceBarRoot"><\/div>/);
  assert.ok(html.indexOf('id="syncChoiceBarRoot"') > html.indexOf('<main') || html.indexOf('id="syncChoiceBarRoot"') > html.indexOf('class="app-shell"'));
  assert.match(section('function renderSyncIssueBanner(', 'function showSyncDetailsDialog('), /try\{renderSyncChoiceBar\(\)\}catch\(e\)\{\}/);
  assert.match(section('function updateBackgroundAvailability(', 'function setCloudLoading('), /try\{renderSyncChoiceBar\(\)\}catch\(e\)\{\}/);
  assert.match(moduleScript, /case'answer-sync-choice':answerSyncChoice\(b\.dataset\.value\);break;case'minimize-sync-choice':minimizeSyncChoice\(\);break;case'expand-sync-choice':expandSyncChoice\(\);break;/);
  assert.match(moduleScript, /initWelcomeJourney\(\);initSyncChoiceLayout\(\);updateBackgroundAvailability\(\)/);
  assert.doesNotMatch(section('function renderSettings(', 'function openModal('), /syncChoice|SyncChoice/, 'Settings neither hides the question further down the page nor hides its own button because of it');
  assert.doesNotMatch(section('function renderSyncIssuePanel(', 'function renderSettings('), /syncChoice|SyncChoice/);
});

test('the bar is pinned to the screen above the tab bar, lifts the toast and the assistant button, and has no blur or animation to fail to paint', () => {
  const rule = html.match(/\.sync-choice-bar\{([^}]*)\}/)?.[1];
  assert.ok(rule, 'the bar has a rule');
  assert.match(rule, /position:fixed;/, 'pinned to the screen, not to the page');
  assert.match(rule, /bottom:calc\(var\(--dock-height,67px\) \+ 20px \+ env\(safe-area-inset-bottom,0px\)\)/, 'right above the tab bar');
  assert.match(rule, /z-index:55;/, 'under the tab bar (60), toasts (80) and every overlay');
  assert.match(html, /#mobileDock\{[^}]*z-index:60;/);
  assert.doesNotMatch(rule, /backdrop-filter|animation|transition|transform/, 'nothing that iPhone Safari is known to leave unpainted');
  assert.match(rule, /max-height:min\(60vh,calc\(100vh - var\(--dock-height,67px\) - 110px\)\);max-height:min\(60dvh,calc\(100dvh - var\(--dock-height,67px\) - 110px - env\(safe-area-inset-bottom,0px\)\)\);overflow-y:auto;/, 'a question never takes more than 60% of the screen; past that it scrolls inside itself');
  assert.match(html, /\.sync-choice-buttons\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,118px\),1fr\)\);/, 'the two choices sit side by side and stack only on a very narrow screen');
  assert.doesNotMatch(section('function syncChoiceBarHtml(', 'function renderSyncChoiceBar('), /sync-choice-note/, 'the bar does not share a class with the diagnostics panel note');
  assert.doesNotMatch(html, /\n\.sync-choice-note\{/, 'so the panel note keeps only its own styling');
  assert.doesNotMatch(rule, /top:|inset:/, 'it is anchored to the bottom only, never centred');
  assert.match(html, /body\.has-sync-choice-bar \.toast,body\.has-sync-choice-bar \.nsj-orb\{bottom:calc\(var\(--dock-height,67px\) \+ 30px \+ var\(--sync-choice-height,0px\) \+ env\(safe-area-inset-bottom,0px\)\)\}/, 'a toast and the assistant button sit above the bar instead of under it');
  assert.match(html, /body\.has-sync-choice-bar \.app-shell \.content\{padding-bottom:calc\(118px \+ var\(--sync-choice-height,0px\) \+ 14px/, 'the last of the page can be scrolled above the bar');
  // iPhone Safari painted the dimmed page but not a dialog. Dialogs had a backdrop-filter of their own nested in the backdrop's, plus an entry animation starting at opacity 0.
  assert.match(html, /\.confirm-backdrop \.confirm-dialog,\.modal-backdrop \.modal\{-webkit-backdrop-filter:none;backdrop-filter:none;animation:none\}/);
  // The override has to come after the layers that set the blur and the animation, or it would lose.
  const override = html.indexOf('.confirm-backdrop .confirm-dialog,.modal-backdrop .modal{-webkit-backdrop-filter:none');
  for (const earlier of ['animation:confirmRise', 'backdrop-filter:blur(30px) saturate(180%)']) assert.ok(html.indexOf(earlier) > 0 && html.lastIndexOf(earlier, override) > 0 && html.lastIndexOf(earlier) < override, `${earlier} comes before the override`);
});

function choiceHarness({ user = { uid: 'alice' }, issueMessage = 'Choose which data to keep to resume cloud sync.', loading = false } = {}) {
  const log = { toasts: [], retries: [], styles: new Map(), classes: new Set(), rootWrites: 0, focused: [] };
  const h = { log, next: null, asked: [], welcome: false };
  const root = { _html: '', get innerHTML() { return this._html; }, set innerHTML(value) { this._html = value; log.rootWrites++; }, get firstChild() { return this._html ? {} : null; } };
  const open = { focus: options => log.focused.push(['open', options]) };
  const bar = { offsetHeight: 180, focus: options => log.focused.push(['bar', options]), querySelector: selector => (root.innerHTML.includes('data-action="expand-sync-choice"') && selector.includes('expand-sync-choice') ? open : null) };
  const context = vm.createContext({
    user, syncLoading: loading, pendingChoice: null, scriptedChoice: null, syncChoiceGuardUntil: 0, syncChoiceCollapsed: false, syncChoiceShown: '',
    syncIssue: issueMessage === null ? null : { code: 'northstar/conflict', stage: 'Cloud sync', message: issueMessage },
    esc: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),
    showToast: text => log.toasts.push(text),
    showNorthstarDialog: () => { throw new Error('a "which copy to keep" question must not open a dialog'); },
    // Stands in for onAuthChanged: it asks the question it finds when it runs again.
    retryCloudSync: async () => { log.retries.push(true); if (h.failRetry) throw new Error('retry failed'); h.beforeAsk?.(); for (const asked of [].concat(h.next || [])) h.asked.push(await context.askSyncChoice(asked)); },
    isWelcomeVisible: () => h.welcome, window: { NorthstarVaultLocked: false, addEventListener() {} },
    document: { documentElement: { style: { setProperty: (name, value) => log.styles.set(name, value), removeProperty: name => log.styles.delete(name) } }, body: { classList: { toggle: (name, on) => (on ? log.classes.add(name) : log.classes.delete(name)) } } },
    $: id => ({ syncChoiceBarRoot: root, syncChoiceBar: root.innerHTML.includes('id="syncChoiceBar"') ? bar : null, mobileDock: { offsetHeight: 67 } }[id] || null),
    requestAnimationFrame: callback => callback(),
  });
  vm.runInContext([section('function syncNeedsChoice(', 'function syncIssueStatus('), section('function syncChoiceReady(', 'function syncDiagnosticsText(')].join('\n'), context);
  h.context = context; h.root = root;
  h.read = expression => vm.runInContext(expression, context);
  h.run = code => vm.runInContext(code, context);
  return h;
}
const question = (overrides = {}) => ({
  title: 'Choose which data to keep',
  message: 'Northstar found different finance data. This browser has 1 transaction. Your Google account has 3 transactions (last saved Nov 15, 9:12 PM).',
  cardNote: 'Use cloud copy replaces what this device shows.',
  signature: 'device-copy\ncloud-copy',
  choices: [{ value: 'cloud', label: 'Use cloud copy' }, { value: 'local', label: 'Keep this device' }, { value: 'cancel', label: 'Decide later', focus: true }],
  ...overrides,
});

test('askSyncChoice remembers the question and says "not decided yet" at once, without any overlay', async () => {
  const h = choiceHarness();
  for (let again = 0; again < 2; again++) {
    assert.equal(await h.context.askSyncChoice(question()), null);
    assert.deepEqual(JSON.parse(JSON.stringify(h.read('pendingChoice'))), {
      uid: 'alice', title: 'Choose which data to keep', message: question().message, cardNote: 'Use cloud copy replaces what this device shows.', signature: 'device-copy\ncloud-copy',
      choices: [{ value: 'cloud', label: 'Use cloud copy' }, { value: 'local', label: 'Keep this device' }]
    });
    assert.ok(h.read('syncChoiceGuardUntil') > Date.now(), 'the bar ignores an immediate tap when it appears');
    assert.equal(h.read('syncChoiceCollapsed'), false, 'a new question starts open');
    assert.equal(h.context.syncChoiceReady(), true);
  }
  assert.match(h.root.innerHTML, /Which copy should Northstar keep\?/, 'the question is on screen as soon as it is asked');
});

test('an answer given from the bar applies to an identical question once, and never to a different one', async () => {
  const h = choiceHarness();
  await h.context.askSyncChoice(question());
  h.run('syncChoiceGuardUntil = 0'); h.next = question();
  await h.context.answerSyncChoice('cloud');
  assert.deepEqual(h.asked, ['cloud'], 'the identical question is answered with the visitor\'s choice');
  assert.equal(h.read('pendingChoice'), null);
  assert.equal(h.read('scriptedChoice'), null);
  // One shot: the next question is only asked.
  assert.equal(await h.context.askSyncChoice(question()), null);
  // One shot within a single run too: a retry can ask two questions in a row, and only an identical first one is answered for the visitor.
  const twice = choiceHarness(); await twice.context.askSyncChoice(question());
  twice.run('syncChoiceGuardUntil = 0'); twice.next = [question(), question()];
  await twice.context.answerSyncChoice('local');
  assert.deepEqual(twice.asked, ['local', null], 'the stored answer was used up by the first question');
  assert.equal(twice.log.toasts.length, 0, 'it was not treated as a changed question');

  for (const [name, changed] of [
    ['the counts changed', { message: question().message.replace('3 transactions', '40 transactions') }],
    ['another question came first', { title: 'Choose a device workspace' }],
    ['a value in this device\'s copy was edited while the question waited', { signature: 'edited-device-copy\ncloud-copy' }],
    ['the cloud copy was changed by another device', { signature: 'device-copy\nnewer-cloud-copy' }],
    ['the answer is no longer one of the choices', { choices: [{ value: 'account', label: 'Use account device copy' }, { value: 'local', label: 'Use local workspace' }] }],
  ]) {
    const g = choiceHarness(); await g.context.askSyncChoice(question());
    g.run('syncChoiceGuardUntil = 0'); g.next = question(changed);
    await g.context.answerSyncChoice('cloud');
    assert.deepEqual(g.asked, [null], `${name}: the visitor's choice was not applied`);
    assert.match(g.log.toasts.at(-1), /^That question changed since you looked, so nothing was applied\./, name);
    assert.equal(g.read('scriptedChoice'), null, name);
    assert.equal(g.read('pendingChoice.title'), changed.title || question().title, `${name}: the bar now shows the new question`);
    assert.equal(g.read('pendingChoice.signature'), changed.signature || question().signature, name);
  }
});

test('an answer given for one account is never applied to another account\'s question, even one that reads the same', async () => {
  const h = choiceHarness(); await h.context.askSyncChoice(question());
  h.run('syncChoiceGuardUntil = 0'); h.next = question(); // the same title, counts, copies and choices
  h.beforeAsk = () => h.run("user = { uid: 'bob' }"); // another account signs in while the answer is being applied
  await h.context.answerSyncChoice('cloud');
  assert.deepEqual(h.asked, [null], 'the answer was not carried over to the other account');
  assert.match(h.log.toasts.at(-1), /^That question changed since you looked, so nothing was applied\./);
  assert.equal(h.read('scriptedChoice'), null);
  assert.equal(h.read('pendingChoice.uid'), 'bob', 'the bar now holds the other account\'s question');
});

test('the bar answer is ignored unless a question is really waiting, and it never outlives a failure', async () => {
  const waiting = async overrides => { const h = choiceHarness(overrides); await h.context.askSyncChoice(question()); h.run('syncChoiceGuardUntil = 0'); h.next = question(); return h; };
  const refused = [
    ['an unoffered value', await waiting(), 'cancel'], ['a made-up value', await waiting(), 'delete-everything'],
    ['while syncing', await waiting({ loading: true }), 'cloud'], ['for a different issue', await waiting({ issueMessage: 'Missing or insufficient permissions.' }), 'cloud'], ['with no issue recorded', await waiting({ issueMessage: null }), 'cloud'],
  ];
  for (const [name, h, value] of refused) { await h.context.answerSyncChoice(value); assert.equal(h.log.retries.length, 0, name); assert.equal(h.read('scriptedChoice'), null, name); }
  const other = await waiting(); other.run("user = { uid: 'mallory' }"); await other.context.answerSyncChoice('cloud');
  assert.equal(other.log.retries.length, 0, 'another account cannot answer it'); assert.equal(other.context.syncChoiceReady(), false);
  const early = choiceHarness(); await early.context.askSyncChoice(question()); early.next = question();
  await early.context.answerSyncChoice('cloud'); assert.equal(early.log.retries.length, 0, 'a tap in the first moments after the bar appears is ignored');
  const failing = await waiting(); failing.failRetry = true;
  await assert.rejects(failing.context.answerSyncChoice('cloud'), /retry failed/);
  assert.equal(failing.read('scriptedChoice'), null, 'a failed attempt leaves no stored answer behind');
});

test('the bar shows the remembered question, escapes it, offers no Decide later, and can shrink to a strip', async () => {
  const h = choiceHarness();
  assert.equal(h.root.innerHTML, '', 'nothing before a question has been asked');
  await h.context.askSyncChoice(question({ message: 'This browser has <b>1</b> transaction & "more".' }));
  const open = h.root.innerHTML;
  assert.match(open, /id="syncChoiceBar"[^>]*role="group"/);
  assert.match(open, /<h2 id="syncChoiceTitle">Which copy should Northstar keep\?<\/h2>/);
  assert.match(open, /This browser has &lt;b&gt;1&lt;\/b&gt; transaction &amp; &quot;more&quot;\./);
  assert.match(open, /data-action="answer-sync-choice" data-value="cloud">Use cloud copy<\/button>/);
  assert.match(open, /data-action="answer-sync-choice" data-value="local">Keep this device<\/button>/);
  assert.doesNotMatch(open, /cancel|Decide later/);
  assert.match(open, /Use cloud copy replaces what this device shows\./);
  assert.match(open, /Nothing changes until you tap a button\./);
  assert.match(open, /data-action="minimize-sync-choice"[^>]*>Later<\/button>/);
  assert.doesNotMatch(open, /Open<\/button>/);

  // Later and Open change how the question is shown, never what is decided.
  h.context.minimizeSyncChoice();
  const strip = h.root.innerHTML;
  assert.match(strip, /class="sync-choice-bar is-collapsed" id="syncChoiceBar"/);
  assert.match(strip, /<strong>Choose which data to keep<\/strong><button type="button" class="primary-btn small" data-action="expand-sync-choice">Open<\/button>/);
  assert.doesNotMatch(strip, /answer-sync-choice|Use cloud copy|Keep this device/, 'a strip cannot answer anything');
  assert.deepEqual(JSON.parse(JSON.stringify(h.log.focused.at(-1))), ['open', { preventScroll: true }], 'focus follows the button that replaced Later');
  h.run('syncChoiceGuardUntil = 0'); h.context.expandSyncChoice();
  assert.equal(h.root.innerHTML, open, 'opening shows the same question again');
  assert.ok(h.read('syncChoiceGuardUntil') > Date.now(), 'the tap that opened it cannot land on a choice');
  assert.equal(h.log.retries.length, 0, 'nothing was decided or retried');
  assert.equal(h.read('scriptedChoice'), null);
  assert.equal(h.read('pendingChoice.message'), 'This browser has <b>1</b> transaction & "more".');
  // Drawing the same state again does not rebuild the bar, so a tap in progress keeps its button.
  const writes = h.log.rootWrites; h.context.renderSyncChoiceBar(); h.context.renderSyncChoiceBar();
  assert.equal(h.log.rootWrites, writes, 'an unchanged bar is left alone');
});

test('the tap guard starts when the bar actually appears, not when the question was asked', async () => {
  const h = choiceHarness({ loading: true }); // the sync that asks the question is still running
  await h.context.askSyncChoice(question());
  assert.equal(h.root.innerHTML, '', 'nothing is on screen while that sync runs');
  h.run('syncChoiceGuardUntil = 0'); // the guard from the moment of asking has long run out
  h.run('syncLoading = false'); h.context.renderSyncChoiceBar();
  assert.match(h.root.innerHTML, /Which copy should Northstar keep\?/);
  const until = h.read('syncChoiceGuardUntil');
  assert.ok(until > Date.now(), 'a tap in the first moments after the bar shows is ignored');
  h.context.renderSyncChoiceBar(); h.context.renderSyncChoiceBar();
  assert.equal(h.read('syncChoiceGuardUntil'), until, 'drawing the same bar again does not move the guard');
  await h.context.answerSyncChoice('cloud'); assert.equal(h.log.retries.length, 0, 'so an immediate tap on a choice does nothing');
  // Each time it comes back from being hidden, it protects the first tap again.
  for (const [hide, show] of [[() => { h.welcome = true; }, () => { h.welcome = false; }], [() => h.run('window.NorthstarVaultLocked = true'), () => h.run('window.NorthstarVaultLocked = false')]]) {
    hide(); h.context.renderSyncChoiceBar(); assert.equal(h.root.innerHTML, '');
    h.run('syncChoiceGuardUntil = 0'); show(); h.context.renderSyncChoiceBar();
    assert.ok(h.read('syncChoiceGuardUntil') > Date.now(), 'guarded again when it returns');
  }
  // Opening the bar from its strip does the same.
  h.context.minimizeSyncChoice(); h.run('syncChoiceGuardUntil = 0'); h.context.expandSyncChoice();
  assert.ok(h.read('syncChoiceGuardUntil') > Date.now(), 'and when it is opened from the strip');
});

test('the bar is hidden while syncing, behind the welcome screen or a locked vault, and publishes its height for the layout', async () => {
  const h = choiceHarness();
  await h.context.askSyncChoice(question());
  assert.equal(h.log.styles.get('--sync-choice-height'), '180px');
  assert.equal(h.log.styles.get('--dock-height'), '67px', 'the bar learns how tall the tab bar is');
  assert.equal(h.log.classes.has('has-sync-choice-bar'), true, 'the page, the toast and the assistant button make room');
  for (const [name, hide, show] of [
    ['a sync is running', () => h.run('syncLoading = true'), () => h.run('syncLoading = false')],
    ['the welcome screen is showing', () => { h.welcome = true; }, () => { h.welcome = false; }],
    ['the protected workspace is locked', () => h.run('window.NorthstarVaultLocked = true'), () => h.run('window.NorthstarVaultLocked = false')],
  ]) {
    hide(); h.context.renderSyncChoiceBar();
    assert.equal(h.root.innerHTML, '', `hidden while ${name}`);
    assert.equal(h.log.classes.has('has-sync-choice-bar'), false, name);
    assert.equal(h.log.styles.has('--sync-choice-height'), false, name);
    show(); h.context.renderSyncChoiceBar();
    assert.match(h.root.innerHTML, /Which copy should Northstar keep\?/, `back when ${name} ends`);
    assert.equal(h.log.classes.has('has-sync-choice-bar'), true, name);
  }
  h.run("syncIssue = null"); h.context.renderSyncChoiceBar();
  assert.equal(h.root.innerHTML, '', 'gone once nothing is waiting any more');
});

test('the one-tap buttons bring the bar back when a question waits, and ask again when none does', async () => {
  const h = choiceHarness(); h.context.chooseSyncData();
  assert.equal(h.log.retries.length, 1, 'no remembered question yet (a reload, for instance): ask again');
  await h.context.askSyncChoice(question()); h.context.minimizeSyncChoice(); h.run('syncChoiceGuardUntil = 0');
  h.context.chooseSyncData();
  assert.equal(h.log.retries.length, 1, 'nothing is asked again while the question is already waiting');
  assert.match(h.root.innerHTML, /Which copy should Northstar keep\?/, 'a minimised question is opened');
  assert.deepEqual(JSON.parse(JSON.stringify(h.log.focused.at(-1))), ['bar', { preventScroll: true }], 'and given focus without moving the page');
  assert.ok(h.read('syncChoiceGuardUntil') > Date.now(), 'a double tap on the button cannot land on a choice');
  h.run('syncLoading = true'); h.context.chooseSyncData();
  assert.equal(h.log.retries.length, 1, 'ignored while a sync runs');
});

test('the diagnostics offer a direct Firestore check and name the project', () => {
  assert.match(html, /data-action="check-cloud-access"/);
  assert.match(moduleScript, /confirmSyncOutcome\('Cloud load'\)/);
  assert.match(moduleScript, /confirmSyncOutcome\('Protected sync'\)/);
  assert.match(moduleScript, /Sync diagnostics below shows the code, and Check cloud access tests Firestore directly\./);
  assert.match(moduleScript, /firebaseConfig\.projectId/);
});
