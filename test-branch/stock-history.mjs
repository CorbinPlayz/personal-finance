/* Price history for the Stocks tab. Pure functions plus a small loader.
   History comes from the Northstar Worker (daily closes, up to 5 years). It is
   public market data: no finance data is sent except the ticker symbol. */

export const DAY = 86_400_000;
export const MAX_CONCURRENT = 4;

export const dayToTime = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
export const timeToDay = t => new Date(t).toISOString().slice(0, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(t) { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }
export function fmtUsd(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n), digits = abs >= 1000 ? 0 : 2;
  return (n < 0 ? '−' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtUsdExact(n) { return Number.isFinite(n) ? (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }

/* [["2024-01-02", 149], ...] -> { t: [ms...], v: [close...] }, validated and sorted. */
export function toSeries(points) {
  const rows = [];
  for (const p of Array.isArray(points) ? points : []) {
    const t = dayToTime(p && p[0]), v = Number(p && p[1]);
    if (Number.isFinite(t) && Number.isFinite(v) && v > 0) rows.push([t, v]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  const t = [], v = [];
  for (const [time, value] of rows) { if (t.length && t[t.length - 1] === time) v[v.length - 1] = value; else { t.push(time); v.push(value); } }
  return { t, v };
}

export const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
export const upperBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) lo = mid + 1; else hi = mid; } return lo; };
/* Index of the point nearest to time x. */
export function nearestIndex(arr, x) {
  if (!arr.length) return -1;
  const i = lowerBound(arr, x);
  if (i <= 0) return 0;
  if (i >= arr.length) return arr.length - 1;
  return x - arr[i - 1] <= arr[i] - x ? i - 1 : i;
}

/* ---- Portfolio value over time ---------------------------------------------
   lots: [{symbol, shares, buyPrice, buyDate}], histories: Map(symbol -> [[day, close], ...]).
   Each lot counts from its buy date (undated lots count from today, because we
   cannot know when they were bought). Where a symbol has no history, or the
   date is before its first close, the lot is valued at the price paid, so a
   missing feed never makes the portfolio look like it crashed. A purchase draws a
   vertical step: the old value and the new value share the same day. */
export function portfolioSeries(lots, histories, todayIso) {
  const list = (Array.isArray(lots) ? lots : []).filter(l => l && l.symbol && l.shares > 0 && l.buyPrice > 0);
  const dated = list.filter(l => !Number.isNaN(dayToTime(l.buyDate)));
  const undated = list.length - dated.length;
  const empty = { points: [], buys: [], undated, missing: [], earlier: 0, firstT: 0, reason: dated.length ? 'no-history' : 'no-dates' };
  if (!dated.length) return empty;

  const hist = new Map();
  for (const [sym, pts] of histories instanceof Map ? histories : new Map()) { const s = toSeries(pts); if (s.t.length >= 2) hist.set(sym, s); }
  const symbols = [...new Set(list.map(l => l.symbol))];
  const missing = symbols.filter(s => !hist.has(s));
  const today = dayToTime(todayIso);
  const joinOf = l => Number.isNaN(dayToTime(l.buyDate)) ? today : dayToTime(l.buyDate);
  const start = Math.min(...dated.map(joinOf));

  const dates = new Set();
  for (const l of list) if (hist.has(l.symbol)) for (const t of hist.get(l.symbol).t) if (t >= start) dates.add(t);
  if (!dates.size) return { ...empty, missing };
  const first = Math.min(...dates);
  for (const l of list) { const j = joinOf(l); if (j >= first && Number.isFinite(j)) dates.add(j); }
  if (Number.isFinite(today) && today >= first) dates.add(today);
  const timeline = [...dates].sort((a, b) => a - b);

  const ptr = new Map(symbols.map(s => [s, -1]));
  const closeAt = (sym, t) => {
    const s = hist.get(sym); if (!s) return null;
    let i = ptr.get(sym); while (i + 1 < s.t.length && s.t[i + 1] <= t) i++; ptr.set(sym, i);
    return i >= 0 ? s.v[i] : null;
  };
  const points = [], buys = [];
  let prev = -Infinity;
  for (const t of timeline) {
    const px = new Map(); for (const sym of symbols) px.set(sym, closeAt(sym, t));
    let oldValue = 0, oldCost = 0, value = 0, cost = 0; const added = [];
    for (const l of list) {
      const j = joinOf(l); if (j > t) continue;
      const price = px.get(l.symbol) ?? l.buyPrice, v = l.shares * price, c = l.shares * l.buyPrice;
      value += v; cost += c;
      if (j <= prev) { oldValue += v; oldCost += c; } else added.push(l);
    }
    const marks = added.filter(l => joinOf(l) >= first);
    if (marks.length) buys.push({ t, value: round2(value), label: marks.map(l => `+${trimNum(l.shares)} ${l.symbol}`).join(', ') });
    if (added.length && points.length) points.push({ t, value: round2(oldValue), cost: round2(oldCost) });
    points.push({ t, value: round2(value), cost: round2(cost) });
    prev = t;
  }
  const earlier = list.filter(l => joinOf(l) < first).length;
  return { points, buys, undated, missing, earlier, firstT: first, reason: '' };
}
const round2 = n => Math.round(n * 100) / 100;
const trimNum = n => String(Math.round(n * 1e4) / 1e4);

/* ---- Zoom and pan ---------------------------------------------------------- */
export function minSpanFor(full) { return Math.min(14 * DAY, Math.max(DAY, full[1] - full[0])); }
export function clampView(view, full, minSpan = minSpanFor(full)) {
  const fullSpan = full[1] - full[0];
  const span = Math.min(Math.max(view[1] - view[0], Math.min(minSpan, fullSpan)), fullSpan);
  let a = view[0];
  if (a < full[0]) a = full[0];
  if (a + span > full[1]) a = full[1] - span;
  return [a, a + span];
}
/* factor < 1 zooms in, > 1 zooms out; the time under `anchor` stays where it is. */
export function zoomView(view, full, anchor, factor) {
  const span = view[1] - view[0], next = span * factor, f = span > 0 ? (anchor - view[0]) / span : 0.5;
  const a = anchor - f * next;
  return clampView([a, a + next], full);
}
export function panView(view, full, dt) { const span = view[1] - view[0]; return clampView([view[0] + dt, view[1] + dt], full, span); }
export const RANGES = { '1M': 30, '6M': 183, '1Y': 365, '5Y': Infinity };
export function rangeView(full, key) {
  const days = RANGES[key]; if (!days || !Number.isFinite(days)) return [full[0], full[1]];
  return clampView([full[1] - days * DAY, full[1]], full);
}
export function activeRange(view, full) {
  const span = view[1] - view[0];
  if (Math.abs(view[0] - full[0]) < DAY && Math.abs(view[1] - full[1]) < DAY) return '5Y';
  if (Math.abs(view[1] - full[1]) >= DAY) return '';
  for (const key of ['1M', '6M', '1Y']) if (Math.abs(span - RANGES[key] * DAY) < 2 * DAY) return key;
  return '';
}

/* Indices to draw for a view (one point beyond each edge so the line reaches it),
   and the stats of the points really inside it. */
export function viewStats(series, view) {
  const n = series.t.length; if (!n) return null;
  let a = lowerBound(series.t, view[0]), b = upperBound(series.t, view[1]) - 1;
  const draw0 = Math.max(0, a - 1), draw1 = Math.min(n - 1, b + 1);
  if (b < a) { a = draw0; b = draw1; }
  let lo = Infinity, hi = -Infinity;
  for (let i = a; i <= b; i++) { const v = series.v[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const change = series.v[b] - series.v[a];
  return { a, b, draw0, draw1, lo, hi, first: series.v[a], last: series.v[b], change, pct: series.v[a] > 0 ? change / series.v[a] * 100 : null };
}

/* At most `max` indices from [i0, i1]: each bucket keeps its lowest and highest point so peaks survive. */
export function decimate(values, i0, i1, max = 700) {
  const count = i1 - i0 + 1;
  if (count <= max) { const all = []; for (let i = i0; i <= i1; i++) all.push(i); return all; }
  const buckets = Math.floor(max / 2) - 1, size = (count - 2) / buckets, out = [i0];
  for (let k = 0; k < buckets; k++) {
    const s = i0 + 1 + Math.floor(k * size), e = Math.min(i1 - 1, i0 + 1 + Math.floor((k + 1) * size) - 1);
    let lo = s, hi = s;
    for (let i = s; i <= e; i++) { if (values[i] < values[lo]) lo = i; if (values[i] > values[hi]) hi = i; }
    if (lo === hi) out.push(lo); else if (lo < hi) out.push(lo, hi); else out.push(hi, lo);
  }
  out.push(i1);
  return out;
}

/* ---- Axis ticks ------------------------------------------------------------ */
export function niceTicks(lo, hi, want = 5) {
  if (!(hi > lo)) { const d = Math.abs(lo) * 0.05 || 1; lo -= d; hi += d; }
  const raw = (hi - lo) / Math.max(1, want - 1), mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return { ticks: out, step };
}
const YY = t => String(new Date(t).getUTCFullYear()).slice(2);
export function timeTicks(t0, t1, maxTicks = 5) {
  const span = t1 - t0;
  const plans = [['d', 1], ['d', 2], ['d', 7], ['d', 14], ['m', 1], ['m', 2], ['m', 3], ['m', 6], ['y', 1], ['y', 2], ['y', 5]];
  let plan = plans[plans.length - 1];
  for (const p of plans) {
    const approx = p[0] === 'd' ? p[1] * DAY : p[0] === 'm' ? p[1] * 30.44 * DAY : p[1] * 365.25 * DAY;
    if (span / approx <= maxTicks) { plan = p; break; }
  }
  const [unit, step] = plan, out = [];
  if (unit === 'd') {
    const wk = step >= 7; let d = Math.ceil(t0 / DAY);
    while (d * DAY <= t1) { if (wk ? (d - 4) % step === 0 : d % step === 0) out.push(d * DAY); d++; }
  } else if (unit === 'm') {
    const s = new Date(t0); let y = s.getUTCFullYear(), m = s.getUTCMonth();
    for (let i = 0; i < 400; i++) { const t = Date.UTC(y, m, 1); if (t > t1) break; if (t >= t0 && m % step === 0) out.push(t); m++; if (m > 11) { m = 0; y++; } }
  } else {
    for (let y = new Date(t0).getUTCFullYear(); Date.UTC(y, 0, 1) <= t1; y++) { const t = Date.UTC(y, 0, 1); if (t >= t0 && y % step === 0) out.push(t); }
  }
  const label = t => {
    const d = new Date(t);
    if (unit === 'y') return String(d.getUTCFullYear());
    if (unit === 'm') return span > 400 * DAY ? `${MONTHS[d.getUTCMonth()]} ’${YY(t)}` : d.getUTCMonth() === 0 ? `Jan ${d.getUTCFullYear()}` : MONTHS[d.getUTCMonth()];
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  };
  return out.map(t => ({ t, label: label(t) }));
}

/* ---- Loader ----------------------------------------------------------------
   One request per ticker, remembered for the page session. Failures are not
   remembered, so a retry really retries. At most MAX_CONCURRENT run at once. */
export function createHistoryLoader({ url, getToken, fetchImpl = (...a) => fetch(...a), concurrent = MAX_CONCURRENT } = {}) {
  const cache = new Map(), queue = []; let running = 0;
  const pump = () => {
    while (running < concurrent && queue.length) { const job = queue.shift(); running++; job().finally(() => { running--; pump(); }); }
  };
  async function request(symbol) {
    const token = await getToken();
    let res;
    try { res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'history', symbol }) }); }
    catch { throw new Error('Could not reach the Northstar Worker. Check your connection.'); }
    const j = await res.json().catch(() => ({}));
    /* An older deployed Worker does not know the "history" mode and answers like a chat message with this exact complaint. */
    if (!res.ok && res.status === 400 && /Enter a question/i.test(j.error || '')) throw new Error('Your Northstar AI Worker is out of date, so it cannot send stock history yet. Redeploy it from the cloudflare-worker folder, then tap Try again.');
    if (!res.ok) throw new Error(j.error || `History request failed (${res.status}).`);
    const series = toSeries(j.points);
    if (series.t.length < 2) throw new Error(`No price history came back for ${symbol}.`);
    return { symbol, source: String(j.source || ''), points: j.points, series };
  }
  return {
    load(symbol) {
      const key = String(symbol || '').toUpperCase();
      if (cache.has(key)) return cache.get(key);
      const p = new Promise((resolve, reject) => { queue.push(() => request(key).then(resolve, reject)); pump(); });
      cache.set(key, p);
      p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
      return p;
    },
    clear() { cache.clear(); }
  };
}
