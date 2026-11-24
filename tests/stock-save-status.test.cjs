// Run with: node --test tests/stock-save-status.test.cjs
// Runs the production save-status wiring from index.html against fake sync state,
// a fake clock and fake cloud writes. It checks what the Stocks page tells a
// visitor about where a watchlist edit went; it does not contact Firebase.
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
const stateHelpers = section('/* Where does a watchlist edit go right now?', 'function syncStockFeed(');
const saveHelpers = section('// Every place that drops a pending save', '/* iOS Safari and an installed home-screen app');
const setSyncLine = moduleScript.split('\n').find(line => line.startsWith('function setSync('));
const errorCode = section('function firebaseErrorCode(', '\nfunction ');
// The real predicate, not a stub: it decides whether the line offers the one-tap "choose which data to keep".
const needsChoiceLine = moduleScript.split('\n').find(line => line.startsWith('function syncNeedsChoice('));
assert.ok(setSyncLine && needsChoiceLine);

const signedIn = { uid: 'alice' };
async function harness(overrides = {}) {
  const view = await import('../stock-watchlist-view.mjs');
  const timers = new Map(), writes = [], renders = [], toasts = [];
  let nextTimer = 0;
  const line = { dataset: {}, assignments: 0, _html: '', get innerHTML() { return this._html; }, set innerHTML(value) { this._html = value; this.assignments++; } };
  const header = { textContent: '', title: '', className: '' };
  const elements = { stockSaveStatus: line, syncStatus: header };
  const context = vm.createContext({
    user: null, authReady: true, fb: {}, authResolved: true, syncLoading: false, cloudSaving: false, cloudSaveTicket: 0, cloudLoaded: false,
    cloudEpoch: 1, cloudSavedAt: 0, lastSyncError: null, syncIssue: null, saveTimer: 0, page: 'Stocks',
    vault: { state: 'off' }, data: { settings: {} },
    stockSaveStatus: view.stockSaveStatus, renderStockSaveStatus: view.renderStockSaveStatus,
    $: id => elements[id] || null,
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => { timers.delete(id); },
    console: { error() {}, warn() {} },
    writeCloudNow: () => new Promise((resolve, reject) => writes.push({ resolve, reject })),
    clearSyncIssue: () => { context.syncIssue = null; },
    reportSyncIssue: error => { context.syncIssue = { code: context.firebaseErrorCode(error) }; return context.syncIssue.code; },
    syncFailureStatus: (stage, error) => `${stage} needs attention · ${context.firebaseErrorCode(error)}`,
    firebaseErrorDetails: () => 'The cloud save failed.', showToast: text => toasts.push(text), render: () => renders.push(context.page),
    navigator: { onLine: true },
    ...overrides,
  });
  vm.runInContext([errorCode, setSyncLine, needsChoiceLine, stateHelpers, saveHelpers].join('\n'), context);
  return {
    context, line, header, writes, renders, toasts, timers,
    text: () => line.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    // Run the oldest scheduled save, as the clock would after the 700 ms delay.
    fire() { const [id, fn] = timers.entries().next().value; timers.delete(id); return fn(); },
  };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('the Stocks save line is derived from the live sync variables', async () => {
  const custom = { settings: { stockWatchlist: ['AAPL'] } };
  const cases = [
    ['signed out', {}, /^Saved on this device only\. Sign in with Google to save your list to your account too\.$/],
    ['sign-in state not reported yet', { authResolved: false }, /^Checking whether you are signed in…$/],
    ['Firebase could not load', { fb: null, lastSyncError: Object.assign(new Error('x'), { name: 'TypeError' }) }, /^Saved on this device only\. Cloud sync is unavailable because Firebase did not load \(TypeError\)\. Open sync diagnostics$/],
    ['still loading the cloud copy', { user: signedIn, syncLoading: true }, /^Checking your cloud copy…$/],
    ['a save is in flight', { user: signedIn, cloudLoaded: true, cloudSaving: true, data: custom }, /^Saving to your Google account…$/],
    ['confirmed, untouched starter list', { user: signedIn, cloudLoaded: true }, /^Showing the starter list\. Your first add or remove saves your own list to your Google account\.$/],
    ['confirmed, custom list', { user: signedIn, cloudLoaded: true, data: custom, cloudSavedAt: Date.UTC(2026, 10, 16, 21, 46) }, /^Saved to your Google account · confirmed \d{1,2}:\d{2}/],
    ['confirmed, protected workspace', { user: signedIn, cloudLoaded: true, data: custom, vault: { state: 'unlocked' } }, /^Saved to your Google account, encrypted with your passphrase\.$/],
    ['paused with a recorded issue', { user: signedIn, syncIssue: { code: 'permission-denied' } }, /^Saved on this device only\. Cloud sync is paused \(permission-denied\)\. Open sync diagnostics$/],
    ['paused with only an error object', { user: signedIn, lastSyncError: { code: 'unavailable' } }, /paused \(unavailable\)\./],
    ['loaded earlier but an error is still held', { user: signedIn, cloudLoaded: true, data: custom, lastSyncError: { code: 'unavailable' } }, /paused \(unavailable\)\./],
    ['waiting on a conflict choice without a code', { user: signedIn }, /^Saved on this device only\. Cloud sync is paused\. Open sync diagnostics$/],
    ['waiting for the visitor to choose between two copies', { user: signedIn, syncIssue: { code: 'northstar/conflict', message: 'Choose which data to keep to resume cloud sync.' } }, /^Saved on this device only\. Cloud sync is waiting for you to choose which data to keep \(northstar\/conflict\)\. Choose which data to keep$/],
    ['a write conflict is not a pending choice', { user: signedIn, syncIssue: { code: 'northstar/conflict', message: 'The cloud copy changed on another device. Review the conflict before saving.' } }, /^Saved on this device only\. Cloud sync is paused \(northstar\/conflict\)\. Open sync diagnostics$/],
  ];
  for (const [name, overrides, expected] of cases) {
    const h = await harness(overrides);
    h.context.updateStockSaveStatus();
    assert.match(h.text(), expected, name);
  }
});

test('signed in but unconfirmed is never worded as saved to the account', async () => {
  for (const overrides of [{ user: signedIn }, { user: signedIn, syncIssue: { code: 'northstar/conflict' } }, { user: signedIn, cloudLoaded: true, lastSyncError: new Error('x') }, { user: null, cloudLoaded: true }]) {
    const h = await harness({ data: { settings: { stockWatchlist: ['AAPL'] } }, ...overrides });
    h.context.updateStockSaveStatus();
    assert.doesNotMatch(h.text(), /^Saved to your Google account/, JSON.stringify(overrides));
  }
});

test('the one-tap choice button goes to the in-page question, while other pauses still open diagnostics', async () => {
  const choose = await harness({ user: signedIn, syncIssue: { code: 'northstar/conflict', message: 'Choose a device workspace to resume cloud sync.' } });
  choose.context.updateStockSaveStatus();
  assert.match(choose.line.innerHTML, /<button type="button" class="stock-save-link" data-action="choose-sync-data">Choose which data to keep<\/button>/);
  assert.doesNotMatch(choose.line.innerHTML, /data-page=/);
  const paused = await harness({ user: signedIn, syncIssue: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } });
  paused.context.updateStockSaveStatus();
  assert.match(paused.line.innerHTML, /data-action="page" data-page="Settings">Open sync diagnostics</);
  assert.match(stateHelpers, /needsChoice:syncNeedsChoice\(\)/, 'the page feeds the real predicate into the line');
});

test('every edit toast says where the edit went', async () => {
  const cases = [
    [{}, ' · saved on this device only'],
    [{ user: signedIn, cloudLoaded: true }, ' · saving to your account…'],
    [{ user: signedIn, cloudLoaded: false }, ' · saved on this device only; cloud sync is paused'],
    [{ user: signedIn, cloudLoaded: true, lastSyncError: new Error('x') }, ' · saved on this device only; cloud sync is paused'],
  ];
  for (const [overrides, expected] of cases) assert.equal((await harness(overrides)).context.stockSaveSuffix(), expected, JSON.stringify(overrides));
});

test('setSync refreshes the line in place, only when it changed, and tolerates other pages', async () => {
  const h = await harness({ user: signedIn, cloudLoaded: true, data: { settings: { stockWatchlist: ['AAPL'] } } });
  h.context.setSync('Cloud sync on', 'ok');
  assert.equal(h.header.textContent, 'Cloud sync on'); assert.equal(h.header.className, 'sync-state ok');
  assert.equal(h.line.dataset.tone, 'ok'); assert.match(h.text(), /^Saved to your Google account/);
  const assignments = h.line.assignments;
  h.context.setSync('Cloud sync on', 'ok'); h.context.setSync('Cloud sync on', 'ok');
  assert.equal(h.line.assignments, assignments, 'an unchanged line is not rewritten, so the DOM is not churned');
  h.context.lastSyncError = { code: 'unavailable' }; h.context.setSync('Sync error · unavailable', 'err');
  assert.equal(h.line.dataset.tone, 'warn'); assert.match(h.text(), /paused \(unavailable\)/);
  // Pages without the line (anything but Stocks) must not throw.
  const elsewhere = await harness({ user: signedIn });
  elsewhere.context.$ = id => (id === 'syncStatus' ? elsewhere.header : null);
  assert.doesNotThrow(() => elsewhere.context.setSync('Local only', ''));
});

test('a save is shown as in flight until the cloud confirms it, and a failed write is shown as paused', async () => {
  const h = await harness({ user: signedIn, cloudLoaded: true, data: { settings: { stockWatchlist: ['AAPL'] } } });
  h.context.queueCloudSave();
  assert.equal(h.context.cloudSaving, true); assert.equal(h.text(), 'Saving to your Google account…'); assert.equal(h.line.dataset.tone, 'neutral');
  const run = h.fire(); await flush();
  assert.equal(h.context.cloudSaving, true, 'still in flight while the write is outstanding');
  h.writes[0].resolve(); await run;
  assert.equal(h.context.cloudSaving, false); assert.match(h.text(), /^Saved to your Google account/); assert.deepEqual(h.renders, [], 'no full re-render on the Stocks page');

  h.context.queueCloudSave(); const failing = h.fire(); await flush();
  h.writes[1].reject(Object.assign(new Error('offline'), { code: 'unavailable' })); await failing;
  assert.equal(h.context.cloudSaving, false); assert.equal(h.context.cloudLoaded, false);
  assert.equal(h.line.dataset.tone, 'warn'); assert.match(h.text(), /^Saved on this device only\. Cloud sync is paused \(unavailable\)\. Open sync diagnostics$/);
  assert.deepEqual(h.renders, []); assert.equal(h.toasts.length, 1);
});

test('an older write finishing never marks a newer pending edit as saved', async () => {
  const h = await harness({ user: signedIn, cloudLoaded: true, data: { settings: { stockWatchlist: ['AAPL'] } } });
  h.context.queueCloudSave(); const first = h.fire(); await flush();      // edit 1 is being written
  h.context.queueCloudSave();                                           // edit 2 is queued behind it
  h.writes[0].resolve(); await first;
  assert.equal(h.context.cloudSaving, true); assert.equal(h.text(), 'Saving to your Google account…');
  const second = h.fire(); await flush(); h.writes[1].resolve(); await second;
  assert.equal(h.context.cloudSaving, false); assert.match(h.text(), /^Saved to your Google account/);
});

test('cancelling a pending save clears the in-flight state and its timer', async () => {
  const h = await harness({ user: signedIn, cloudLoaded: true, data: { settings: { stockWatchlist: ['AAPL'] } } });
  h.context.queueCloudSave(); assert.equal(h.timers.size, 1);
  h.context.cancelCloudSave();
  assert.equal(h.context.cloudSaving, false); assert.equal(h.timers.size, 0, 'the pending write never runs');
  h.context.updateStockSaveStatus(); assert.doesNotMatch(h.text(), /Saving/);
});

test('a finished save re-renders every page except Stocks, which updates its own line', async () => {
  for (const [page, expected] of [['Stocks', []], ['Settings', ['Settings']], ['Overview', ['Overview']]]) {
    const h = await harness({ page, user: signedIn, cloudLoaded: true });
    h.context.queueCloudSave(); const run = h.fire(); await flush(); h.writes[0].resolve(); await run;
    assert.deepEqual(h.renders, expected, `${page} after a confirmed save`);
    h.context.queueCloudSave(); const failing = h.fire(); await flush(); h.writes[1].reject(Object.assign(new Error('x'), { code: 'unavailable' })); await failing;
    assert.deepEqual(h.renders, [...expected, ...expected], `${page} after a failed save`);
  }
});

test('the page wires the save line without storing, uploading or reading the provider key', () => {
  // The line is a pure function of sync state: no key, price or storage access in the helpers.
  for (const [name, source] of [['state helpers', stateHelpers], ['save helpers', saveHelpers]]) {
    assert.doesNotMatch(source, /stockKey|stockApiKey|localStorage|sessionStorage|apiKey/i, name);
  }
  assert.match(moduleScript, /renderStockPage\(watchlistSymbols\(data\.settings\),stockFeed\.getState\(\),stockFeed\.quoteFor,stockFeed\.issueFor,stockQuery,\{save:stockSaveState\(\),portfolioHtml:renderPortfolioPanel\(\),chartHtml:portfolioChartShell\(\)\}\)/);
  assert.match(moduleScript, /authResolved=true;\n if\(\(user\?\.uid\|\|null\)!==\(current\?\.uid\|\|null\)\)/, 'the first auth report marks sign-in as resolved');
  assert.equal((moduleScript.match(/clearTimeout\(saveTimer\)/g) || []).length, 2, 'only cancelCloudSave and queueCloudSave touch the save timer');
});
