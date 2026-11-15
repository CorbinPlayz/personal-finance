/* Optional Chromium integration/accessibility checks. All stock responses,
 * WebSockets and Firebase modules are mocked; this is not a live provider test.
 * Set NODE_PATH, CHROMIUM_PATH and (if needed) CHROMIUM_FLAGS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const axePath = require.resolve('axe-core/axe.min.js');

const root = path.join(__dirname, '..'), ledgerKey = 'northstar-finance-v1:local';
const assets = new Set(['index.html', 'vault-crypto.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css', 'stock-watchlist.mjs', 'stock-watchlist-view.mjs', 'stock-watchlist.css']);
const fixture = {
  version: 1,
  accounts: [{ id: 'checking', name: 'Synthetic checking', type: 'Checking', balance: 432.10 }],
  transactions: [{ id: 'tx', type: 'Expense', amount: 12, date: '2026-01-20', accountId: 'checking', category: 'Food', description: 'Synthetic lunch' }],
  budgets: [{ id: 'budget', category: 'Food', limit: 100 }], goals: [{ id: 'goal', name: 'Synthetic goal', target: 100, saved: 5 }],
  purchases: [{ id: 'purchase', name: 'Synthetic plan', price: 50, saved: 5, status: 'Planning', category: 'Shopping' }],
  settings: { currency: 'GBP', goalSounds: false, profile: { monthlyIncome: '1000', essentialBills: '300', cushion: '50', notes: 'Keep this profile' }, guideMemory: { answer: 'Keep this Guide note', at: '2026-01-01' } },
};
const firebase = {
  'firebase-app.js': 'export function getApps(){return []} export function initializeApp(){return {}}',
  'firebase-auth.js': 'export function getAuth(){return {currentUser:null}} export function onAuthStateChanged(auth,cb){window.__authCallback=cb;cb(null)} export class GoogleAuthProvider{}',
  'firebase-firestore.js': `export function getFirestore(){return {}} export function doc(){return {}}
    export async function getDocFromServer(){const raw=window.__mockCloud??null;return {exists:()=>raw!==null,data:()=>raw}}
    export async function runTransaction(db,callback){const raw=window.__mockCloud??null;let payload,options;
      await callback({get:async()=>({exists:()=>raw!==null,data:()=>raw}),set:(_ref,value,opts)=>{payload=value;options=opts}});
      if(payload!==undefined){
        const map=value=>value&&typeof value==='object'&&!Array.isArray(value);
        const merge=(before,after)=>{
          if(!map(after))return structuredClone(after);
          const keys=Object.keys(after);if(!keys.length)return {};
          const result=map(before)?structuredClone(before):{};
          for(const key of keys)result[key]=merge(map(before)?before[key]:undefined,after[key]);
          return result;
        };
        (window.__cloudWrites??=[]).push(structuredClone(payload));
        window.__mockCloud=options?.merge?merge(raw,payload):structuredClone(payload);
      }}
  `
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') return void res.end('<!doctype html><title>Setup</title>');
  const filename = pathname === '/personal-finance/' ? 'index.html' : pathname.replace('/personal-finance/', '');
  if (!pathname.startsWith('/personal-finance/') || !assets.has(filename)) return void res.writeHead(404).end('Not found');
  res.writeHead(200, { 'Content-Type': filename.endsWith('.mjs') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(root, filename)));
});

(async () => {
  if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean)] });
  const errors = []; let passed = 0;
  async function check(name, fn) {
    if (process.env.STOCK_QA_ONLY && !name.toLowerCase().includes(process.env.STOCK_QA_ONLY.toLowerCase())) return;
    try { await fn(); console.log('PASS', name); passed++; } catch (error) { console.error('FAIL', name); throw error; }
  }
  async function newPage({ width = 390, height = 844, mobile = true, data = fixture } = {}) {
    const page = await browser.newPage(); page.setDefaultTimeout(12000);
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return void request.continue();
      const name = Object.keys(firebase).find(item => url.endsWith('/' + item));
      if (name) return void request.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: firebase[name] });
      request.abort();
    });
    await page.evaluateOnNewDocument(() => {
      window.__marketMode = 'ok'; window.__marketCalls = []; window.__stockSockets = [];
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const url = String(input);
        if (!url.startsWith('https://finnhub.io/api/v1/quote?')) return realFetch(input, options);
        const symbol = new URL(url).searchParams.get('symbol');
        window.__marketCalls.push({ symbol, at: Date.now(), url });
        if (window.__marketMode === 'rate') return Promise.resolve(new Response('{}', { status: 429 }));
        if (window.__marketMode === 'auth') return Promise.resolve(new Response('{}', { status: 401 }));
        if (window.__marketMode === 'network') return Promise.reject(new Error('synthetic network failure'));
        const payload = symbol === 'MSFT' ? { c: 0, t: 0 } : { c: 101.25, pc: 100, t: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000) };
        return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      window.WebSocket = class MockStockSocket {
        constructor(url) { this.url = url; this.sent = []; this.closed = false; window.__stockSockets.push(this); setTimeout(() => { if (!this.closed) this.onopen?.({}); }, 0); }
        send(data) { this.sent.push(JSON.parse(data)); }
        close() { this.closed = true; }
        emit(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
        fail() { this.onerror?.({}); }
      };
    });
    await page.goto(base + '/blank');
    await page.evaluate(({ ledgerKey, data }) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('northstar-welcome-seen-v1', '1'); localStorage.setItem(ledgerKey, JSON.stringify(data)); }, { ledgerKey, data });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.NorthstarLedger === 'function' && window.NorthstarLedger() && window.__authCallback);
    return page;
  }
  async function nav(page, name) {
    await page.$eval(`#mobileDock [data-page="${name}"]`, el => el.click());
    await page.waitForFunction(name => document.querySelector('#content')?.dataset.page === name, {}, name);
  }
  async function setInput(page, selector, value) {
    await page.$eval(selector, (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  }
  async function submit(page, selector) { await page.$eval(selector, form => form.requestSubmit()); }
  async function text(page, selector) { return page.$eval(selector, el => el.innerText); }
  async function connect(page, mode = 'ok') {
    await page.evaluate(mode => { window.__marketMode = mode; }, mode);
    await setInput(page, '#stockApiKey', 'browser-test-only-key'); await submit(page, '#stockConnectForm');
    await page.waitForFunction(() => document.querySelector('#stockConnectionLabel')?.innerText !== 'Not connected');
  }
  async function screenshot(page, name) {
    if (!process.env.STOCK_QA_SCREENSHOTS) return;
    fs.mkdirSync(process.env.STOCK_QA_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.STOCK_QA_SCREENSHOTS, name + '.png') });
  }
  try {
    await check('100 starters replace the dock Guide without creating prices or changing finance or Guide data', async () => {
      const page = await newPage(); const before = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
      await nav(page, 'Stocks');
      assert.equal(await page.$$eval('#stockRows .stock-row', rows => rows.length), 100);
      assert.equal(await page.$('#mobileDock [data-page="Guide"]'), null);
      assert.equal(await page.$eval('#mobileDock [data-page="Stocks"]', el => el.getAttribute('aria-current')), 'page');
      assert.match(await text(page, '#stockResultCount'), /100 stocks/);
      assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /No price yet/);
      assert.equal(await page.evaluate(() => window.__marketCalls.length + window.__stockSockets.length), 0);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), null, 'starters are a display default, not a saved list');
      await nav(page, 'Settings'); await page.$eval('#content [data-page="Guide"]', el => el.click());
      assert.equal(await page.$eval('#guideProfileForm [name="notes"]', el => el.value), 'Keep this profile');
      assert.match(await text(page, '#content'), /Keep this Guide note/);
      assert.match(await text(page, '[data-graph-key="guide-profile"]'), /Monthly income/);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
      await page.close();
    });

    await check('search and add/remove are keyboard friendly, persist symbols, and preserve unrelated records', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      const baseline = await page.evaluate(() => window.NorthstarLedger());
      await page.focus('#stockSearch'); await page.keyboard.type('apple');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'stockSearch');
      assert.equal(await page.$$eval('#stockRows .stock-row:not([hidden])', rows => rows.length), 1);
      assert.match(await text(page, '#stockResultCount'), /1 stock matching/);
      await setInput(page, '#stockSearch', '');
      await setInput(page, '#stockTicker', '<img>'); await submit(page, '#stockAddForm');
      assert.match(await text(page, '#toastRoot'), /Enter a U.S.-listed ticker/);
      await setInput(page, '#stockTicker', ' aapl '); await submit(page, '#stockAddForm');
      assert.match(await text(page, '#toastRoot'), /already on your watchlist/);
      await setInput(page, '#stockTicker', 'synt'); await submit(page, '#stockAddForm');
      assert.equal(await page.$$eval('#stockRows .stock-row', rows => rows.length), 101);
      assert.match(await text(page, '[data-stock-symbol="SYNT"]'), /Custom ticker/);
      let saved = await page.evaluate(() => window.NorthstarLedger());
      assert.equal(saved.settings.stockWatchlist.length, 101); assert.equal(saved.settings.stockWatchlist.at(-1), 'SYNT');
      for (const name of ['accounts', 'transactions', 'budgets', 'goals', 'purchases']) assert.deepEqual(saved[name], fixture[name]);
      assert.deepEqual(saved.settings.profile, baseline.settings.profile); assert.deepEqual(saved.settings.guideMemory, baseline.settings.guideMemory);
      await page.$eval('[data-action="stock-remove"][data-symbol="SYNT"]', el => el.click());
      saved = await page.evaluate(() => window.NorthstarLedger()); assert.equal(saved.settings.stockWatchlist.length, 100);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.NorthstarLedger?.()); await nav(page, 'Stocks');
      assert.equal(await page.$$eval('#stockRows .stock-row', rows => rows.length), 100);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.includes('SYNT')), false);
      await page.close();
    });

    await check('an empty saved list stays empty; reset requires confirmation and restores exactly 100', async () => {
      const data = structuredClone(fixture); data.settings.stockWatchlist = [];
      const page = await newPage({ data }); await nav(page, 'Stocks');
      assert.equal(await page.$$eval('#stockRows .stock-row', rows => rows.length), 0);
      assert.match(await text(page, '#stockEmpty'), /watchlist is empty/i);
      await page.$eval('[data-action="stock-reset"]', el => el.click()); await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.$eval('#confirmRoot [data-confirm-index="1"]', el => el.click());
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.length), 0);
      await page.$eval('[data-action="stock-reset"]', el => el.click()); await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.$eval('#confirmRoot [data-confirm-index="0"]', el => el.click());
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.length), 100);
      assert.equal(await page.$$eval('#stockRows .stock-row', rows => rows.length), 100);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.guideMemory), fixture.settings.guideMemory);
      await page.close();
    });

    await check('mock prices, timestamps and real-time trades are honest and never stored with the key', async () => {
      const data = structuredClone(fixture); data.settings.stockWatchlist = ['AAPL', 'MSFT'];
      const page = await newPage({ data }); await nav(page, 'Stocks');
      const before = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
      await connect(page); await page.waitForFunction(() => document.querySelector('[data-stock-symbol="AAPL"] .stock-quote')?.innerText.includes('$101.25'));
      assert.match(await text(page, '[data-stock-symbol="AAPL"] .stock-quote'), /Snapshot · Finnhub/);
      assert.match(await text(page, '[data-stock-symbol="AAPL"] .stock-quote'), /\+1\.25% vs previous close/);
      assert.doesNotMatch(await text(page, '[data-stock-symbol="AAPL"] .stock-quote'), /Live trade/);
      assert.ok(await page.$('[data-stock-symbol="AAPL"] time[datetime]'));
      await page.waitForFunction(() => window.__marketCalls.length >= 2, { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('[data-stock-symbol="MSFT"]')?.innerText.includes('No quote returned'));
      assert.match(await text(page, '[data-stock-symbol="MSFT"]'), /No price yet/);
      // An almost-expired trade should lose its live label without any new
      // message, network request or minute-long polling interval.
      await page.evaluate(() => window.__stockSockets[0].emit({ type: 'trade', data: [{ s: 'AAPL', p: 160.75, t: Date.now() - 118_000 }] }));
      await page.waitForFunction(() => document.querySelector('[data-stock-symbol="AAPL"]')?.innerText.includes('$160.75'));
      assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /Live trade · Finnhub/);
      assert.doesNotMatch(await text(page, '[data-stock-symbol="AAPL"]'), /previous close/);
      const callsBeforeExpiry = await page.evaluate(() => window.__marketCalls.length);
      await page.waitForFunction(() => document.querySelector('[data-stock-symbol="AAPL"]')?.innerText.includes('Last trade · Finnhub'), { timeout: 6000 });
      assert.equal(await page.evaluate(() => window.__marketCalls.length), callsBeforeExpiry);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
      const contents = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, ledger: window.NorthstarLedger() }));
      assert.doesNotMatch(contents, /browser-test-only-key|160\.75|101\.25/);
      await nav(page, 'Overview'); assert.equal(await page.evaluate(() => window.__stockSockets[0].closed), true);
      await nav(page, 'Stocks'); assert.equal(await page.evaluate(() => window.__stockSockets.length), 2);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.NorthstarLedger?.()); await nav(page, 'Stocks');
      assert.ok(await page.$('#stockApiKey')); assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /No price yet/);
      assert.equal(await page.evaluate(() => window.__marketCalls.length), 0);
      await page.close();
    });

    await check('streaming quote paints do not rescan purchase or graph views', async () => {
      const data = structuredClone(fixture); data.settings.stockWatchlist = ['AAPL'];
      const page = await newPage({ data }); await nav(page, 'Stocks'); await connect(page);
      await page.waitForFunction(() => window.__stockSockets[0]?.sent.some(item => item.type === 'subscribe') &&
        document.querySelector('[data-stock-symbol="AAPL"] .stock-quote')?.textContent.includes('$101.25'));
      await new Promise(resolve => setTimeout(resolve, 200));
      const before = await page.evaluate(() => window.NorthstarLedger());
      await page.evaluate(() => {
        const content = document.getElementById('content'), queryAll = content.querySelectorAll.bind(content), query = document.querySelector.bind(document);
        window.__graphScans = 0; window.__purchaseScans = 0;
        content.querySelectorAll = selector => { if (selector === '[data-graph-key]') window.__graphScans++; return queryAll(selector); };
        document.querySelector = selector => { if (selector === '.priority-group-purchased') window.__purchaseScans++; return query(selector); };
      });
      for (let i = 0; i < 4; i++) {
        const price = 110 + i;
        await page.evaluate(price => window.__stockSockets[0].emit({ type: 'trade', data: [{ s: 'AAPL', p: price, t: Date.now() }] }), price);
        await page.waitForFunction(price => document.querySelector('[data-stock-symbol="AAPL"] .stock-quote')?.textContent.includes(`$${price}.00`), {}, price);
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => window.__graphScans), 0);
      assert.equal(await page.evaluate(() => window.__purchaseScans), 0);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger()), before);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      await page.close();
    });

    await check('hidden pages pause the feed and disconnect clears the in-memory key and prices', async () => {
      const data = structuredClone(fixture); data.settings.stockWatchlist = ['AAPL'];
      const page = await newPage({ data }); await nav(page, 'Stocks'); await connect(page);
      await page.waitForFunction(() => window.__marketCalls.length === 1);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
      assert.equal(await page.evaluate(() => window.__stockSockets[0].closed), true);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => window.__stockSockets.length === 2);
      await page.$eval('[data-action="stock-disconnect"]', el => el.click());
      assert.ok(await page.$('#stockApiKey')); assert.equal(await page.evaluate(() => window.__stockSockets[1].closed), true);
      assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /No price yet/);
      await page.close();
    });

    await check('account changes and workspace restore clear the session key and cached quotes', async () => {
      const data = structuredClone(fixture); data.settings.stockWatchlist = ['AAPL'];
      const page = await newPage({ data }); await nav(page, 'Stocks'); await connect(page);
      await page.waitForFunction(() => window.__marketCalls.length === 1);
      await page.evaluate(() => { window.__mockCloud = null; void window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert && !!document.querySelector('#stockApiKey'));
      assert.equal(await page.evaluate(() => window.__stockSockets[0].closed), true);
      assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /No price yet/);
      const uploaded = await page.evaluate(() => JSON.stringify(window.__cloudWrites));
      assert.doesNotMatch(uploaded, /browser-test-only-key|101\.25/);
      await connect(page); await nav(page, 'Settings');
      await page.evaluate(data => {
        const input = document.getElementById('backupFile'), files = new DataTransfer();
        files.items.add(new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' }));
        input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      }, data);
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.$eval('#confirmRoot [data-confirm-index="0"]', el => el.click());
      await page.waitForFunction(() => !document.querySelector('#confirmRoot .confirm-dialog'));
      await nav(page, 'Stocks');
      assert.ok(await page.$('#stockApiKey')); assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /No price yet/);
      await page.close();
    });

    await check('rate limits and invalid keys are visible without inventing prices or exposing tokens', async () => {
      for (const [mode, message] of [['rate', /rate limit/i], ['auth', /rejected access/i], ['network', /Cannot reach Finnhub/i]]) {
        const data = structuredClone(fixture); data.settings.stockWatchlist = ['AAPL'];
        const page = await newPage({ data }); await nav(page, 'Stocks'); await connect(page, mode);
        await page.waitForFunction(pattern => new RegExp(pattern, 'i').test(document.querySelector('#stockFeedStatus')?.innerText || ''), {}, message.source);
        assert.match(await text(page, '#stockFeedStatus'), message);
        assert.doesNotMatch(await text(page, '#stockFeedStatus'), /browser-test-only-key/);
        assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /No price yet/);
        await page.close();
      }
    });

    await check('a watchlist-only workspace is not silently replaced during mocked cloud sign-in', async () => {
      const data = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { currency: 'USD', stockWatchlist: ['AAPL'] } };
      const page = await newPage({ data }); const localBefore = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
      await page.evaluate(fixture => { window.__mockCloud = { data: fixture, updatedAt: 1 }; void window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); }, fixture);
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      assert.match(await text(page, '#confirmRoot'), /different finance data/i);
      await page.$eval('#confirmRoot [data-confirm-index="2"]', el => el.click());
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), ['AAPL']);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), localBefore);
      assert.equal(await page.evaluate(() => localStorage.getItem('northstar-finance-v1:alice')), null);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      // Retry and explicitly choose the device copy; only then is it uploaded.
      await page.evaluate(() => { void window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.$eval('#confirmRoot [data-confirm-index="1"]', el => el.click());
      await page.waitForFunction(() => window.__cloudWrites?.length === 1);
      assert.deepEqual(await page.evaluate(() => window.__cloudWrites[0].data.settings.stockWatchlist), ['AAPL']);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), localBefore);
      await page.close();
    });

    await check('different local and account device copies prompt before a custom list or finance records can be replaced', async () => {
      const page = await newPage();
      const device = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { stockWatchlist: [] } };
      const before = await page.evaluate(({ device, key }) => {
        const account = JSON.stringify(device); localStorage.setItem('northstar-finance-v1:alice', account);
        return { account, local: localStorage.getItem(key) };
      }, { device, key: ledgerKey });
      await page.evaluate(() => { window.__mockCloud = null; void window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      assert.match(await text(page, '#confirmRoot'), /different local and Google-account device copies/i);
      await page.$eval('#confirmRoot [data-confirm-index="2"]', el => el.click());
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), []);
      assert.equal(await page.evaluate(() => localStorage.getItem('northstar-finance-v1:alice')), before.account);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before.local);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      // Deferring keeps the account copy active: a later edit must not silently
      // overwrite it with the other workspace the visitor hasn't selected.
      await nav(page, 'Stocks'); await setInput(page, '#stockTicker', 'NVDA'); await submit(page, '#stockAddForm');
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:alice')).settings.stockWatchlist), ['NVDA']);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before.local);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      // A retry must still offer both device copies, including the edits to the
      // account copy, rather than silently selecting the previously deferred one.
      await page.evaluate(() => { void window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      assert.match(await text(page, '#confirmRoot'), /different local and Google-account device copies/i);
      await page.$eval('#confirmRoot [data-confirm-index="2"]', el => el.click());
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), ['NVDA']);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before.local);
      await page.close();
    });

    await check('empty lists and Guide-only data require cloud conflict choices; untouched starters do not', async () => {
      const blank = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { currency: 'USD' } };
      for (const settings of [{ stockWatchlist: [] }, { profile: { notes: 'Keep this Guide-only note' } }]) {
        const data = structuredClone(blank); Object.assign(data.settings, settings);
        const page = await newPage({ data });
        const before = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
        await page.evaluate(fixture => { window.__mockCloud = { data: fixture, updatedAt: 1 }; void window.__authCallback({ uid: 'alice' }); }, fixture);
        await page.waitForSelector('#confirmRoot .confirm-dialog');
        assert.match(await text(page, '#confirmRoot'), /different finance data/i);
        await page.$eval('#confirmRoot [data-confirm-index="2"]', el => el.click());
        await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
        assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
        if (settings.stockWatchlist) assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), []);
        else assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.profile.notes), 'Keep this Guide-only note');
        await page.close();
      }
      const page = await newPage({ data: blank });
      const cloud = structuredClone(fixture); cloud.settings.stockWatchlist = ['MSFT'];
      await page.evaluate(cloud => { window.__mockCloud = { data: cloud, updatedAt: 1 }; void window.__authCallback({ uid: 'alice' }); }, cloud);
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert && window.NorthstarLedger()?.accounts.length === 1);
      assert.equal(await page.$('#confirmRoot .confirm-dialog'), null);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), ['MSFT']);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      await page.close();
    });

    await check('a Guide-only account copy and a different local finance copy require an explicit device choice', async () => {
      const page = await newPage();
      const guide = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { profile: { notes: 'Account Guide only' } } };
      await page.evaluate(guide => { localStorage.setItem('northstar-finance-v1:alice', JSON.stringify(guide)); window.__mockCloud = null; void window.__authCallback({ uid: 'alice' }); }, guide);
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      assert.match(await text(page, '#confirmRoot'), /different local and Google-account device copies/i);
      await page.$eval('#confirmRoot [data-confirm-index="2"]', el => el.click());
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.profile.notes), 'Account Guide only');
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).accounts, ledgerKey), fixture.accounts);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:alice')).settings.profile.notes), 'Account Guide only');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      await page.close();
    });

    await check('a device copy changed during either choice is not overwritten or uploaded', async () => {
      for (const stage of ['device', 'cloud']) {
        const local = structuredClone(fixture); local.settings.stockWatchlist = ['AAPL'];
        const page = await newPage({ data: local });
        const account = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { stockWatchlist: [] } };
        await page.evaluate(({ stage, account, fixture }) => {
          if (stage === 'device') localStorage.setItem('northstar-finance-v1:alice', JSON.stringify(account));
          window.__mockCloud = stage === 'cloud' ? { data: fixture, updatedAt: 1 } : null;
          void window.__authCallback({ uid: 'alice' });
        }, { stage, account, fixture });
        await page.waitForSelector('#confirmRoot .confirm-dialog');
        const newRaw = await page.evaluate(() => {
          const replacement = JSON.stringify({ version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { stockWatchlist: ['NVDA'] } });
          localStorage.setItem('northstar-finance-v1:alice', replacement); return replacement;
        });
        await page.$eval('#confirmRoot [data-confirm-index="1"]', el => el.click());
        await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
        assert.equal(await page.evaluate(() => localStorage.getItem('northstar-finance-v1:alice')), newRaw);
        assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
        assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), ['NVDA']);
        await nav(page, 'Stocks'); await setInput(page, '#stockTicker', 'MSFT'); await submit(page, '#stockAddForm');
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:alice')).settings.stockWatchlist), ['NVDA', 'MSFT']);
        assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
        await page.close();
      }
    });

    await check('a local source changed during device selection is never uploaded from a stale snapshot', async () => {
      const initial = structuredClone(fixture); initial.settings.stockWatchlist = ['AAPL'];
      const page = await newPage({ data: initial });
      const account = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { stockWatchlist: [] } };
      await page.evaluate(account => {
        localStorage.setItem('northstar-finance-v1:alice', JSON.stringify(account));
        window.__mockCloud = null; void window.__authCallback({ uid: 'alice' });
      }, account);
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.evaluate(({ initial, key }) => {
        const newer = structuredClone(initial); newer.settings.stockWatchlist = ['NVDA'];
        localStorage.setItem(key, JSON.stringify(newer));
      }, { initial, key: ledgerKey });
      await page.$eval('#confirmRoot [data-confirm-index="1"]', el => el.click());
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), []);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).settings.stockWatchlist, ledgerKey), ['NVDA']);
      // Reload reads the newer local slot. The visitor can then make a fresh,
      // explicit choice without uploading the old AAPL snapshot.
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.NorthstarLedger?.() && window.__authCallback);
      await page.evaluate(() => { window.__mockCloud = null; void window.__authCallback({ uid: 'alice' }); });
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.$eval('#confirmRoot [data-confirm-index="1"]', el => el.click());
      await page.waitForFunction(() => window.__cloudWrites?.length === 1 && !document.querySelector('.app-shell').inert);
      assert.deepEqual(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist), ['NVDA']);
      await page.close();
    });

    await check('restoring an older backup removes an obsolete cloud watchlist under Firestore-style merge', async () => {
      const initial = structuredClone(fixture); initial.settings.stockWatchlist = ['AAPL'];
      const page = await newPage({ data: initial });
      await page.evaluate(initial => { window.__mockCloud = { data: initial, updatedAt: 1 }; void window.__authCallback({ uid: 'alice' }); }, initial);
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert && !!localStorage.getItem('northstar-finance-v1:alice'));
      await nav(page, 'Settings');
      await page.evaluate(fixture => {
        const input = document.getElementById('backupFile'), files = new DataTransfer();
        files.items.add(new File([JSON.stringify(fixture)], 'old-backup.json', { type: 'application/json' }));
        input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      }, fixture);
      await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.$eval('#confirmRoot [data-confirm-index="0"]', el => el.click());
      await page.waitForFunction(() => window.__cloudWrites?.length && window.__mockCloud?.data?.settings?.stockWatchlist?.length === 100);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.length), 100);
      assert.deepEqual(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist.slice(0, 2)), ['AAPL', 'MSFT']);
      assert.deepEqual(await page.evaluate(() => window.__mockCloud.data.accounts), fixture.accounts);
      await nav(page, 'Stocks'); assert.equal(await page.$$eval('#stockRows .stock-row', rows => rows.length), 100);
      await page.close();
    });

    await check('clearing a signed-in workspace clears its stock list and key locally and in the merged cloud copy', async () => {
      const initial = structuredClone(fixture); initial.settings.stockWatchlist = ['AAPL'];
      const page = await newPage({ data: initial });
      await page.evaluate(initial => { window.__mockCloud = { data: initial, updatedAt: 1 }; void window.__authCallback({ uid: 'alice' }); }, initial);
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert && !!localStorage.getItem('northstar-finance-v1:alice'));
      await nav(page, 'Stocks'); await connect(page); await page.waitForFunction(() => window.__marketCalls.length > 0);
      await nav(page, 'Settings'); await page.$eval('[data-action="clear-data"]', el => el.click());
      await page.waitForSelector('#clearPasswordForm');
      await setInput(page, '#clearPasswordInput', 'test-password'); await setInput(page, '#clearPasswordConfirm', 'test-password'); await submit(page, '#clearPasswordForm');
      await page.waitForFunction(() => !document.querySelector('#clearPasswordForm'));
      await page.$eval('[data-action="clear-data"]', el => el.click()); await page.waitForSelector('#clearPasswordForm');
      await setInput(page, '#clearPasswordInput', 'test-password'); await submit(page, '#clearPasswordForm');
      await page.waitForSelector('#confirmRoot [data-confirm-index="0"]');
      await page.$eval('#confirmRoot [data-confirm-index="0"]', el => el.click());
      await page.waitForFunction(() => window.__cloudWrites?.length && window.__mockCloud?.data?.settings?.stockWatchlist?.length === 100 && window.__mockCloud.data.accounts.length === 0);
      assert.equal(await page.evaluate(() => window.__stockSockets[0].closed), true);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().accounts), []);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.guideMemory), null);
      await nav(page, 'Stocks'); assert.equal(await page.$$eval('#stockRows .stock-row', rows => rows.length), 100);
      assert.ok(await page.$('#stockApiKey')); assert.match(await text(page, '[data-stock-symbol="AAPL"]'), /No price yet/);
      await page.close();
    });

    await check('a clear or blank-backup restore while sync is paused cannot silently resurrect the cloud', async () => {
      for (const action of ['clear', 'restore']) {
        const local = structuredClone(fixture); local.settings.stockWatchlist = ['AAPL'];
        const account = structuredClone(fixture); account.settings.stockWatchlist = ['MSFT'];
        const page = await newPage({ data: local });
        const localRaw = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
        await page.evaluate(account => {
          localStorage.setItem('northstar-finance-v1:alice', JSON.stringify(account));
          window.__mockCloud = { data: account, updatedAt: 1 }; void window.__authCallback({ uid: 'alice' });
        }, account);
        await page.waitForSelector('#confirmRoot .confirm-dialog');
        await page.$eval('#confirmRoot [data-confirm-index="2"]', el => el.click());
        await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
        await nav(page, 'Settings');
        if (action === 'clear') {
          await page.$eval('[data-action="clear-data"]', el => el.click()); await page.waitForSelector('#clearPasswordForm');
          await setInput(page, '#clearPasswordInput', 'test-password'); await setInput(page, '#clearPasswordConfirm', 'test-password'); await submit(page, '#clearPasswordForm');
          await page.waitForFunction(() => !document.querySelector('#clearPasswordForm'));
          await page.$eval('[data-action="clear-data"]', el => el.click()); await page.waitForSelector('#clearPasswordForm');
          await setInput(page, '#clearPasswordInput', 'test-password'); await submit(page, '#clearPasswordForm');
        } else {
          await page.evaluate(() => {
            const blank = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: {} };
            const input = document.getElementById('backupFile'), files = new DataTransfer();
            files.items.add(new File([JSON.stringify(blank)], 'blank-old-backup.json', { type: 'application/json' }));
            input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        await page.waitForSelector('#confirmRoot [data-confirm-index="0"]');
        await page.$eval('#confirmRoot [data-confirm-index="0"]', el => el.click());
        await page.waitForFunction(() => !document.querySelector('#confirmRoot .confirm-dialog'));
        assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().accounts), []);
        assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.length), 100);
        assert.deepEqual(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist), ['MSFT']);
        assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
        // Retry must ask before either the clear/restore or the old cloud wins.
        await page.evaluate(() => { void window.__authCallback({ uid: 'alice' }); });
        await page.waitForSelector('#confirmRoot .confirm-dialog');
        assert.match(await text(page, '#confirmRoot'), /different finance data/i);
        await page.$eval('#confirmRoot [data-confirm-index="1"]', el => el.click());
        await page.waitForFunction(() => window.__cloudWrites?.length === 1 && !document.querySelector('.app-shell').inert);
        assert.deepEqual(await page.evaluate(() => window.__mockCloud.data.accounts), []);
        assert.equal(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist.length), 100);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), localRaw);
        await page.close();
      }
    });

    await check('resizing with More focused on the saved Guide moves focus to Settings', async () => {
      const page = await newPage({ width: 390, height: 844, mobile: true });
      await nav(page, 'Settings'); await page.$eval('#content [data-page="Guide"]', el => el.click());
      await page.$eval('#dockMoreBtn', el => el.click());
      await page.focus('#dockMoreMenu [data-page="Settings"]');
      await page.setViewport({ width: 1000, height: 800, isMobile: true, hasTouch: true });
      await page.waitForFunction(() => document.querySelector('#dockMoreMenu').hidden && document.activeElement.matches('#mobileDock .dock-item[data-page="Settings"]'));
      assert.equal(await page.$eval('#mobileDock .dock-item[data-page="Settings"]', el => el.getAttribute('aria-current')), 'page');
      await page.close();
    });

    await check('stock edits save into the encrypted workspace without storing a quote key or changing finance data', async () => {
      const page = await newPage({ width: 1000, height: 800, mobile: false });
      const uid = 'stock-test-user', password = 'stock-test-passphrase';
      const original = await page.evaluate(async ({ uid, password, fixture }) => {
        const { newKdf, deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const kdf = newKdf(), key = await deriveVaultKey(password, kdf), raw = JSON.stringify(await encryptLedger(fixture, key, kdf));
        localStorage.setItem('northstar-vault-v1:' + uid, raw); localStorage.setItem('northstar-vault-active-v1', JSON.stringify({ uid, phase: 'active' }));
        return raw;
      }, { uid, password, fixture });
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#vaultUnlockPass');
      await page.type('#vaultUnlockPass', password); await page.click('#vaultUnlockSubmit');
      await page.waitForFunction(() => !window.NorthstarVaultLocked && window.NorthstarLedger?.()); await nav(page, 'Stocks');
      await setInput(page, '#stockTicker', 'SYNT'); await submit(page, '#stockAddForm');
      await page.waitForFunction(({ uid, original }) => localStorage.getItem('northstar-vault-v1:' + uid) !== original, {}, { uid, original });
      const saved = await page.evaluate(async ({ uid, password }) => {
        const raw = localStorage.getItem('northstar-vault-v1:' + uid), envelope = JSON.parse(raw);
        const { deriveVaultKey, decryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        return { raw, ledger: await decryptLedger(envelope, await deriveVaultKey(password, envelope.kdf)) };
      }, { uid, password });
      assert.equal(saved.ledger.settings.stockWatchlist.at(-1), 'SYNT');
      assert.deepEqual(saved.ledger.accounts, fixture.accounts); assert.deepEqual(saved.ledger.settings.guideMemory, fixture.settings.guideMemory);
      assert.doesNotMatch(saved.raw, /SYNT|Synthetic checking/); assert.doesNotMatch(JSON.stringify(saved.ledger), /browser-test-only-key/);
      await page.close();
    });

    await check('watchlist controls and rows fit narrow phones, tablet, and desktop with accessible targets', async () => {
      for (const [width, height, mobile] of [[320, 568, true], [390, 844, true], [768, 1024, true], [1440, 900, false]]) {
        const page = await newPage({ width, height, mobile }); await nav(page, 'Stocks');
        const layout = await page.evaluate(() => {
          const selectors = ['.stock-heading', '.stock-hero', '.stock-disclosure', '.stock-list-panel', '#stockSearch', '#stockTicker', '[data-action="stock-reset"]', '[data-action="stock-remove"]'];
          const rects = selectors.map(selector => { const el = document.querySelector(selector), r = el.getBoundingClientRect(); return { selector, left: r.left, right: r.right, width: r.width, height: r.height }; });
          return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, rects };
        });
        assert.ok(layout.documentWidth <= width + 1, `${width}: horizontal overflow ${JSON.stringify(layout)}`);
        for (const r of layout.rects) assert.ok(r.left >= -1 && r.right <= width + 1, `${width}: outside viewport ${JSON.stringify(r)}`);
        for (const r of layout.rects.filter(r => r.selector.includes('data-action'))) assert.ok(r.width >= 44 && r.height >= 44, `${width}: small target ${JSON.stringify(r)}`);
        await screenshot(page, `stocks-${width}`); await page.close();
      }
    });

    await check('the watchlist passes scoped automated WCAG checks', async () => {
      const page = await newPage({ width: 1000, height: 800, mobile: false }); await nav(page, 'Stocks');
      await page.addScriptTag({ path: axePath });
      const result = await page.evaluate(async () => {
        const audit = await window.axe.run(document.querySelector('.stock-page'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return { violations: audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: audit.incomplete.length };
      });
      assert.deepEqual(result.violations, [], JSON.stringify(result.violations, null, 2));
      console.log(`  Stock axe check: ${result.incomplete} incomplete/manual-review results.`); await page.close();
    });
    assert.deepEqual(errors, [], 'no uncaught page errors');
    console.log(`\n${passed} stock browser scenarios passed. Provider and Firebase traffic was mocked.`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
