/* Five years of daily closing prices for one U.S. ticker. No AI and no API key:
   Stooq's free CSV first, Yahoo's chart feed if Stooq refuses. Returns
   { symbol, source, points: [["YYYY-MM-DD", close], ...] } oldest first, or
   { error, code } with a plain reason. Both sources give split-adjusted closes. */
const UA = "Mozilla/5.0 (compatible; NorthstarPriceCheck/1.0)";
export const HISTORY_YEARS = 5;
const MAX_POINTS = 1500;

export function cleanSymbol(value) {
  const s = String(value || "").trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{0,9}([.-][A-Z0-9]{1,2})?$/.test(s) ? s : "";
}

const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
export const isoDay = d => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
const round4 = n => Math.round(n * 1e4) / 1e4;

function tidy(rows) {
  const byDay = new Map();
  for (const [day, close] of rows) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(close) && close > 0 && close < 1e9) byDay.set(day, round4(close));
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-MAX_POINTS);
}

export function parseStooqCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (!/^date,open,high,low,close/i.test(lines[0] || "")) return null;
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    rows.push([c[0], Number(c[4])]);
  }
  return tidy(rows);
}

export function parseYahooJson(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  const stamps = r && r.timestamp, closes = r && r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
  if (!Array.isArray(stamps) || !Array.isArray(closes)) return null;
  const rows = [];
  stamps.forEach((t, i) => { if (typeof closes[i] === "number") rows.push([isoDay(new Date(t * 1000)), closes[i]]); });
  return tidy(rows);
}

const NOTE = { 429: "is rate limiting", 403: "is blocking", 503: "is busy" };

export async function fetchHistory(rawSymbol, fetchImpl = fetch, now = new Date()) {
  const symbol = cleanSymbol(rawSymbol);
  if (!symbol) return { error: "Send a ticker like AAPL or BRK.B.", code: "bad-symbol" };
  const start = new Date(now); start.setUTCFullYear(start.getUTCFullYear() - HISTORY_YEARS); start.setUTCDate(start.getUTCDate() - 7);
  const dash = symbol.replace(".", "-");
  const problems = [];

  try {
    const url = "https://stooq.com/q/d/l/?s=" + encodeURIComponent(dash.toLowerCase()) + ".us&i=d&d1=" + ymd(start) + "&d2=" + ymd(now);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": UA }, cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!res.ok) problems.push("Stooq " + (NOTE[res.status] || "answered") + " (" + res.status + ")");
    else {
      const rows = parseStooqCsv(await res.text());
      if (rows && rows.length >= 2) return { symbol, source: "Stooq", points: rows };
      problems.push(rows ? "Stooq has no history for " + symbol : "Stooq sent a page instead of data (it may now require a key)");
    }
  } catch (e) { problems.push(e && e.name === "TimeoutError" ? "Stooq took too long" : "Stooq didn't answer"); }

  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(dash) + "?range=5y&interval=1d&includePrePost=false";
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": UA, accept: "application/json" }, cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!res.ok) problems.push("Yahoo " + (NOTE[res.status] || "answered") + " (" + res.status + ")");
    else {
      const rows = parseYahooJson(await res.json().catch(() => null));
      if (rows && rows.length >= 2) return { symbol, source: "Yahoo Finance", points: rows };
      problems.push("Yahoo has no history for " + symbol);
    }
  } catch (e) { problems.push(e && e.name === "TimeoutError" ? "Yahoo took too long" : "Yahoo didn't answer"); }

  return { error: "No price history for " + symbol + ": " + problems.join("; ") + ".", code: "no-history" };
}
