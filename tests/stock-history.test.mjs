import test from 'node:test';
import assert from 'node:assert/strict';
import { dayToTime, toSeries, portfolioSeries, clampView, zoomView, panView, rangeView, activeRange, viewStats, decimate, niceTicks, timeTicks, nearestIndex, createHistoryLoader, fmtUsd, fmtDate, DAY, minSpanFor } from '../stock-history.mjs';

const days = (start, n, f) => Array.from({ length: n }, (_, i) => [new Date(dayToTime(start) + i * DAY).toISOString().slice(0, 10), f(i)]);

test('series are sorted, validated and de-duplicated', () => {
  const s = toSeries([['2024-01-03', 5], ['2024-01-02', 4], ['2024-01-02', 4.5], ['bad', 1], ['2024-01-04', -1], ['2024-01-05', 'x']]);
  assert.deepEqual(s.v, [4.5, 5]); assert.equal(s.t.length, 2);
  assert.deepEqual(toSeries(null), { t: [], v: [] });
});

test('portfolio value steps up on the day shares are added', () => {
  const histories = new Map([['AAA', days('2024-01-01', 10, () => 10)], ['BBB', days('2024-01-01', 10, () => 100)]]);
  const lots = [{ symbol: 'AAA', shares: 10, buyPrice: 9, buyDate: '2024-01-02' }, { symbol: 'BBB', shares: 1, buyPrice: 90, buyDate: '2024-01-06' }];
  const r = portfolioSeries(lots, histories, '2024-01-10');
  const at = d => r.points.filter(p => p.t === dayToTime(d));
  assert.equal(r.points[0].t, dayToTime('2024-01-02'));
  assert.deepEqual(at('2024-01-05').map(p => p.value), [100]);
  assert.deepEqual(at('2024-01-06').map(p => p.value), [100, 200], 'old and new value on the same day = a vertical step');
  assert.deepEqual(at('2024-01-06').map(p => p.cost), [90, 180]);
  assert.equal(r.points.at(-1).value, 200);
  assert.deepEqual(r.buys.map(b => b.label), ['+10 AAA', '+1 BBB']);
  assert.deepEqual([r.undated, r.missing, r.reason], [0, [], '']);
});

test('value follows the share price, not just the purchases', () => {
  const histories = new Map([['AAA', days('2024-01-01', 5, i => 10 + i)]]);
  const r = portfolioSeries([{ symbol: 'AAA', shares: 2, buyPrice: 10, buyDate: '2024-01-01' }], histories, '2024-01-05');
  assert.deepEqual(r.points.map(p => p.value), [20, 22, 24, 26, 28]);
  assert.ok(r.points.every(p => p.cost === 20));
});

test('lots without a date start today; no dates at all gives no chart; missing history is valued at the price paid', () => {
  const histories = new Map([['AAA', days('2024-01-01', 5, () => 10)]]);
  const r = portfolioSeries([{ symbol: 'AAA', shares: 1, buyPrice: 9, buyDate: '2024-01-01' }, { symbol: 'AAA', shares: 1, buyPrice: 9, buyDate: '' }], histories, '2024-01-05');
  assert.equal(r.undated, 1); assert.equal(r.points.at(-1).value, 20); assert.equal(r.points[0].value, 10);
  assert.equal(portfolioSeries([{ symbol: 'AAA', shares: 1, buyPrice: 9 }], histories, '2024-01-05').reason, 'no-dates');
  const m = portfolioSeries([{ symbol: 'AAA', shares: 1, buyPrice: 9, buyDate: '2024-01-01' }, { symbol: 'ZZZ', shares: 3, buyPrice: 5, buyDate: '2024-01-01' }], histories, '2024-01-05');
  assert.deepEqual(m.missing, ['ZZZ']); assert.equal(m.points.at(-1).value, 10 + 15);
  assert.equal(portfolioSeries([{ symbol: 'ZZZ', shares: 3, buyPrice: 5, buyDate: '2024-01-01' }], new Map(), '2024-01-05').reason, 'no-history');
});

test('a lot bought before the 5-year window counts from the first day, without a buy marker', () => {
  const histories = new Map([['AAA', days('2024-01-01', 3, () => 10)]]);
  const r = portfolioSeries([{ symbol: 'AAA', shares: 2, buyPrice: 4, buyDate: '2015-06-01' }], histories, '2024-01-03');
  assert.equal(r.points[0].value, 20); assert.equal(r.buys.length, 0);
});

test('zoom keeps the time under the cursor still and never leaves the data', () => {
  const full = [0, 1000 * DAY], anchor = 250 * DAY;
  const z = zoomView(full, full, anchor, 0.5);
  assert.equal(z[1] - z[0], 500 * DAY);
  assert.equal((anchor - z[0]) / (z[1] - z[0]), 0.25);
  const edge = zoomView([0, 100 * DAY], full, 0, 0.5); assert.equal(edge[0], 0);
  const out = zoomView(z, full, anchor, 10); assert.deepEqual(out, full);
  const deep = zoomView(full, full, anchor, 1e-9); assert.equal(deep[1] - deep[0], minSpanFor(full));
  assert.deepEqual(panView([100 * DAY, 200 * DAY], full, 5000 * DAY), [900 * DAY, 1000 * DAY]);
  assert.deepEqual(panView([100 * DAY, 200 * DAY], full, -5000 * DAY), [0, 100 * DAY]);
  assert.deepEqual(clampView([-5, 5], [0, 100 * DAY]).map(Math.round), [0, 14 * DAY]);
});

test('range buttons and which one is active', () => {
  const full = [dayToTime('2021-11-23'), dayToTime('2026-11-23')];
  assert.deepEqual(rangeView(full, '5Y'), full);
  const y = rangeView(full, '1Y'); assert.equal(y[1], full[1]); assert.equal(Math.round((y[1] - y[0]) / DAY), 365);
  assert.equal(activeRange(y, full), '1Y'); assert.equal(activeRange(full, full), '5Y'); assert.equal(activeRange([full[0], full[0] + 99 * DAY], full), '');
  const short = [0, 5 * DAY]; assert.deepEqual(rangeView(short, '1M'), short);
});

test('view stats use only points inside the view; the line reaches one point beyond each edge', () => {
  const s = toSeries(days('2024-01-01', 10, i => 10 + i));
  const v = [dayToTime('2024-01-03'), dayToTime('2024-01-06')], st = viewStats(s, v);
  assert.deepEqual([st.a, st.b, st.draw0, st.draw1, st.lo, st.hi, st.change], [2, 5, 1, 6, 12, 15, 3]);
  assert.equal(Math.round(st.pct * 100) / 100, 25);
  assert.equal(nearestIndex(s.t, dayToTime('2024-01-04') + 3 * 3600e3), 3);
  assert.equal(viewStats({ t: [], v: [] }, v), null);
});

test('decimate keeps the peaks and the ends', () => {
  const vals = Array.from({ length: 5000 }, (_, i) => i === 2500 ? 999 : i === 1234 ? -50 : 10);
  const idx = decimate(vals, 0, 4999, 400);
  assert.ok(idx.length <= 402); assert.equal(idx[0], 0); assert.equal(idx.at(-1), 4999);
  assert.ok(idx.includes(2500) && idx.includes(1234));
  assert.ok(idx.every((x, i) => i === 0 || x >= idx[i - 1]));
  assert.equal(decimate(vals, 10, 19, 400).length, 10);
});

test('axis ticks are round numbers and calendar-aligned', () => {
  const { ticks } = niceTicks(103.2, 187.9, 5); assert.deepEqual(ticks, [125, 150, 175]);
  assert.ok(ticks.every(t => t % 10 === 0 || t % 5 === 0) && ticks[0] >= 103.2 && ticks.at(-1) <= 187.9);
  assert.ok(niceTicks(5, 5).ticks.length >= 2);
  const five = timeTicks(dayToTime('2021-11-23'), dayToTime('2026-11-23'), 6); assert.deepEqual(five.map(t => t.label), ['2022', '2023', '2024', '2025', '2026']);
  const months = timeTicks(dayToTime('2026-01-10'), dayToTime('2026-11-23'), 5); assert.ok(months.length >= 3 && months.length <= 6); assert.ok(months.every(t => new Date(t.t).getUTCDate() === 1));
  const weeks = timeTicks(dayToTime('2026-11-01'), dayToTime('2026-11-23'), 5); assert.ok(weeks.every(t => new Date(t.t).getUTCDay() === 1), 'weekly ticks fall on Mondays');
  assert.equal(fmtUsd(1234.5), '$1,235'); assert.equal(fmtUsd(12.3), '$12.30'); assert.equal(fmtDate(dayToTime('2026-11-23')), 'Nov 23, 2026');
});

test('loader: one request per ticker, parallel limit, failures are retried, clear errors', async () => {
  let calls = 0, active = 0, peak = 0;
  const ok = { points: days('2024-01-01', 3, () => 5), source: 'Stooq' };
  const fetchImpl = async (_u, o) => {
    calls++; active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--;
    const sym = JSON.parse(o.body).symbol;
    return sym === 'BAD' ? new Response(JSON.stringify({ error: 'No price history for BAD: x.' }), { status: 422 }) : new Response(JSON.stringify(ok), { status: 200 });
  };
  const loader = createHistoryLoader({ url: 'https://w/', getToken: async () => 't', fetchImpl });
  const syms = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  await Promise.all(syms.map(s => loader.load(s)));
  assert.ok(peak <= 4, 'at most 4 at once'); assert.equal(calls, 7);
  await loader.load('a'); assert.equal(calls, 7, 'cached, case-insensitive');
  await assert.rejects(loader.load('BAD'), /No price history for BAD/);
  await assert.rejects(loader.load('BAD'), /No price history for BAD/); assert.equal(calls, 9, 'a failure is not cached');
  const offline = createHistoryLoader({ url: 'https://w/', getToken: async () => 't', fetchImpl: async () => { throw new Error('x'); } });
  await assert.rejects(offline.load('A'), /Could not reach/);
  const signedOut = createHistoryLoader({ url: 'https://w/', getToken: async () => { throw new Error('Sign in with Google to use the hosted AI.'); }, fetchImpl });
  await assert.rejects(signedOut.load('A'), /Sign in/);
});
