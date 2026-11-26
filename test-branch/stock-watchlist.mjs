/*
 * Northstar's optional, personal-use Finnhub connection.
 * Prices and the key stay in memory. The caller stores only ticker symbols in
 * the active finance workspace. No requests are made until the visitor opts in.
 */
export const STARTER_STOCKS = Object.freeze([
  ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['AMZN', 'Amazon'],
  ['GOOGL', 'Alphabet'], ['META', 'Meta Platforms'], ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'],
  ['AMD', 'Advanced Micro Devices'], ['NFLX', 'Netflix'], ['JPM', 'JPMorgan Chase'], ['V', 'Visa'],
  ['MA', 'Mastercard'], ['WMT', 'Walmart'], ['COST', 'Costco'], ['HD', 'Home Depot'],
  ['TGT', 'Target'], ['NKE', 'Nike'], ['MCD', "McDonald's"], ['SBUX', 'Starbucks'],
  ['DIS', 'Walt Disney'], ['KO', 'Coca-Cola'], ['PEP', 'PepsiCo'], ['PG', 'Procter & Gamble'],
  ['JNJ', 'Johnson & Johnson'], ['UNH', 'UnitedHealth Group'], ['ABBV', 'AbbVie'], ['MRK', 'Merck'],
  ['PFE', 'Pfizer'], ['LLY', 'Eli Lilly'], ['TMO', 'Thermo Fisher Scientific'], ['ABT', 'Abbott'],
  ['BMY', 'Bristol Myers Squibb'], ['AMGN', 'Amgen'], ['GILD', 'Gilead Sciences'], ['ISRG', 'Intuitive Surgical'],
  ['XOM', 'Exxon Mobil'], ['CVX', 'Chevron'], ['COP', 'ConocoPhillips'], ['SLB', 'SLB'],
  ['OXY', 'Occidental Petroleum'], ['GE', 'GE Aerospace'], ['CAT', 'Caterpillar'], ['DE', 'Deere & Company'],
  ['HON', 'Honeywell'], ['BA', 'Boeing'], ['LMT', 'Lockheed Martin'], ['RTX', 'RTX'],
  ['UPS', 'UPS'], ['F', 'Ford'], ['GM', 'General Motors'], ['RIVN', 'Rivian'],
  ['UBER', 'Uber'], ['DASH', 'DoorDash'], ['ABNB', 'Airbnb'], ['BKNG', 'Booking Holdings'],
  ['MAR', 'Marriott'], ['CCL', 'Carnival'], ['DAL', 'Delta Air Lines'], ['AAL', 'American Airlines'],
  ['BAC', 'Bank of America'], ['WFC', 'Wells Fargo'], ['GS', 'Goldman Sachs'], ['MS', 'Morgan Stanley'],
  ['C', 'Citigroup'], ['AXP', 'American Express'], ['BLK', 'BlackRock'], ['SCHW', 'Charles Schwab'],
  ['COF', 'Capital One'], ['PYPL', 'PayPal'], ['XYZ', 'Block'], ['SOFI', 'SoFi Technologies'],
  ['PLTR', 'Palantir'], ['CRM', 'Salesforce'], ['ORCL', 'Oracle'], ['IBM', 'IBM'],
  ['ADBE', 'Adobe'], ['NOW', 'ServiceNow'], ['INTU', 'Intuit'], ['SHOP', 'Shopify'],
  ['SNOW', 'Snowflake'], ['CRWD', 'CrowdStrike'], ['PANW', 'Palo Alto Networks'], ['CSCO', 'Cisco'],
  ['INTC', 'Intel'], ['QCOM', 'Qualcomm'], ['MU', 'Micron Technology'], ['AMAT', 'Applied Materials'],
  ['LRCX', 'Lam Research'], ['TSM', 'Taiwan Semiconductor'], ['ASML', 'ASML'], ['ARM', 'Arm Holdings'],
  ['SPOT', 'Spotify'], ['RBLX', 'Roblox'], ['HOOD', 'Robinhood'], ['COIN', 'Coinbase'],
  ['VZ', 'Verizon'], ['T', 'AT&T'], ['TMUS', 'T-Mobile US'], ['TTD', 'The Trade Desk'],
].map(([symbol, name]) => Object.freeze({ symbol, name })));

const names = new Map(STARTER_STOCKS.map(({ symbol, name }) => [symbol, name]));
export const MAX_WATCHLIST = 200;
export const STREAM_BATCH_SIZE = 50;
export const STREAM_ROTATION_MS = 60_000;
export const SNAPSHOT_INTERVAL_MS = 15 * 60_000;
export const REQUEST_SPACING_MS = 1_500;
export const REQUEST_TIMEOUT_MS = 12_000;
export const RETRY_DELAY_MS = 60_000;
export const LIVE_AGE_MS = 120_000;

// This is a syntactic check, not proof that the symbol is a listed stock or is
// covered by a user's plan. US class-share symbols may include a dot or dash.
export function normalizeSymbol(value) {
  if (typeof value !== 'string') return '';
  const symbol = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{0,9}(?:[.-][A-Z0-9]{1,4})?$/.test(symbol) ? symbol : '';
}
export function stockName(symbol) { return names.get(symbol) || 'U.S.-listed stock'; }
/* Nothing is pre-loaded: every ticker on a watchlist was added by its owner. (STARTER_STOCKS now only supplies friendly company names.) */
export function starterSymbols() { return []; }

// A missing field means the starter list; an explicitly empty list stays empty.
// Ignore malformed imported entries for display without rewriting the backup.
export function watchlistSymbols(settings) {
  if (!Array.isArray(settings?.stockWatchlist)) return starterSymbols();
  const seen = new Set(), result = [];
  for (const entry of settings.stockWatchlist) {
    const symbol = normalizeSymbol(entry);
    if (symbol && !seen.has(symbol)) { seen.add(symbol); result.push(symbol); }
  }
  return result;
}

function validPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1e12;
}
function validTime(value, now) {
  return Number.isFinite(value) && value > 0 && value <= now + 5 * 60_000 && value <= 8.64e15 ? value : null;
}
export function parseSnapshot(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !validPrice(payload.c)) return null;
  const time = typeof payload.t === 'number' ? validTime(payload.t * 1000, now) : null;
  return { price: payload.c, timestamp: time, source: 'snapshot', previousClose: validPrice(payload.pc) ? payload.pc : null };
}
export function parseTrade(trade, now = Date.now()) {
  if (!trade || typeof trade !== 'object' || !validPrice(trade.p)) return null;
  const symbol = normalizeSymbol(trade.s);
  const timestamp = typeof trade.t === 'number' ? validTime(trade.t, now) : null;
  return symbol && timestamp ? { symbol, price: trade.p, timestamp, source: 'trade', previousClose: null } : null;
}

// Do not let an old/untimed snapshot replace a newer timestamped trade (or vice
// versa). An untimed quote is still useful but can never be called live.
export function mergeQuote(current, incoming) {
  if (!incoming) return current || null;
  if (!current) return { ...incoming };
  if (current.timestamp && (!incoming.timestamp || incoming.timestamp < current.timestamp)) return current;
  if (current.timestamp && incoming.timestamp === current.timestamp && current.source === 'trade' && incoming.source === 'snapshot') return current;
  return { ...incoming };
}
export function quoteLabel(quote, symbol, state, now = Date.now()) {
  if (!quote) return '';
  if (!quote.timestamp) return 'Snapshot · time unavailable';
  const isLive = quote.source === 'trade' && state.running && state.stream === 'open' &&
    state.subscribed.includes(symbol) && now >= quote.timestamp && now - quote.timestamp <= LIVE_AGE_MS;
  return isLive ? 'Live trade' : quote.source === 'trade' ? 'Last trade' : 'Snapshot';
}

/**
 * A single feed per tab. Up to 50 stream subscriptions rotate once a minute;
 * REST snapshots are spaced by at least 1.5 seconds and refreshed at most once
 * per symbol every 15 minutes unless the user explicitly queues a refresh.
 * Timers and in-flight requests are canceled when the page is hidden/left.
 * The key is held in this closure only, and is never returned by getState().
 * Dependencies are injectable for deterministic tests.
 */
export function createStockFeed({
  onQuote = () => {}, onStatus = () => {},
  fetchImpl = (...args) => globalThis.fetch(...args),
  makeSocket = url => new globalThis.WebSocket(url),
  now = () => Date.now(), setTimer = (fn, delay) => setTimeout(fn, delay),
  clearTimer = timer => clearTimeout(timer), makeAbort = () => new AbortController(),
} = {}) {
  let key = '', symbols = [], requestedActive = false, running = false, fatal = '';
  let stream = 'idle', subscribed = [], batchIndex = 0, socket = null;
  let snapshotMessage = '', nextRequestAt = 0, retryAt = 0, lastManual = -Infinity;
  let pumpTimer = null, rotationTimer = null, reconnectTimer = null, requestTimer = null, controller = null;
  let inFlight = false, generation = 0, reconnectAttempts = 0, denied = 0;
  const quotes = new Map(), issues = new Map(), due = new Map();
  const emitStatus = () => onStatus();
  const state = () => ({
    hasKey: !!key, running, fatal, stream, snapshotMessage, subscribed: [...subscribed],
    batchIndex, total: symbols.length, retryAt,
  });
  const quoteFor = symbol => quotes.get(symbol) || null;
  const issueFor = symbol => issues.get(symbol) || '';
  function clearTimers() {
    for (const timer of [pumpTimer, rotationTimer, reconnectTimer, requestTimer]) if (timer !== null) clearTimer(timer);
    pumpTimer = rotationTimer = reconnectTimer = requestTimer = null;
  }
  function detachSocket() {
    const old = socket; socket = null; subscribed = [];
    if (old) {
      old.onopen = old.onmessage = old.onerror = old.onclose = null;
      try { old.close(); } catch { /* already closed */ }
    }
  }
  function stop() {
    if (!running && !socket && !inFlight) return;
    running = false; generation++; clearTimers();
    if (controller) { try { controller.abort(); } catch { /* already aborted */ } }
    controller = null; inFlight = false; detachSocket(); stream = key ? 'paused' : 'idle';
    emitStatus();
  }
  function startIfNeeded() {
    if (!requestedActive || !key || !symbols.length || fatal) { stop(); return; }
    if (running) return;
    running = true; generation++; stream = 'connecting';
    if (retryAt <= now()) snapshotMessage = '';
    openStream(); schedulePump(); emitStatus();
  }
  function setActive(active) { requestedActive = !!active; startIfNeeded(); }
  function setKey(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(value.trim())) return false;
    // Keep any rate-limit cooldown even if the visitor reconnects in this tab.
    stop(); key = value.trim(); fatal = ''; snapshotMessage = retryAt > now() ? 'Snapshot requests are waiting for the previous retry pause.' : ''; denied = 0; reconnectAttempts = 0;
    quotes.clear(); issues.clear(); due.clear(); symbols.forEach(symbol => due.set(symbol, 0));
    stream = 'paused'; emitStatus(); startIfNeeded(); return true;
  }
  function disconnect() {
    stop(); key = ''; fatal = ''; snapshotMessage = ''; denied = 0; reconnectAttempts = 0;
    quotes.clear(); issues.clear(); due.clear(); symbols.forEach(symbol => due.set(symbol, 0));
    stream = 'idle'; emitStatus();
  }
  function setSymbols(next) {
    const seen = new Set(), clean = [];
    for (const value of Array.isArray(next) ? next : []) {
      const symbol = normalizeSymbol(value);
      if (symbol && !seen.has(symbol)) { seen.add(symbol); clean.push(symbol); }
    }
    if (symbols.length === clean.length && symbols.every((item, i) => item === clean[i])) return;
    symbols = clean;
    for (const symbol of [...due.keys()]) if (!seen.has(symbol)) { due.delete(symbol); quotes.delete(symbol); issues.delete(symbol); }
    for (const symbol of symbols) if (!due.has(symbol)) due.set(symbol, 0);
    batchIndex = 0;
    if (running && stream === 'open') changeBatch();
    startIfNeeded(); if (running) schedulePump(); emitStatus();
  }
  function failAuthorization() {
    fatal = 'Finnhub rejected access. Check your key and plan, then disconnect and connect again.';
    stop(); stream = 'error'; emitStatus();
  }
  function retryDelay(response) {
    // Honor a longer provider Retry-After if present, but guard malformed or
    // absurd headers. The ordinary minimum is one minute in this tab.
    let delay = RETRY_DELAY_MS;
    try {
      const raw = response.headers?.get?.('Retry-After');
      if (raw && String(raw).trim()) {
        const seconds = Number(raw), date = Date.parse(raw);
        const requested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Number.isFinite(date) ? date - now() : 0;
        if (Number.isFinite(requested)) delay = Math.max(delay, Math.min(24 * 60 * 60_000, requested));
      }
    } catch { /* unavailable response headers */ }
    return delay;
  }
  function schedulePump() {
    if (!running || inFlight || !symbols.length) return;
    if (pumpTimer !== null) clearTimer(pumpTimer);
    const earliest = symbols.reduce((minimum, symbol) => Math.min(minimum, due.get(symbol) ?? 0), Infinity);
    const when = Math.max(earliest, nextRequestAt, retryAt, now());
    pumpTimer = setTimer(() => { pumpTimer = null; pump(); }, Math.max(0, when - now()));
  }
  async function pump() {
    if (!running || inFlight || !symbols.length) return;
    const currentTime = now();
    if (currentTime < nextRequestAt || currentTime < retryAt) { schedulePump(); return; }
    let symbol = null, earliest = Infinity;
    for (const item of symbols) {
      const time = due.get(item) ?? 0;
      if (time < earliest) { earliest = time; symbol = item; }
    }
    if (!symbol || earliest > currentTime) { schedulePump(); return; }
    const run = generation, abort = makeAbort(), requestKey = key;
    let timedOut = false;
    inFlight = true; controller = abort; nextRequestAt = currentTime + REQUEST_SPACING_MS;
    requestTimer = setTimer(() => { requestTimer = null; timedOut = true; abort.abort(); }, REQUEST_TIMEOUT_MS);
    // Finnhub supports token query authentication. It is also required in the
    // WebSocket URL. HTTPS protects transport, but provider logs/browser tools
    // and extensions can see it; the UI explicitly discloses that limitation.
    const url = 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + encodeURIComponent(requestKey);
    try {
      const response = await fetchImpl(url, { signal: abort.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (run !== generation || !running || !symbols.includes(symbol)) return;
      if (response.status === 401) { failAuthorization(); return; }
      if (response.status === 403) {
        issues.set(symbol, 'Not available with this key or plan'); due.set(symbol, now() + SNAPSHOT_INTERVAL_MS); denied++;
        onQuote(symbol); if (denied >= 3) { failAuthorization(); return; }
      } else if (response.status === 429) {
        retryAt = now() + retryDelay(response); due.set(symbol, retryAt);
        snapshotMessage = 'Finnhub rate limit reached. Snapshot requests will retry after a pause.'; emitStatus();
      } else if (response.status >= 500) {
        retryAt = now() + retryDelay(response); due.set(symbol, retryAt);
        snapshotMessage = 'Finnhub is unavailable. Snapshot requests will retry after a pause.'; emitStatus();
      } else if (!response.ok) {
        denied = 0; issues.set(symbol, 'Quote unavailable'); due.set(symbol, now() + SNAPSHOT_INTERVAL_MS); onQuote(symbol);
      } else {
        const payload = await response.json();
        if (run !== generation || !running || !symbols.includes(symbol)) return;
        retryAt = 0; snapshotMessage = '';
        if (typeof payload?.error === 'string' && payload.error.trim()) {
          issues.set(symbol, 'Finnhub could not provide a quote'); due.set(symbol, now() + SNAPSHOT_INTERVAL_MS); denied++;
          onQuote(symbol);
          if (/invalid (api key|token)|unauthori[sz]ed/i.test(payload.error) || denied >= 3) { failAuthorization(); return; }
        } else {
          denied = 0;
          const parsed = parseSnapshot(payload, now());
          due.set(symbol, now() + SNAPSHOT_INTERVAL_MS);
          if (parsed) { quotes.set(symbol, mergeQuote(quotes.get(symbol), parsed)); issues.delete(symbol); }
          else issues.set(symbol, 'No quote returned');
          onQuote(symbol);
        }
        emitStatus();
      }
    } catch (error) {
      if (run !== generation || !running || (error?.name === 'AbortError' && !timedOut)) return;
      retryAt = now() + RETRY_DELAY_MS; due.set(symbol, retryAt);
      snapshotMessage = 'Cannot reach Finnhub snapshots. Check your connection or browser; retrying after a pause.'; emitStatus();
    } finally {
      if (run === generation) {
        if (requestTimer !== null) clearTimer(requestTimer);
        requestTimer = null; inFlight = false; controller = null; schedulePump();
      }
    }
  }
  function send(type, symbol) { socket.send(JSON.stringify({ type, symbol })); }
  function changeBatch() {
    if (!running || stream !== 'open' || !socket) return;
    if (rotationTimer !== null) { clearTimer(rotationTimer); rotationTimer = null; }
    const count = Math.ceil(symbols.length / STREAM_BATCH_SIZE);
    if (!count) { subscribed = []; return; }
    batchIndex = Math.min(batchIndex, count - 1);
    const wanted = symbols.slice(batchIndex * STREAM_BATCH_SIZE, (batchIndex + 1) * STREAM_BATCH_SIZE);
    try {
      for (const symbol of subscribed) if (!wanted.includes(symbol)) send('unsubscribe', symbol);
      for (const symbol of wanted) if (!subscribed.includes(symbol)) send('subscribe', symbol);
      subscribed = wanted;
    } catch {
      detachSocket(); stream = 'error'; scheduleReconnect(); emitStatus(); return;
    }
    if (count > 1) rotationTimer = setTimer(() => {
      rotationTimer = null; batchIndex = (batchIndex + 1) % Math.ceil(symbols.length / STREAM_BATCH_SIZE); changeBatch();
    }, STREAM_ROTATION_MS);
    emitStatus();
  }
  function scheduleReconnect() {
    if (!running || reconnectTimer !== null) return;
    const delay = Math.min(60_000, 15_000 * Math.pow(2, Math.min(reconnectAttempts++, 2)));
    reconnectTimer = setTimer(() => { reconnectTimer = null; openStream(); }, delay);
  }
  function openStream() {
    if (!running || socket) return;
    stream = 'connecting'; emitStatus();
    let candidate;
    try { candidate = makeSocket('wss://ws.finnhub.io?token=' + encodeURIComponent(key)); }
    catch { stream = 'error'; scheduleReconnect(); emitStatus(); return; }
    const run = generation; socket = candidate;
    candidate.onopen = () => {
      if (run !== generation || socket !== candidate || !running) return;
      reconnectAttempts = 0; stream = 'open'; changeBatch();
    };
    candidate.onmessage = event => {
      if (run !== generation || socket !== candidate || !running) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message?.type === 'error') {
        detachSocket(); if (rotationTimer !== null) { clearTimer(rotationTimer); rotationTimer = null; }
        stream = 'error'; scheduleReconnect(); emitStatus(); return;
      }
      if (message?.type !== 'trade' || !Array.isArray(message.data)) return;
      for (const raw of message.data.slice(0, 1000)) {
        const trade = parseTrade(raw, now());
        if (!trade || !symbols.includes(trade.symbol)) continue;
        const previous = quotes.get(trade.symbol), merged = mergeQuote(previous, trade);
        if (merged !== previous) { quotes.set(trade.symbol, merged); issues.delete(trade.symbol); onQuote(trade.symbol); }
      }
    };
    candidate.onerror = () => {
      if (run !== generation || socket !== candidate) return;
      detachSocket(); if (rotationTimer !== null) { clearTimer(rotationTimer); rotationTimer = null; }
      stream = 'error'; scheduleReconnect(); emitStatus();
    };
    candidate.onclose = () => {
      if (run !== generation || socket !== candidate) return;
      detachSocket(); if (rotationTimer !== null) { clearTimer(rotationTimer); rotationTimer = null; }
      stream = 'error'; scheduleReconnect(); emitStatus();
    };
  }
  function refresh() {
    if (!key || fatal || !symbols.length) return false;
    const time = now();
    if (time - lastManual < RETRY_DELAY_MS) return false;
    lastManual = time;
    // Earlier, unvisited symbols keep priority over manually queued work.
    for (const symbol of symbols) due.set(symbol, Math.min(due.get(symbol) ?? 0, time));
    if (running) schedulePump(); emitStatus(); return true;
  }
  return { setActive, setKey, disconnect, setSymbols, refresh, getState: state, quoteFor, issueFor };
}
