/* Portfolio tracker: stocks the user says they bought, valued with the last
   prices the Stocks page already has. Pure functions; money is rounded to cents.
   Nothing here talks to a broker: holdings are typed in by the user. */
import { normalizeSymbol } from './stock-watchlist.mjs';

export const MAX_HOLDINGS = 100;
export const MAX_HISTORY = 366;
const MAX_SHARES = 1e9, MAX_PRICE = 1e9;

const cents = value => Math.round(value * 100) / 100;
const finitePositive = (value, max) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;

export function parseIsoDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/* One lot = one purchase: symbol, how many shares, price paid per share, date. */
export function cleanHoldings(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [], ids = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const symbol = normalizeSymbol(item.symbol);
    const shares = Number(item.shares), buyPrice = Number(item.buyPrice);
    if (!symbol || !finitePositive(shares, MAX_SHARES) || !finitePositive(buyPrice, MAX_PRICE)) continue;
    let id = typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : '';
    if (!id || ids.has(id)) id = `h${out.length + 1}-${symbol}`;
    ids.add(id);
    out.push({ id, symbol, shares: Math.round(shares * 1e6) / 1e6, buyPrice: Math.round(buyPrice * 1e4) / 1e4, buyDate: parseIsoDate(item.buyDate) ? item.buyDate : '' });
    if (out.length >= MAX_HOLDINGS) break;
  }
  return out;
}

/* Numbers for one lot. price/prevClose may be missing (no quote yet). */
export function lotMetrics(lot, quote) {
  const cost = cents(lot.shares * lot.buyPrice);
  const price = finitePositive(quote?.price, 1e12) ? quote.price : null;
  if (price === null) return { cost, price: null, value: null, gain: null, gainPct: null, day: null };
  const value = cents(lot.shares * price), gain = cents(value - cost);
  const prev = finitePositive(quote?.previousClose, 1e12) ? quote.previousClose : null;
  return { cost, price, value, gain, gainPct: cost > 0 ? Math.round((gain / cost) * 10000) / 100 : null, day: prev === null ? null : cents(lot.shares * (price - prev)) };
}

/* Totals. Gain/loss only counts lots that have a price so a missing quote can
   never make the portfolio look like it lost everything. */
export function portfolioSummary(holdings, quoteFor) {
  let invested = 0, pricedCost = 0, value = 0, day = 0, dayCount = 0, priced = 0;
  const bySymbol = new Map();
  for (const lot of holdings) {
    const m = lotMetrics(lot, quoteFor(lot.symbol));
    invested += m.cost;
    const entry = bySymbol.get(lot.symbol) || { symbol: lot.symbol, shares: 0, cost: 0, value: 0, priced: false };
    entry.shares += lot.shares; entry.cost += m.cost;
    if (m.value !== null) { priced++; pricedCost += m.cost; value += m.value; entry.value += m.value; entry.priced = true; }
    if (m.day !== null) { day += m.day; dayCount++; }
    bySymbol.set(lot.symbol, entry);
  }
  const gain = cents(value - pricedCost);
  const positions = [...bySymbol.values()].map(p => ({ ...p, shares: Math.round(p.shares * 1e6) / 1e6, cost: cents(p.cost), value: cents(p.value), share: value > 0 && p.priced ? Math.round((p.value / value) * 1000) / 10 : null }))
    .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol));
  return {
    lots: holdings.length, priced, unpriced: holdings.length - priced,
    invested: cents(invested), value: cents(value), gain,
    gainPct: pricedCost > 0 ? Math.round((gain / pricedCost) * 10000) / 100 : null,
    day: dayCount ? cents(day) : null, positions
  };
}

/* One point per calendar day, newest value wins. Only fully priced portfolios are recorded. */
export function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map();
  for (const p of raw) {
    if (p && parseIsoDate(p.date) && Number.isFinite(p.value) && p.value >= 0 && Number.isFinite(p.cost) && p.cost >= 0) byDate.set(p.date, { date: p.date, value: cents(p.value), cost: cents(p.cost) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_HISTORY);
}
export function recordSnapshot(history, isoDate, summary) {
  if (!summary || summary.lots === 0 || summary.unpriced > 0 || !parseIsoDate(isoDate)) return null;
  const next = cleanHistory([...(history || []), { date: isoDate, value: summary.value, cost: summary.invested }]);
  const prior = (history || []).find(p => p.date === isoDate);
  if (prior && prior.value === summary.value && prior.cost === summary.invested && next.length === (history || []).length) return null;
  return next;
}
