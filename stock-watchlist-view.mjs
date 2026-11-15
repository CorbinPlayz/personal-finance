import { stockName, quoteLabel, LIVE_AGE_MS } from './stock-watchlist.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dollarFormats = new Map();
function usd(value) {
  // Avoid displaying a tiny positive quote as $0.00 after decimal rounding.
  if (value < 0.000001) return '$' + value.toExponential(4);
  const digits = value < 1 ? 6 : 2;
  if (!dollarFormats.has(digits)) dollarFormats.set(digits, new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }));
  return dollarFormats.get(digits).format(value);
}
let timeFormat;
function stamp(timestamp) {
  try {
    timeFormat ??= new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
    return timeFormat.format(timestamp);
  } catch { return new Date(timestamp).toISOString(); }
}
// Schedule a text-only repaint when a trade starts or stops qualifying as live.
// This avoids leaving a stale live badge in place when no messages arrive.
export function nextStockLabelChange(state, quoteFor, now = Date.now()) {
  if (!state.running || state.stream !== 'open') return null;
  let next = Infinity;
  for (const symbol of state.subscribed) {
    const quote = quoteFor(symbol);
    if (quote?.source !== 'trade' || !quote.timestamp) continue;
    if (now < quote.timestamp) next = Math.min(next, quote.timestamp);
    else if (now <= quote.timestamp + LIVE_AGE_MS) next = Math.min(next, quote.timestamp + LIVE_AGE_MS + 1);
  }
  return Number.isFinite(next) ? next : null;
}
export function stockStatusText(state) {
  if (!state.hasKey) return 'No prices loaded. Connect your own key to begin.';
  if (state.fatal) return state.fatal;
  if (!state.total) return 'Add a ticker to start receiving prices.';
  if (!state.running) return 'Updates are paused while the watchlist is not visible.';
  let text;
  if (state.stream === 'open') {
    const first = state.batchIndex * 50 + 1, last = Math.min(first + state.subscribed.length - 1, state.total);
    text = state.subscribed.length ? `Stream connected; tickers ${first}–${last} of ${state.total} requested.` : 'Stream connected; waiting for subscriptions.';
  } else if (state.stream === 'connecting') text = 'Connecting to Finnhub. Snapshots will load gradually.';
  else text = 'Trade stream unavailable; reconnecting. Snapshots may still load.';
  return state.snapshotMessage ? text + ' ' + state.snapshotMessage : text;
}
export function stockConnectionLabel(state) {
  if (!state.hasKey) return 'Not connected';
  if (state.fatal) return 'Action needed';
  if (!state.running) return 'Paused';
  if (state.stream === 'open') return 'Stream connected';
  return state.stream === 'connecting' ? 'Connecting' : 'Stream unavailable';
}
export function renderStockQuote(symbol, quote, issue, state, now = Date.now()) {
  if (!quote) {
    const note = issue || (state.fatal ? 'Check your connection' : state.hasKey ? 'Waiting for a quote' : 'Connect for prices');
    return `<div class="stock-value"><strong>—</strong><small>No price yet</small></div><div class="stock-quote-meta"><strong>${esc(note)}</strong></div>`;
  }
  const label = quoteLabel(quote, symbol, state, now);
  let change = '';
  // A previous close belongs to its snapshot. Do not mix it with a newer
  // streaming trade, whose session/baseline could be different.
  if (quote.source === 'snapshot' && quote.timestamp && quote.previousClose) {
    const pct = (quote.price - quote.previousClose) / quote.previousClose * 100;
    if (Number.isFinite(pct) && Math.abs(pct) < 1e7) {
      const rounded = Math.round(pct * 100) / 100;
      const tone = rounded > 0 ? 'stock-up' : rounded < 0 ? 'stock-down' : '';
      change = `<small class="${tone}">${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}% vs previous close</small>`;
    }
  }
  const when = quote.timestamp ? `<time datetime="${esc(new Date(quote.timestamp).toISOString())}">${esc(stamp(quote.timestamp))}</time>` : '';
  return `<div class="stock-value"><strong>${esc(usd(quote.price))}</strong>${change}</div><div class="stock-quote-meta"><strong class="${label === 'Live trade' ? 'stock-live' : ''}">${esc(label)} · Finnhub</strong>${when}${issue ? `<span class="stock-issue">${esc(issue)}; showing last price</span>` : ''}</div>`;
}
export function renderStockPage(symbols, state, quoteFor, issueFor, query = '') {
  const connected = state.hasKey;
  const connection = connected
    ? `<div class="stock-connection-actions"><button type="button" class="stock-disconnect" data-action="stock-disconnect">Disconnect key</button></div>`
    : `<form class="stock-connect-form" id="stockConnectForm"><label for="stockApiKey">Your Finnhub API key<input id="stockApiKey" name="stockApiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" required></label><button type="submit">Connect</button></form>`;
  const rows = symbols.map(symbol => `<li class="stock-row" data-stock-symbol="${esc(symbol)}" data-stock-search="${esc((symbol + ' ' + stockName(symbol)).toLowerCase())}"><div class="stock-identity"><span class="stock-avatar" aria-hidden="true">${esc(symbol.slice(0, 2))}</span><div class="stock-identity-copy"><strong>${esc(symbol)}</strong><small title="${esc(stockName(symbol))}">${esc(stockName(symbol))}</small></div></div><div class="stock-quote">${renderStockQuote(symbol, quoteFor(symbol), issueFor(symbol), state)}</div><button type="button" class="stock-remove" data-action="stock-remove" data-symbol="${esc(symbol)}" aria-label="Remove ${esc(symbol)} from watchlist" title="Remove ${esc(symbol)}">×</button></li>`).join('');
  return `<div class="stock-page">
    <div class="stock-heading"><div><div class="eyebrow">YOUR MARKET WATCHLIST</div><h1>Stocks, in focus.</h1><p>Follow the companies you care about, all in one place.</p></div><span class="stock-heading-tag">U.S.-listed · USD</span></div>
    <section class="stock-hero" aria-labelledby="stockIntroTitle"><div class="stock-intro"><div class="stock-kicker"><i aria-hidden="true"></i> A CLEARER VIEW OF THE MARKET</div><h2 id="stockIntroTitle">Keep an eye on what moves you.</h2><p>Start with a curated collection of popular stocks, then make the list your own. Connect an optional market-data key for real prices.</p><div class="stock-facts"><div class="stock-fact"><strong>${symbols.length}</strong><span>stocks watched</span></div><div class="stock-fact"><strong>50 max</strong><span>streaming at once</span></div><div class="stock-fact"><strong>~15 min</strong><span>snapshot refresh</span></div></div></div>
    <div class="stock-connect"><div class="stock-connect-head"><div><h3>Finnhub market data</h3><p>Use your own key; a free personal-use plan is available.</p></div><span class="stock-feed-dot" id="stockConnectionLabel" data-state="${state.fatal ? 'error' : esc(state.stream)}">${esc(stockConnectionLabel(state))}</span></div>${connection}<p class="stock-status" id="stockFeedStatus" role="status" aria-live="polite">${esc(stockStatusText(state))}</p><p class="stock-privacy"><a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer">Get a Finnhub key ↗</a> · The key stays in this tab's memory until disconnect, reload, account change, or workspace restore/clear. It is sent directly to Finnhub in request URLs and may be visible in browser tools, extensions, or provider logs. It is not in finance backups or cloud sync.</p></div></section>
    <div class="stock-disclosure"><span aria-hidden="true">i</span><div>Finnhub’s free plan is for personal use and currently allows 50 streaming symbols at once. Batches rotate every minute; snapshots refresh about every 15 minutes per ticker. Loading 100 snapshots takes about 2½ minutes or longer. Updates pause when Stocks is hidden or closed. One key supports one stream connection, so other tabs may interrupt it. Coverage, delays, rate limits and market closures affect prices. Trades can include extended-hours or special-condition transactions, not an official closing or executable price. Times are in your device’s local time. Verify before trading. <a href="https://finnhub.io/pricing" target="_blank" rel="noopener noreferrer">Pricing and terms ↗</a></div></div>
    <section class="stock-list-panel" aria-labelledby="stockListTitle"><div class="stock-list-top"><div><h2 id="stockListTitle">Your watchlist</h2><p>Search, add or remove tickers. The list is saved with your Northstar workspace.</p></div><div class="stock-list-actions"><button type="button" data-action="stock-refresh" ${!connected || !symbols.length || state.fatal ? 'disabled' : ''}>Refresh snapshots</button><button type="button" data-action="stock-reset">Reset to starter 100</button></div></div>
    <div class="stock-controls"><div><label for="stockSearch">Search this list</label><input class="stock-search-input" id="stockSearch" type="search" placeholder="Search company or symbol" value="${esc(query)}" autocomplete="off"></div><form class="stock-add-form" id="stockAddForm"><label for="stockTicker">Add a U.S.-listed ticker</label><div><input class="stock-add-input" id="stockTicker" name="symbol" placeholder="e.g. AAPL" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" required><button type="submit">+ Add</button></div></form></div>
    <div class="stock-list-meta"><span id="stockResultCount" role="status" aria-live="polite">${symbols.length} ${symbols.length === 1 ? 'stock' : 'stocks'}</span><span>Last reported price · USD</span></div><ul class="stock-rows" id="stockRows">${rows}</ul><div class="stock-empty" id="stockEmpty" hidden><strong>No matching stocks</strong>Try another search or add a ticker above.</div></section>
    <p class="stock-footnote">Last prices are not guaranteed, may be delayed or unavailable, and do not represent your holdings or a quote you can trade at. Tickers you add are not validated against an exchange. This watchlist is not investment advice.</p>
  </div>`;
}
