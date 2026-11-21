const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const slice = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
function sandbox(extra) {
  const calls = { setKey: [], persisted: 0 };
  const ctx = vm.createContext({ console, calls, window: {}, user: { uid: 'u' }, cloudLoaded: true,
    data: { settings: { finnhubKey: 'abc123' } }, persist() { calls.persisted++; }, render() {}, focusStockControl() {}, showToast() {}, canEditStocks: () => true,
    stockFeed: { getState: () => ({ hasKey: false }), setKey(k) { calls.setKey.push(k); return true; }, disconnect() {} }, ...extra });
  vm.runInContext(slice('let stockKeyTried', '\nfunction ', ).length ? html.slice(html.indexOf('let stockKeyTried'), html.indexOf('\n', html.indexOf('function disconnectStocks(')) ) : '', ctx);
  return { ctx, calls };
}
test('a saved Finnhub key reconnects once after sign-in and sync', () => {
  const { ctx, calls } = sandbox();
  ctx.restoreStockKey(); ctx.restoreStockKey();
  assert.deepEqual(calls.setKey, ['abc123']);
});
test('the saved key is not restored when signed out, still syncing, or locked', () => {
  for (const extra of [{ user: null }, { cloudLoaded: false }, { window: { NorthstarVaultLocked: true } }]) {
    const { ctx, calls } = sandbox(extra); ctx.restoreStockKey(); assert.deepEqual(calls.setKey, []);
  }
});
test('disconnecting removes the saved key and saves the change', () => {
  const { ctx, calls } = sandbox(); ctx.disconnectStocks();
  assert.equal('finnhubKey' in ctx.data.settings, false);
  assert.equal(calls.persisted, 1);
});
test('connecting only saves the key when signed in with cloud loaded', () => {
  assert.match(html, /const remember=!!user&&cloudLoaded&&!lastSyncError&&!window\.NorthstarVaultLocked;/);
  assert.match(html, /if\(remember\)\{stockKeyTried=value;data=\{\.\.\.data,settings:\{\.\.\.data\.settings,finnhubKey:value\}\};persist\(\)\}/);
});
