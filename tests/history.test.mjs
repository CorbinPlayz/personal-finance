import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSymbol, parseStooqCsv, parseYahooJson, fetchHistory } from '../cloudflare-worker/src/history.js';
import worker from '../cloudflare-worker/src/index.js';

const csv = 'Date,Open,High,Low,Close,Volume\n2024-01-03,1,2,1,150.5,10\n2024-01-02,1,2,1,148,10\n2024-01-02,1,2,1,149,10\nbad,1,2,1,5,1\n2024-01-04,1,2,1,0,1';
const yahoo = { chart: { result: [{ timestamp: [1704205800, 1704292200, 1704378600], indicators: { quote: [{ close: [100.123456, null, 102] }] } }] } };

test('symbols are validated and tickers with a class letter are kept', () => {
  assert.equal(cleanSymbol(' aapl '), 'AAPL');
  assert.equal(cleanSymbol('BRK.B'), 'BRK.B');
  assert.equal(cleanSymbol('BRK-B'), 'BRK-B');
  for (const bad of ['', '1ABC', 'A B', 'AAPL/../x', 'a'.repeat(20), '../etc']) assert.equal(cleanSymbol(bad), '');
});

test('Stooq CSV: sorted, de-duplicated (last row wins), bad rows dropped', () => {
  assert.deepEqual(parseStooqCsv(csv), [['2024-01-02', 149], ['2024-01-03', 150.5]]);
  assert.equal(parseStooqCsv('Get your apikey: https://stooq.com/q/d/?s=aapl.us&get_apikey'), null);
  assert.equal(parseStooqCsv('No data'), null);
});

test('Yahoo JSON: null closes skipped, prices rounded to 4 places', () => {
  assert.deepEqual(parseYahooJson(yahoo), [['2024-01-02', 100.1235], ['2024-01-04', 102]]);
  assert.equal(parseYahooJson({}), null);
});

test('history uses Stooq, with a dash for class shares and a 5 year window', async () => {
  let seen;
  const r = await fetchHistory('brk.b', async u => { seen = u; return new Response(csv, { status: 200 }); }, new Date('2026-11-23T12:00:00Z'));
  assert.equal(r.source, 'Stooq'); assert.equal(r.symbol, 'BRK.B'); assert.equal(r.points.length, 2);
  assert.match(seen, /s=brk-b\.us/); assert.match(seen, /d1=20211116/); assert.match(seen, /d2=20261123/);
});

test('history falls back to Yahoo when Stooq sends a page or refuses', async () => {
  for (const stooq of [() => new Response('Get your apikey', { status: 200 }), () => new Response('', { status: 429 })]) {
    const r = await fetchHistory('AAPL', async u => u.includes('stooq') ? stooq() : new Response(JSON.stringify(yahoo), { status: 200 }));
    assert.equal(r.source, 'Yahoo Finance'); assert.equal(r.points.length, 2);
  }
});

test('history says what went wrong when both sources fail', async () => {
  const r = await fetchHistory('AAPL', async u => u.includes('stooq') ? new Response('Get your apikey', { status: 200 }) : new Response('', { status: 403 }));
  assert.equal(r.code, 'no-history');
  assert.match(r.error, /Stooq sent a page.*Yahoo is blocking \(403\)/);
  const t = new Error('t'); t.name = 'TimeoutError';
  assert.match((await fetchHistory('AAPL', async () => { throw t; })).error, /Stooq took too long; Yahoo took too long/);
  assert.equal((await fetchHistory('nope!')).code, 'bad-symbol');
});

test('Worker serves history mode behind the same sign-in check', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async u => String(u).includes('identitytoolkit') ? new Response(JSON.stringify({ users: [{ localId: 'u1' }] }), { status: 200 }) : new Response(csv, { status: 200 });
  const mk = (auth, symbol) => new Request('https://w.example/', { method: 'POST', headers: { Origin: 'https://corbinplayz.github.io', ...(auth ? { Authorization: 'Bearer t' } : {}), 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'history', symbol }) });
  try {
    assert.equal((await worker.fetch(mk(false, 'AAPL'), { FIREBASE_API_KEY: 'k' })).status, 401);
    const ok = await worker.fetch(mk(true, 'AAPL'), { FIREBASE_API_KEY: 'k' });
    assert.equal(ok.status, 200); assert.equal((await ok.json()).points.length, 2);
    assert.equal((await worker.fetch(mk(true, '../x'), { FIREBASE_API_KEY: 'k' })).status, 422);
  } finally { globalThis.fetch = realFetch; }
});
