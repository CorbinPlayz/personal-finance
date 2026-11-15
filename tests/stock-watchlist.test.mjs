// Run with: node --test tests/stock-watchlist.test.mjs
// Synthetic provider responses only; no Finnhub account or network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_STOCKS, starterSymbols, watchlistSymbols, normalizeSymbol, stockName,
  parseSnapshot, parseTrade, mergeQuote, quoteLabel, createStockFeed,
  SNAPSHOT_INTERVAL_MS, REQUEST_SPACING_MS, REQUEST_TIMEOUT_MS, RETRY_DELAY_MS, LIVE_AGE_MS } from '../stock-watchlist.mjs';
import { renderStockPage, renderStockQuote, stockStatusText, nextStockLabelChange } from '../stock-watchlist-view.mjs';

const epoch = 1_700_000_000_000;
class Clock {
  time = epoch; next = 0; timers = new Map();
  set = (fn, delay) => { const id = ++this.next; this.timers.set(id, { at: this.time + delay, fn }); return id; };
  clear = id => this.timers.delete(id);
  now = () => this.time;
  async tick(ms) {
    const end = this.time + ms;
    for (let guard = 0; guard < 30_000; guard++) {
      let selected = null;
      for (const [id, timer] of this.timers) if (timer.at <= end && (!selected || timer.at < selected.timer.at || (timer.at === selected.timer.at && id < selected.id))) selected = { id, timer };
      if (!selected) { this.time = end; for (let i = 0; i < 6; i++) await Promise.resolve(); return; }
      this.time = selected.timer.at; this.timers.delete(selected.id); selected.timer.fn();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    throw new Error('Timer loop did not settle');
  }
}
class Socket {
  constructor(url) { this.url = url; this.sent = []; this.subscriptions = new Set(); this.maximum = 0; this.closed = false; }
  send(raw) {
    const message = JSON.parse(raw); this.sent.push(message);
    if (message.type === 'subscribe') this.subscriptions.add(message.symbol);
    if (message.type === 'unsubscribe') this.subscriptions.delete(message.symbol);
    this.maximum = Math.max(this.maximum, this.subscriptions.size);
  }
  open() { this.onopen?.({}); }
  message(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  error() { this.onerror?.({}); }
  close() { this.closed = true; }
}
function response(status, body = {}) { return { status, ok: status >= 200 && status < 300, json: async () => body }; }
function harness(fetchOverride) {
  const clock = new Clock(), calls = [], sockets = [], changed = [], states = [];
  const feed = createStockFeed({
    now: clock.now, setTimer: clock.set, clearTimer: clock.clear,
    makeSocket: url => { const socket = new Socket(url); sockets.push(socket); return socket; },
    fetchImpl: (url, options) => {
      calls.push({ url, options, at: clock.time });
      return fetchOverride ? fetchOverride(url, options, calls.length, clock) : Promise.resolve(response(200, { c: 123.45, pc: 120, t: Math.floor(clock.time / 1000) }));
    },
    onQuote: symbol => changed.push(symbol), onStatus: () => states.push('changed'),
  });
  return { clock, calls, sockets, changed, states, feed };
}
function start(h, symbols = ['AAPL', 'MSFT']) {
  h.feed.setSymbols(symbols); h.feed.setActive(true); assert.equal(h.feed.setKey('synthetic-test-key'), true);
  return h.sockets.at(-1);
}

test('starter list contains exactly 100 distinct curated U.S.-listed symbols, not finance records', () => {
  assert.equal(STARTER_STOCKS.length, 100);
  assert.equal(new Set(starterSymbols()).size, 100);
  assert.deepEqual(starterSymbols().slice(0, 6), ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META']);
  assert.ok(STARTER_STOCKS.every(({ symbol, name }) => normalizeSymbol(symbol) === symbol && typeof name === 'string' && name.length > 0));
  assert.equal(stockName('AAPL'), 'Apple'); assert.equal(stockName('SYNTH'), 'Custom ticker');
});

test('missing and intentionally empty watchlists are distinct; imported data is not mutated', () => {
  assert.equal(watchlistSymbols({}).length, 100);
  assert.deepEqual(watchlistSymbols({ stockWatchlist: [] }), []);
  const input = { stockWatchlist: [' aapl ', 'AAPL', '<script>', 3, 'brk.b', 'T', 'bad space', 'B-A'] };
  const original = structuredClone(input);
  assert.deepEqual(watchlistSymbols(input), ['AAPL', 'BRK.B', 'T', 'B-A']);
  assert.deepEqual(input, original);
  assert.equal(normalizeSymbol('BRK.B'), 'BRK.B'); assert.equal(normalizeSymbol(''), '');
  assert.equal(normalizeSymbol('<img src=x>'), ''); assert.equal(normalizeSymbol('AAPL/../../bad'), '');
});

test('price parsing rejects malformed, zero and nonnumeric prices without fabricating data', () => {
  for (const payload of [null, {}, { c: 0 }, { c: '123' }, { c: -1 }, { c: NaN }, { c: Infinity }, { c: 1e12 }]) assert.equal(parseSnapshot(payload, epoch), null);
  assert.deepEqual(parseSnapshot({ c: 123.45, pc: 120, t: epoch / 1000 }, epoch), { price: 123.45, timestamp: epoch, source: 'snapshot', previousClose: 120 });
  assert.deepEqual(parseSnapshot({ c: 5, pc: 0, t: 0 }, epoch), { price: 5, timestamp: null, source: 'snapshot', previousClose: null });
  assert.equal(parseSnapshot({ c: 5, pc: 4, t: (epoch + 6 * 60_000) / 1000 }, epoch).timestamp, null);
  assert.equal(parseTrade({ s: 'AAPL', p: 10, t: 0 }, epoch), null);
  assert.equal(parseTrade({ s: '<script>', p: 10, t: epoch }, epoch), null);
  assert.deepEqual(parseTrade({ s: 'aapl', p: 10, t: epoch }, epoch), { symbol: 'AAPL', price: 10, timestamp: epoch, source: 'trade', previousClose: null });
});

test('out-of-order snapshots and trades cannot overwrite a newer timed price', () => {
  const trade = { symbol: 'AAPL', price: 110, timestamp: epoch, source: 'trade', previousClose: null };
  const older = { price: 95, timestamp: epoch - 5_000, source: 'snapshot', previousClose: 90 };
  assert.equal(mergeQuote(trade, older), trade);
  assert.equal(mergeQuote(trade, { ...older, timestamp: null }), trade);
  assert.equal(mergeQuote(trade, { ...older, timestamp: epoch }), trade);
  assert.equal(mergeQuote(trade, { ...older, timestamp: epoch + 1 }).price, 95);
  assert.equal(mergeQuote({ ...older, timestamp: null }, trade).price, 110);
});

test('only a recent, currently subscribed streaming trade is labeled live', () => {
  const q = { price: 12, timestamp: epoch, source: 'trade' };
  const state = { running: true, stream: 'open', subscribed: ['AAPL'] };
  assert.equal(quoteLabel(q, 'AAPL', state, epoch + 1), 'Live trade');
  assert.equal(quoteLabel(q, 'AAPL', state, epoch + LIVE_AGE_MS + 1), 'Last trade');
  assert.equal(quoteLabel(q, 'MSFT', state, epoch + 1), 'Last trade');
  assert.equal(quoteLabel(q, 'AAPL', { ...state, stream: 'error' }, epoch + 1), 'Last trade');
  assert.equal(quoteLabel(q, 'AAPL', { ...state, running: false }, epoch + 1), 'Last trade');
  assert.equal(quoteLabel({ ...q, source: 'snapshot' }, 'AAPL', state, epoch + 1), 'Snapshot');
  assert.equal(quoteLabel({ ...q, source: 'snapshot', timestamp: null }, 'AAPL', state, epoch + 1), 'Snapshot · time unavailable');
});

test('live-label repaint is scheduled at the exact change, even without another provider message', () => {
  const quotes = new Map([
    ['AAPL', { price: 10, timestamp: epoch - 60_000, source: 'trade' }],
    ['MSFT', { price: 20, timestamp: epoch - 90_000, source: 'trade' }],
    ['NVDA', { price: 30, timestamp: epoch + 500, source: 'trade' }],
    ['META', { price: 40, timestamp: epoch, source: 'snapshot' }],
  ]);
  const state = { running: true, stream: 'open', subscribed: ['AAPL', 'MSFT', 'NVDA', 'META'] };
  assert.equal(nextStockLabelChange(state, symbol => quotes.get(symbol), epoch), epoch + 500);
  assert.equal(nextStockLabelChange({ ...state, subscribed: ['AAPL', 'MSFT', 'META'] }, symbol => quotes.get(symbol), epoch), epoch + 30_001);
  assert.equal(nextStockLabelChange({ ...state, stream: 'error' }, symbol => quotes.get(symbol), epoch), null);
  assert.equal(nextStockLabelChange({ ...state, subscribed: ['MSFT', 'META'] }, symbol => quotes.get(symbol), epoch + 30_001), null);
});

test('rendering is escaped, honest about missing prices, and distinguishes snapshot change', () => {
  const state = { hasKey: false, running: false, fatal: '', stream: 'idle', snapshotMessage: '', total: 1, subscribed: [], batchIndex: 0 };
  const page = renderStockPage(['<img onerror=alert(1)>'], state, () => null, () => '', '"><svg>');
  assert.doesNotMatch(page, /<img onerror|<svg>/);
  assert.match(page, /&lt;img/); assert.match(page, /&quot;&gt;&lt;svg&gt;/);
  assert.match(page, /No price yet/); assert.match(page, /personal use/); assert.match(page, /request URLs/);
  const snapshot = renderStockQuote('AAPL', { price: 110, timestamp: epoch, source: 'snapshot', previousClose: 100 }, '', state, epoch);
  assert.match(snapshot, /\$110\.00/); assert.match(snapshot, /\+10\.00% vs previous close/); assert.match(snapshot, /Snapshot · Finnhub/);
  const trade = renderStockQuote('AAPL', { price: 110, timestamp: epoch, source: 'trade', previousClose: 100 }, '', state, epoch);
  assert.doesNotMatch(trade, /previous close/); assert.match(trade, /Last trade/);
  const untimed = renderStockQuote('AAPL', { price: 110, timestamp: null, source: 'snapshot', previousClose: 100 }, '', state, epoch);
  assert.match(untimed, /time unavailable/); assert.doesNotMatch(untimed, /previous close/);
  const tiny = renderStockQuote('AAPL', { price: 1e-9, timestamp: epoch, source: 'snapshot', previousClose: null }, '', state, epoch);
  assert.match(tiny, /\$1\.0000e-9/); assert.doesNotMatch(tiny, /\$0\.00/);
});

test('no calls occur without opt-in or while inactive, and the key never appears in returned state', async () => {
  const h = harness(); h.feed.setSymbols(['AAPL']); h.feed.setActive(true); await h.clock.tick(30_000);
  assert.equal(h.calls.length, 0); assert.equal(h.sockets.length, 0);
  h.feed.setActive(false); assert.equal(h.feed.setKey('synthetic-test-key'), true); await h.clock.tick(30_000);
  assert.equal(h.calls.length, 0); assert.equal(h.sockets.length, 0);
  assert.doesNotMatch(JSON.stringify(h.feed.getState()), /synthetic-test-key/);
  assert.equal(h.feed.setKey('bad key with spaces'), false);
  h.feed.setActive(true); assert.equal(h.sockets.length, 1); await h.clock.tick(0);
  assert.equal(h.calls.length, 1); assert.match(h.calls[0].url, /^https:\/\/finnhub\.io\/api\/v1\/quote\?symbol=AAPL&token=/);
  assert.match(h.sockets[0].url, /^wss:\/\/ws\.finnhub\.io\?token=/);
  h.feed.disconnect(); assert.equal(h.feed.getState().hasKey, false); assert.equal(h.feed.quoteFor('AAPL'), null);
});

test('snapshots are serialized and spaced; each is refreshed after about 15 minutes', async () => {
  const h = harness(); start(h, ['AAPL', 'MSFT', 'NVDA']);
  await h.clock.tick(0); assert.equal(h.calls.length, 1); assert.equal(h.feed.quoteFor('AAPL').price, 123.45);
  await h.clock.tick(REQUEST_SPACING_MS - 1); assert.equal(h.calls.length, 1);
  await h.clock.tick(1); assert.equal(h.calls.length, 2);
  await h.clock.tick(REQUEST_SPACING_MS); assert.equal(h.calls.length, 3);
  await h.clock.tick(SNAPSHOT_INTERVAL_MS - 2 * REQUEST_SPACING_MS - 1); assert.equal(h.calls.length, 3);
  await h.clock.tick(1); assert.equal(h.calls.length, 4);
  assert.deepEqual(h.calls.slice(0, 3).map(call => new URL(call.url).searchParams.get('symbol')), ['AAPL', 'MSFT', 'NVDA']);
  assert.ok(h.calls.every((call, i, all) => i === 0 || call.at - all[i - 1].at >= REQUEST_SPACING_MS));
  h.feed.disconnect();
});

test('a single stream rotates through all 100 symbols without exceeding 50 simultaneous subscriptions', async () => {
  const h = harness(), socket = start(h, starterSymbols()); socket.open();
  assert.equal(socket.subscriptions.size, 50); assert.deepEqual([...socket.subscriptions], starterSymbols().slice(0, 50));
  assert.equal(h.feed.getState().batchIndex, 0);
  await h.clock.tick(60_000);
  assert.deepEqual([...socket.subscriptions], starterSymbols().slice(50, 100)); assert.equal(h.feed.getState().batchIndex, 1);
  assert.equal(socket.sent.slice(50, 100).every(event => event.type === 'unsubscribe'), true);
  assert.equal(socket.sent.slice(100, 150).every(event => event.type === 'subscribe'), true);
  await h.clock.tick(60_000);
  assert.deepEqual([...socket.subscriptions], starterSymbols().slice(0, 50));
  assert.equal(socket.maximum, 50); assert.equal(h.sockets.length, 1);
  h.feed.disconnect();
});

test('streamed prices use provider timestamps and cannot be overwritten by an older delayed snapshot', async () => {
  let resolveSnapshot;
  const h = harness(() => new Promise(resolve => { resolveSnapshot = resolve; }));
  const socket = start(h, ['AAPL']); socket.open(); await h.clock.tick(0);
  socket.message({ type: 'trade', data: [{ s: 'AAPL', p: 200, t: epoch }] });
  assert.equal(h.feed.quoteFor('AAPL').price, 200);
  assert.equal(quoteLabel(h.feed.quoteFor('AAPL'), 'AAPL', h.feed.getState(), epoch), 'Live trade');
  resolveSnapshot(response(200, { c: 100, pc: 90, t: (epoch - 10_000) / 1000 })); await h.clock.tick(0);
  assert.equal(h.feed.quoteFor('AAPL').price, 200);
  socket.message({ type: 'trade', data: [{ s: 'AAPL', p: 190, t: epoch - 1 }, { s: 'MSFT', p: 50, t: epoch }, { s: 'AAPL', p: 0, t: epoch }] });
  assert.equal(h.feed.quoteFor('AAPL').price, 200); assert.equal(h.feed.quoteFor('MSFT'), null);
  h.feed.setActive(false); assert.equal(socket.closed, true);
  assert.equal(quoteLabel(h.feed.quoteFor('AAPL'), 'AAPL', h.feed.getState(), epoch), 'Last trade');
});

test('leaving the page aborts requests and ignores late results; returning resumes without a burst', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  const socket = start(h, ['AAPL', 'MSFT']); socket.open(); await h.clock.tick(0);
  const signal = h.calls[0].options.signal; h.feed.setActive(false);
  assert.equal(signal.aborted, true); assert.equal(socket.closed, true); assert.equal(h.feed.getState().running, false);
  resolve(response(200, { c: 99, pc: 90, t: epoch / 1000 })); await h.clock.tick(10_000);
  assert.equal(h.calls.length, 1); assert.equal(h.feed.quoteFor('AAPL'), null);
  h.feed.setActive(true); await h.clock.tick(0); assert.equal(h.calls.length, 2); assert.equal(h.sockets.length, 2);
  h.feed.disconnect();
});

test('429 backs off globally, including after disconnect and reconnect', async () => {
  const h = harness((url, opts, n) => Promise.resolve(n === 1 ? response(429) : response(200, { c: 2, pc: 1, t: epoch / 1000 })));
  start(h, ['AAPL', 'MSFT']); await h.clock.tick(0);
  assert.match(h.feed.getState().snapshotMessage, /rate limit/i); assert.equal(h.calls.length, 1);
  h.feed.disconnect(); h.feed.setKey('synthetic-test-key');
  await h.clock.tick(RETRY_DELAY_MS - 1); assert.equal(h.calls.length, 1);
  await h.clock.tick(1); assert.equal(h.calls.length, 2);
  assert.doesNotMatch(h.feed.getState().snapshotMessage, /rate limit/i);
  h.feed.disconnect();
});

test('a longer Retry-After header is respected instead of retrying too early', async () => {
  const h = harness((url, opts, n) => Promise.resolve(n === 1 ? { ...response(429), headers: { get: () => '120' } } : response(200, { c: 10, t: epoch / 1000 })));
  start(h, ['AAPL']); await h.clock.tick(0);
  await h.clock.tick(119_999); assert.equal(h.calls.length, 1);
  await h.clock.tick(1); assert.equal(h.calls.length, 2); h.feed.disconnect();
});

test('authorization and per-symbol errors do not become made-up prices', async () => {
  const bad = harness(() => Promise.resolve(response(401))); start(bad, ['AAPL', 'MSFT']); await bad.clock.tick(0);
  assert.match(bad.feed.getState().fatal, /rejected access/i); assert.equal(bad.feed.getState().running, false);
  await bad.clock.tick(120_000); assert.equal(bad.calls.length, 1); assert.equal(bad.feed.quoteFor('AAPL'), null);
  assert.equal(bad.feed.refresh(), false);
  const mixed = harness((url, opts, n) => Promise.resolve(n === 1 ? response(403) : response(200, { c: 25, t: epoch / 1000 })));
  start(mixed, ['SYNTH', 'AAPL']); await mixed.clock.tick(REQUEST_SPACING_MS);
  assert.match(mixed.feed.issueFor('SYNTH'), /not available/i); assert.equal(mixed.feed.quoteFor('SYNTH'), null);
  assert.equal(mixed.feed.quoteFor('AAPL').price, 25); assert.equal(mixed.feed.getState().fatal, '');
  mixed.feed.disconnect();
  const empty = harness(() => Promise.resolve(response(200, { c: 0, t: 0 })));
  start(empty, ['AAPL']); await empty.clock.tick(0); assert.equal(empty.feed.issueFor('AAPL'), 'No quote returned'); assert.equal(empty.feed.quoteFor('AAPL'), null);
  empty.feed.disconnect();
  const bodyError = harness(() => Promise.resolve(response(200, { error: 'Invalid API key: synthetic-test-key' })));
  start(bodyError, ['AAPL']); await bodyError.clock.tick(0);
  assert.match(bodyError.feed.getState().fatal, /rejected access/i); assert.doesNotMatch(JSON.stringify(bodyError.feed.getState()), /synthetic-test-key/);
});

test('network failure and timed-out fetches retry after a pause without exposing provider errors', async () => {
  const h = harness(() => Promise.reject(new Error('secret from provider'))); start(h, ['AAPL']); await h.clock.tick(0);
  assert.match(h.feed.getState().snapshotMessage, /Cannot reach Finnhub/); assert.doesNotMatch(stockStatusText(h.feed.getState()), /secret/);
  await h.clock.tick(RETRY_DELAY_MS - 1); assert.equal(h.calls.length, 1);
  await h.clock.tick(1); assert.equal(h.calls.length, 2); h.feed.disconnect();
  const stuck = harness((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) )));
  start(stuck, ['AAPL']); await stuck.clock.tick(REQUEST_TIMEOUT_MS);
  assert.equal(stuck.calls[0].options.signal.aborted, true); assert.match(stuck.feed.getState().snapshotMessage, /Cannot reach/);
  await stuck.clock.tick(RETRY_DELAY_MS - 1); assert.equal(stuck.calls.length, 1);
  await stuck.clock.tick(1); assert.equal(stuck.calls.length, 2); stuck.feed.disconnect();
});

test('stream failure reconnects with backoff and provider error messages are not exposed', async () => {
  const h = harness(), socket = start(h, ['AAPL']); socket.open();
  socket.message({ type: 'error', msg: 'synthetic-test-key' });
  assert.equal(h.feed.getState().stream, 'error'); assert.equal(socket.closed, true);
  assert.doesNotMatch(JSON.stringify(h.feed.getState()), /synthetic-test-key/);
  await h.clock.tick(14_999); assert.equal(h.sockets.length, 1);
  await h.clock.tick(1); assert.equal(h.sockets.length, 2); h.sockets[1].open();
  assert.equal(h.feed.getState().stream, 'open'); assert.deepEqual(h.feed.getState().subscribed, ['AAPL']);
  h.feed.disconnect();
});

test('manual refresh is throttled and does not starve symbols not yet visited', async () => {
  const h = harness(); start(h, ['AAPL', 'MSFT', 'NVDA']); await h.clock.tick(0);
  assert.equal(h.feed.refresh(), true); assert.equal(h.feed.refresh(), false);
  await h.clock.tick(2 * REQUEST_SPACING_MS);
  assert.deepEqual(h.calls.slice(0, 3).map(call => new URL(call.url).searchParams.get('symbol')), ['AAPL', 'MSFT', 'NVDA']);
  h.feed.disconnect();
});

test('sync treats an edited or empty watchlist and saved Guide-only data as meaningful workspaces', async () => {
  const { readFileSync } = await import('node:fs'); const { runInNewContext } = await import('node:vm');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const begin = html.indexOf('const hasRecords=d=>{'), end = html.indexOf('\nconst VAULT_MARKER=', begin);
  assert.ok(begin >= 0 && end > begin);
  const hasRecords = runInNewContext(`${html.slice(begin, end)}\nhasRecords`);
  const blank = { accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { profile: { monthlyIncome: '', essentialBills: '', cushion: '250', payFrequency: 'monthly', payDay: '', goalFocus: '', notes: '' }, guideMemory: null } };
  assert.equal(hasRecords(blank), false);
  assert.equal(hasRecords({ ...blank, settings: { ...blank.settings, stockWatchlist: null } }), false);
  assert.equal(hasRecords({ ...blank, settings: { ...blank.settings, stockWatchlist: [] } }), true);
  assert.equal(hasRecords({ ...blank, settings: { ...blank.settings, stockWatchlist: ['AAPL'] } }), true);
  assert.equal(hasRecords({ ...blank, settings: { ...blank.settings, profile: { ...blank.settings.profile, notes: 'Saved note' } } }), true);
  assert.equal(hasRecords({ ...blank, settings: { ...blank.settings, profile: { ...blank.settings.profile, cushion: '0' } } }), true);
  assert.equal(hasRecords({ ...blank, settings: { ...blank.settings, guideMemory: { answer: 'remember' } } }), true);
});
