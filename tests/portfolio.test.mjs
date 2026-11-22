import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHoldings, lotMetrics, portfolioSummary, cleanHistory, recordSnapshot, parseIsoDate } from '../portfolio.mjs';

const lot = (o = {}) => ({ id: 'a', symbol: 'AAPL', shares: 10, buyPrice: 100, buyDate: '2026-01-02', ...o });
const quotes = map => symbol => map[symbol] || null;

test('cleanHoldings keeps only valid lots and repairs ids and dates', () => {
  const out = cleanHoldings([lot(), lot({ symbol: 'aapl ', shares: '2.5', id: 'a', buyDate: 'nope' }), lot({ symbol: 'x y' }), lot({ shares: 0 }), lot({ buyPrice: -1 }), null, 'str', lot({ shares: 1e12 })]);
  assert.equal(out.length, 2);
  assert.equal(out[1].symbol, 'AAPL');
  assert.equal(out[1].shares, 2.5);
  assert.equal(out[1].buyDate, '');
  assert.notEqual(out[0].id, out[1].id);
  assert.deepEqual(cleanHoldings(undefined), []);
  assert.equal(cleanHoldings(Array.from({ length: 150 }, (_, i) => lot({ id: 'i' + i }))).length, 100);
});

test('lotMetrics: gain, percent, day change, and missing prices stay null', () => {
  assert.deepEqual(lotMetrics(lot(), { price: 125, previousClose: 120 }), { cost: 1000, price: 125, value: 1250, gain: 250, gainPct: 25, day: 50 });
  const down = lotMetrics(lot(), { price: 80 });
  assert.equal(down.gain, -200); assert.equal(down.gainPct, -20); assert.equal(down.day, null);
  const none = lotMetrics(lot(), null);
  assert.deepEqual([none.value, none.gain, none.gainPct, none.day], [null, null, null, null]);
  assert.equal(none.cost, 1000);
  assert.equal(lotMetrics(lot(), { price: 0 }).value, null);
  assert.equal(lotMetrics(lot({ shares: 3, buyPrice: 33.33 }), { price: 40 }).gain, 20.01);
});

test('portfolioSummary: unpriced lots never count as losses', () => {
  const holdings = [lot(), lot({ id: 'b', symbol: 'AAPL', shares: 5, buyPrice: 110 }), lot({ id: 'c', symbol: 'MSFT', shares: 2, buyPrice: 300 })];
  const s = portfolioSummary(holdings, quotes({ AAPL: { price: 120, previousClose: 118 } }));
  assert.equal(s.lots, 3); assert.equal(s.priced, 2); assert.equal(s.unpriced, 1);
  assert.equal(s.invested, 1000 + 550 + 600);
  assert.equal(s.value, 1800);
  assert.equal(s.gain, 1800 - 1550);
  assert.equal(s.gainPct, 16.13);
  assert.equal(s.day, 30);
  assert.deepEqual(s.positions.map(p => [p.symbol, p.shares, p.share]), [['AAPL', 15, 100], ['MSFT', 2, null]]);
  const empty = portfolioSummary([], quotes({}));
  assert.deepEqual([empty.value, empty.gain, empty.gainPct, empty.day], [0, 0, null, null]);
});

test('history keeps one point per day, sorted, and only records full prices', () => {
  const full = { lots: 2, unpriced: 0, value: 1500, invested: 1400 };
  assert.deepEqual(recordSnapshot([], '2026-11-20', full), [{ date: '2026-11-20', value: 1500, cost: 1400 }]);
  assert.equal(recordSnapshot([{ date: '2026-11-20', value: 1500, cost: 1400 }], '2026-11-20', full), null);
  assert.equal(recordSnapshot([], '2026-11-20', { ...full, unpriced: 1 }), null);
  assert.equal(recordSnapshot([], '2026-11-20', { ...full, lots: 0 }), null);
  assert.equal(recordSnapshot([], 'bad', full), null);
  const updated = recordSnapshot([{ date: '2026-11-20', value: 1, cost: 1 }, { date: '2026-11-19', value: 2, cost: 2 }], '2026-11-20', full);
  assert.deepEqual(updated.map(p => p.date), ['2026-11-19', '2026-11-20']);
  assert.equal(updated[1].value, 1500);
  assert.equal(cleanHistory(Array.from({ length: 500 }, (_, i) => ({ date: new Date(2025, 0, 1 + i).toISOString().slice(0, 10), value: i, cost: i }))).length, 366);
  assert.equal(parseIsoDate('2026-02-30'), false);
});
