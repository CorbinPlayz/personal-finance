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
const assets = new Set(['index.html', 'vault-crypto.mjs', 'csv-export.mjs', 'split.mjs', 'recurring.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css', 'stock-watchlist.mjs', 'stock-watchlist-view.mjs', 'stock-watchlist.css']);
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
  'firebase-auth.js': 'export function getAuth(){return {get currentUser(){return window.__mockCurrentUser??null}}} export function onAuthStateChanged(auth,cb){window.__authCallback=user=>{window.__mockCurrentUser=user?{uid:user.uid}:null;return cb(user)};cb(null)} export class GoogleAuthProvider{} export function getRedirectResult(){return Promise.resolve(null)}',
  'firebase-firestore.js': `export function getFirestore(){return {}} export function doc(){return {}}
    export async function getDocFromServer(){if(window.__mockReadError){const e=new Error('synthetic read failure');e.code=window.__mockReadError;throw e}const raw=window.__mockCloud??null;return {exists:()=>raw!==null,data:()=>raw}}
    export async function runTransaction(db,callback){if(window.__mockWriteError){const e=new Error('synthetic write failure');e.code=window.__mockWriteError;throw e}const raw=window.__mockCloud??null;let payload,options;
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
  async function newPage({ width = 390, height = 844, mobile = true, data = fixture, blockFirebase = false } = {}) {
    const page = await browser.newPage(); page.setDefaultTimeout(12000);
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return void request.continue();
      const name = Object.keys(firebase).find(item => url.endsWith('/' + item));
      if (name && !blockFirebase) return void request.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: firebase[name] });
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
    await page.waitForFunction(blocked => typeof window.NorthstarLedger === 'function' && window.NorthstarLedger() && (blocked || window.__authCallback), {}, blockFirebase);
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
  // Mock sign-in through the page's own auth callback; `cloud` is the account's existing document (null = none).
  async function signIn(page, { uid = 'alice', cloud = null } = {}) {
    await page.evaluate(({ uid, cloud }) => { window.__mockCloud = cloud; window.__mockCurrentUser = { uid }; void window.__authCallback({ uid, displayName: 'Synthetic user' }); }, { uid, cloud });
  }
  const saveLine = page => page.$eval('#stockSaveStatus', el => ({ text: el.innerText.replace(/\s+/g, ' ').trim(), tone: el.dataset.tone, link: !!el.querySelector('.stock-save-link') }));
  const waitForSaveTone = (page, tone) => page.waitForFunction(tone => document.querySelector('#stockSaveStatus')?.dataset.tone === tone && !document.querySelector('.app-shell').inert, {}, tone);
  const toastText = page => page.$eval('#toastRoot .toast span:nth-of-type(2)', el => el.innerText.trim());
  async function addTicker(page, symbol) { await setInput(page, '#stockTicker', symbol); await submit(page, '#stockAddForm'); }
  async function screenshot(page, name) {
    if (!process.env.STOCK_QA_SCREENSHOTS) return;
    fs.mkdirSync(process.env.STOCK_QA_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.STOCK_QA_SCREENSHOTS, name + '.png') });
  }
  // An account document that differs from the device fixture: 3 transactions and 2 accounts, saved on 15 Nov.
  const differentCloudCopy = () => ({
    data: {
      version: 1,
      accounts: [{ id: 'cloud-a', name: 'Cloud checking', type: 'Checking', balance: 900 }, { id: 'cloud-b', name: 'Cloud savings', type: 'Savings', balance: 1200 }],
      transactions: [1, 2, 3].map(n => ({ id: 'cloud-tx-' + n, type: 'Expense', amount: n * 10, date: '2026-02-0' + n, accountId: 'cloud-a', category: 'Food', description: 'Cloud payee ' + n })),
      budgets: [], goals: [], purchases: [],
      settings: { currency: 'USD', goalSounds: false, stockWatchlist: null, profile: { monthlyIncome: '', essentialBills: '', cushion: '250', payFrequency: 'monthly', payDay: '', goalFocus: '', notes: '' }, guideMemory: null },
    },
    updatedAt: Date.UTC(2026, 10, 15, 21, 12), schemaVersion: 1,
  });
  // Focus moves into a dialog on a short timer, and Escape is only heard from inside it, so wait for both before touching it.
  const choose = async (page, index) => {
    await page.waitForSelector('#confirmRoot .confirm-dialog');
    await page.$eval(`#confirmRoot [data-confirm-index="${index}"]`, el => el.click());
  };
  // The question that decides which copy to keep is a bar pinned to the bottom of the screen, not a pop-up. Its buttons ignore taps for
  // 600 ms after it appears or opens, so a tap meant for something else cannot land on a choice that replaces data.
  const pick = async (page, value) => {
    await page.waitForFunction(() => !!document.querySelector('#syncChoiceBar:not(.is-collapsed)') && !document.querySelector('.app-shell').inert); await new Promise(resolve => setTimeout(resolve, 700));
    await page.$eval(`#syncChoiceBar [data-value="${value}"]`, el => el.click());
  };
  // The first or the second button, whichever of the three questions is showing: they offer their two copies in the same order.
  const pickAt = async (page, index) => {
    await page.waitForSelector('#syncChoiceBar:not(.is-collapsed)');
    await pick(page, await page.$$eval('#syncChoiceBar [data-action="answer-sync-choice"]', (buttons, index) => buttons[index].dataset.value, index));
  };
  // There is no pop-up to dismiss any more. A question nobody has answered is what "Decide later" used to leave behind: still waiting, nothing applied.
  const unanswered = page => page.waitForFunction(() => !!document.querySelector('#syncChoiceBar') && !document.querySelector('.app-shell').inert);
  const rects = page => page.evaluate(() => {
    const box = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
    return { bar: box('#syncChoiceBar'), dock: box('#mobileDock'), orb: box('.nsj-orb'), toast: box('#toastRoot .toast'), scrollY: Math.round(scrollY), pageHeight: document.documentElement.scrollHeight };
  });
  const overlaps = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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
      await choose(page, 1);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.length), 0);
      await page.$eval('[data-action="stock-reset"]', el => el.click()); await page.waitForSelector('#confirmRoot .confirm-dialog');
      await choose(page, 0);
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
      await choose(page, 0);
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
      await page.waitForSelector('#syncChoiceBar');
      assert.match(await text(page, '#syncChoiceBar'), /The two copies differ/i);
      await unanswered(page);
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), ['AAPL']);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), localBefore);
      assert.equal(await page.evaluate(() => localStorage.getItem('northstar-finance-v1:alice')), null);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      // Retry and explicitly choose the device copy; only then is it uploaded.
      await page.evaluate(() => { void window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
      await page.waitForSelector('#syncChoiceBar');
      await pickAt(page, 1);
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
      await page.waitForSelector('#syncChoiceBar');
      assert.match(await text(page, '#syncChoiceBar'), /different local and Google-account device copies/i);
      await unanswered(page);
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
      await page.waitForSelector('#syncChoiceBar');
      assert.match(await text(page, '#syncChoiceBar'), /different local and Google-account device copies/i);
      await unanswered(page);
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
        await page.waitForSelector('#syncChoiceBar');
        assert.match(await text(page, '#syncChoiceBar'), /The two copies differ/i);
        await unanswered(page);
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
      assert.equal(await page.$('#syncChoiceBar'), null);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), ['MSFT']);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      await page.close();
    });

    await check('a Guide-only account copy and a different local finance copy require an explicit device choice', async () => {
      const page = await newPage();
      const guide = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { profile: { notes: 'Account Guide only' } } };
      await page.evaluate(guide => { localStorage.setItem('northstar-finance-v1:alice', JSON.stringify(guide)); window.__mockCloud = null; void window.__authCallback({ uid: 'alice' }); }, guide);
      await page.waitForSelector('#syncChoiceBar');
      assert.match(await text(page, '#syncChoiceBar'), /different local and Google-account device copies/i);
      await unanswered(page);
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
        await page.waitForSelector('#syncChoiceBar');
        const newRaw = await page.evaluate(() => {
          const replacement = JSON.stringify({ version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { stockWatchlist: ['NVDA'] } });
          localStorage.setItem('northstar-finance-v1:alice', replacement); return replacement;
        });
        await pickAt(page, 1);
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
      await page.waitForSelector('#syncChoiceBar');
      await page.evaluate(({ initial, key }) => {
        const newer = structuredClone(initial); newer.settings.stockWatchlist = ['NVDA'];
        localStorage.setItem(key, JSON.stringify(newer));
      }, { initial, key: ledgerKey });
      await pickAt(page, 1);
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist), []);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).settings.stockWatchlist, ledgerKey), ['NVDA']);
      // Reload reads the newer local slot. The visitor can then make a fresh,
      // explicit choice without uploading the old AAPL snapshot.
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.NorthstarLedger?.() && window.__authCallback);
      await page.evaluate(() => { window.__mockCloud = null; void window.__authCallback({ uid: 'alice' }); });
      await page.waitForSelector('#syncChoiceBar');
      await pickAt(page, 1);
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
      await choose(page, 0);
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
      await choose(page, 0);
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
        await page.waitForSelector('#syncChoiceBar');
        await unanswered(page);
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
        await choose(page, 0);
        await page.waitForFunction(() => !document.querySelector('#confirmRoot .confirm-dialog'));
        assert.deepEqual(await page.evaluate(() => window.NorthstarLedger().accounts), []);
        assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.length), 100);
        assert.deepEqual(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist), ['MSFT']);
        assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
        // Retry must ask before either the clear/restore or the old cloud wins.
        await page.evaluate(() => { void window.__authCallback({ uid: 'alice' }); });
        await page.waitForSelector('#syncChoiceBar');
        assert.match(await text(page, '#syncChoiceBar'), /The two copies differ/i);
        await pickAt(page, 1);
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

    await check('signed out, the Stocks page and toast say the list is only on this device', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      const line = await saveLine(page);
      assert.equal(line.text, 'Saved on this device only. Sign in with Google to save your list to your account too.');
      assert.equal(line.tone, 'neutral'); assert.equal(line.link, false);
      await addTicker(page, 'synt');
      assert.match(await toastText(page), /^SYNT added to your watchlist · saved on this device only$/);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      await page.close();
    });

    await check('with confirmed cloud sync the line shows the account copy and every edit reaches the cloud document', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      await signIn(page); await waitForSaveTone(page, 'neutral');
      // An untouched list is stored as null on purpose; the page says so instead of implying a saved custom list.
      let line = await saveLine(page);
      assert.match(line.text, /^Showing the starter list\. Your first add or remove saves your own list to your Google account\.$/);
      assert.equal(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist), null);
      await addTicker(page, 'synt');
      assert.match(await toastText(page), /^SYNT added to your watchlist · saving to your account…$/);
      await page.waitForFunction(() => document.querySelector('#stockSaveStatus')?.dataset.tone === 'ok');
      line = await saveLine(page);
      assert.match(line.text, /^Saved to your Google account · confirmed \d{1,2}:\d{2}/); assert.equal(line.link, false);
      await page.$eval('#stockSaveStatus', el => el.scrollIntoView({ block: 'center' })); await screenshot(page, 'stocks-save-ok-390');
      let cloud = await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist);
      assert.equal(cloud.length, 101); assert.equal(cloud.at(-1), 'SYNT');
      await page.$eval('[data-action="stock-remove"][data-symbol="AAPL"]', el => el.click());
      await page.waitForFunction(() => window.__mockCloud.data.settings.stockWatchlist.length === 100);
      await page.waitForFunction(() => document.querySelector('#stockSaveStatus')?.dataset.tone === 'ok');
      cloud = await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist);
      assert.equal(cloud.includes('AAPL'), false); assert.equal(cloud.includes('SYNT'), true);
      // A second device that signs in to the same account sees the edited list.
      const blank = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { currency: 'USD' } };
      const other = await newPage({ data: blank }); await nav(other, 'Stocks'); // a fresh device has nothing of its own to protect
      await signIn(other, { cloud: await page.evaluate(() => window.__mockCloud) }); await waitForSaveTone(other, 'ok');
      assert.equal(await other.$$eval('#stockRows .stock-row', rows => rows.length), 100);
      assert.equal(await other.$('[data-stock-symbol="SYNT"]') !== null, true); assert.equal(await other.$('[data-stock-symbol="AAPL"]'), null);
      await page.close(); await other.close();
    });

    await check('a paused cloud sync is stated with its code, keeps edits on the device, and the link reaches diagnostics until a retry saves them', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      await page.evaluate(() => { window.__mockReadError = 'permission-denied'; });
      await signIn(page); await waitForSaveTone(page, 'warn');
      let line = await saveLine(page);
      assert.equal(line.text, 'Saved on this device only. Cloud sync is paused (permission-denied). Open sync diagnostics');
      assert.equal(line.link, true);
      await addTicker(page, 'synt');
      assert.match(await toastText(page), /^SYNT added to your watchlist · saved on this device only; cloud sync is paused$/);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:alice')).settings.stockWatchlist.at(-1)), 'SYNT');
      line = await saveLine(page); assert.equal(line.tone, 'warn');
      // The link opens Settings → Sync diagnostics, which names the same code.
      await page.$eval('.stock-save-link', el => el.click());
      await page.waitForFunction(() => document.querySelector('#content')?.dataset.page === 'Settings');
      assert.match(await text(page, '#syncDiagnosticsPanel'), /permission-denied/);
      // Once the cause is fixed, Retry loads the cloud copy and uploads the edit that was waiting on the device.
      await page.evaluate(() => { window.__mockReadError = null; });
      await page.$eval('[data-action="retry-sync"]', el => el.click());
      await page.waitForFunction(() => window.__cloudWrites?.length >= 1 && !document.querySelector('.app-shell').inert);
      assert.equal(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist.at(-1)), 'SYNT');
      await nav(page, 'Stocks'); await waitForSaveTone(page, 'ok');
      assert.match((await saveLine(page)).text, /^Saved to your Google account · confirmed/);
      await page.close();
    });

    await check('a cloud write that fails after sync was confirmed flips the line to paused and never claims the edit was saved', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      await signIn(page); await waitForSaveTone(page, 'neutral');
      const writesBefore = await page.evaluate(() => window.__cloudWrites?.length || 0); // the first sign-in uploads once
      await page.evaluate(() => { window.__mockWriteError = 'unavailable'; });
      await addTicker(page, 'synt');
      await waitForSaveTone(page, 'warn');
      const line = await saveLine(page);
      assert.match(line.text, /^Saved on this device only\. Cloud sync is paused \(unavailable\)\./); assert.equal(line.link, true);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), writesBefore, 'the failed write stored nothing');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:alice')).settings.stockWatchlist.at(-1)), 'SYNT');
      assert.equal(await page.evaluate(() => window.__mockCloud.data.settings.stockWatchlist), null, 'the cloud copy is untouched, not half-written');
      await page.close();
    });

    await check('typing in the search box survives a cloud save, whether it succeeds or fails', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      await signIn(page); await waitForSaveTone(page, 'neutral');
      const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (const failure of [false, true]) {
        await page.evaluate(failure => { window.__mockWriteError = failure ? 'unavailable' : null; }, failure);
        await setInput(page, '#stockSearch', ''); await addTicker(page, failure ? 'fail' : 'good');
        await frame(); // the add form returns focus to itself on the next frame; type after that
        await page.focus('#stockSearch'); await page.keyboard.type('app');
        assert.equal(await page.$eval('.stock-save-text', el => el.innerText), 'Saving to your Google account…', 'the save is still in flight while the visitor types');
        await waitForSaveTone(page, failure ? 'warn' : 'ok');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'stockSearch', failure ? 'focus after a failed save' : 'focus after a confirmed save');
        assert.equal(await page.$eval('#stockSearch', el => el.value), 'app');
      }
      await page.close();
    });

    await check('a pending save dropped by an outside sign-out (another tab) never leaves the line on Saving and uploads nothing', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      await signIn(page); await waitForSaveTone(page, 'neutral');
      const writesBefore = await page.evaluate(() => window.__cloudWrites?.length || 0);
      await addTicker(page, 'synt');
      assert.equal(await page.$eval('.stock-save-text', el => el.innerText), 'Saving to your Google account…');
      await page.evaluate(() => { window.__mockCurrentUser = null; void window.__authCallback(null); });
      await page.waitForFunction(() => /Sign in with Google/.test(document.querySelector('#stockSaveStatus')?.innerText || ''));
      await new Promise(resolve => setTimeout(resolve, 1000)); // longer than the 700 ms save delay
      assert.doesNotMatch((await saveLine(page)).text, /Saving/);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), writesBefore, 'the cancelled save wrote nothing');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:alice')).settings.stockWatchlist.at(-1)), 'SYNT', 'the edit stays in the account\'s device copy');
      await page.close();
    });

    await check('when the Firebase SDK cannot load, the Stocks page says cloud sync is unavailable and points to diagnostics', async () => {
      const page = await newPage({ blockFirebase: true }); await nav(page, 'Stocks');
      await waitForSaveTone(page, 'warn');
      const line = await saveLine(page);
      assert.match(line.text, /^Saved on this device only\. Cloud sync is unavailable because Firebase did not load( \(\S+\))?\. Open sync diagnostics$/);
      assert.equal(line.link, true);
      await addTicker(page, 'synt');
      assert.match(await toastText(page), /^SYNT added to your watchlist · saved on this device only$/);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.at(-1)), 'SYNT');
      await page.close();
    });

    async function openProtectedWorkspace() {
      const page = await newPage({ width: 1000, height: 800, mobile: false });
      const uid = 'stock-test-user', password = 'stock-test-passphrase';
      const raw = await page.evaluate(async ({ uid, password, fixture }) => {
        const { newKdf, deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const kdf = newKdf(), key = await deriveVaultKey(password, kdf), raw = JSON.stringify(await encryptLedger(fixture, key, kdf));
        localStorage.setItem('northstar-vault-v1:' + uid, raw); localStorage.setItem('northstar-vault-active-v1', JSON.stringify({ uid, phase: 'active' }));
        return raw;
      }, { uid, password, fixture });
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#vaultUnlockPass');
      await page.type('#vaultUnlockPass', password); await page.click('#vaultUnlockSubmit');
      await page.waitForFunction(() => !window.NorthstarVaultLocked && window.NorthstarLedger?.()); await nav(page, 'Stocks');
      return { page, uid, raw };
    }

    await check('a protected workspace with no protected cloud copy is reported as paused, never as saved to the account', async () => {
      const { page, uid } = await openProtectedWorkspace();
      await signIn(page, { uid }); await waitForSaveTone(page, 'warn');
      const line = await saveLine(page);
      assert.match(line.text, /^Saved on this device only\. Cloud sync is paused \(northstar\/conflict\)\. Open sync diagnostics$/); assert.equal(line.link, true);
      await addTicker(page, 'synt');
      assert.match(await toastText(page), /^SYNT added to your watchlist · saving protected device copy…$/); // the encrypted path keeps its own wording
      await waitForSaveTone(page, 'warn'); assert.match((await saveLine(page)).text, /\(northstar\/conflict\)/);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'a protected workspace is never uploaded without an explicit choice');
      await page.close();
    });

    await check('a signed-in protected workspace saves the edit encrypted to the cloud and the line says so only after the write', async () => {
      const { page, uid, raw } = await openProtectedWorkspace();
      await signIn(page, { uid, cloud: JSON.parse(raw) }); await waitForSaveTone(page, 'neutral');
      assert.match((await saveLine(page)).text, /^Showing the starter list\./);
      await addTicker(page, 'synt');
      assert.equal(await page.$eval('.stock-save-text', el => el.innerText), 'Saving to your Google account…', 'not claimed before the encrypted write');
      await page.waitForFunction(() => /^Saved to your Google account, encrypted with your passphrase · confirmed/.test(document.querySelector('#stockSaveStatus')?.innerText || ''));
      const cloud = await page.evaluate(() => JSON.stringify(window.__mockCloud));
      assert.match(cloud, /"format"/); assert.doesNotMatch(cloud, /SYNT|Synthetic checking|browser-test-only-key/);
      // A protected save that cannot reach the cloud is reported as paused, never as saved.
      await page.evaluate(() => { window.__mockWriteError = 'unavailable'; });
      await page.$eval('[data-action="stock-remove"][data-symbol="SYNT"]', el => el.click());
      await waitForSaveTone(page, 'warn');
      assert.match((await saveLine(page)).text, /^Saved on this device only\. Cloud sync is paused \(unavailable\)\./);
      await page.close();
    });

    await check('a protected workspace and a different protected cloud copy ask in the bar, upload only what is chosen, and never apply a stale answer', async () => {
      // The cloud copy is encrypted with this workspace's own passphrase key but holds other data, so the only thing in the way is the choice.
      const otherEnvelope = (page, raw) => page.evaluate(async ({ raw, other }) => {
        const { deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const kdf = JSON.parse(raw).kdf; return encryptLedger(other, await deriveVaultKey('stock-test-passphrase', kdf), kdf);
      }, { raw, other: differentCloudCopy().data });
      const openAsked = async () => {
        const opened = await openProtectedWorkspace();
        await signIn(opened.page, { uid: opened.uid, cloud: await otherEnvelope(opened.page, opened.raw) });
        await opened.page.waitForSelector('#syncChoiceBar'); return opened;
      };

      // The question is on screen as a bar, says nothing about either copy's contents, and changes nothing while it waits.
      const first = await openAsked();
      assert.equal(await first.page.$eval('#confirmRoot', el => el.innerHTML), '', 'no dialog was opened');
      const bar = await text(first.page, '#syncChoiceBar');
      assert.match(bar, /This device and your cloud contain different protected data\./);
      assert.match(bar, /Neither copy changes until you choose\. Export a backup first if you might need both\. Nothing changes until you tap a button\./);
      assert.doesNotMatch(bar, /Synthetic|Cloud payee|Cloud checking|stock-test-user/, 'a protected question shows nothing from either copy');
      assert.deepEqual(await first.page.$$eval('#syncChoiceBar [data-action="answer-sync-choice"]', els => els.map(el => el.innerText)), ['Use cloud copy', 'Keep this device']);
      assert.match(await first.page.$eval('#syncStatus', el => el.innerText), /^Protected sync conflict/);
      assert.equal(await first.page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      assert.equal(await first.page.evaluate(uid => localStorage.getItem('northstar-vault-v1:' + uid), first.uid), first.raw, 'the protected device copy is untouched while the question waits');
      // "Use cloud copy" puts the protected cloud copy on this device and uploads nothing.
      await pick(first.page, 'cloud');
      await first.page.waitForFunction(() => document.querySelector('#syncStatus')?.innerText === 'Protected cloud sync on' && !document.querySelector('.app-shell').inert);
      assert.equal(await first.page.evaluate(() => window.NorthstarLedger().transactions.length), 3, 'the device now shows the cloud copy');
      assert.equal(await first.page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'choosing the cloud copy uploads nothing');
      assert.notEqual(await first.page.evaluate(uid => localStorage.getItem('northstar-vault-v1:' + uid), first.uid), first.raw, 'the device copy is now the cloud one');
      assert.equal(await first.page.$('#syncChoiceBar'), null, 'answered, so the bar is gone');
      await first.page.close();

      // "Keep this device" uploads the protected device copy, and what reaches the account is still ciphertext.
      const second = await openAsked();
      await pick(second.page, 'local');
      await second.page.waitForFunction(() => window.__cloudWrites?.length === 1 && document.querySelector('#syncStatus')?.innerText === 'Protected cloud sync on' && !document.querySelector('.app-shell').inert);
      const uploaded = await second.page.evaluate(() => JSON.stringify(window.__mockCloud));
      assert.match(uploaded, /"format"/); assert.doesNotMatch(uploaded, /Synthetic|SYNT|Cloud payee|browser-test-only-key/, 'what reached the account is encrypted');
      assert.equal(await second.page.evaluate(() => window.NorthstarLedger().transactions.length), 1, 'the device copy was kept');
      await second.page.close();

      // An edit made on this device while the question waits cancels the answer: the bar asks again and nothing is uploaded.
      const third = await openAsked();
      await addTicker(third.page, 'synt');
      await pick(third.page, 'local');
      await third.page.waitForFunction(() => [...document.querySelectorAll('#toastRoot .toast')].some(el => /^.?\s*That question changed since you looked, so nothing was applied\./.test(el.innerText.trim())) && !document.querySelector('.app-shell').inert);
      assert.equal(await third.page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'a stale answer uploads nothing');
      assert.deepEqual(await third.page.evaluate(() => window.NorthstarLedger().settings.stockWatchlist.slice(-1)), ['SYNT'], 'the edit made while the question waited is still there');
      await third.page.waitForSelector('#syncChoiceBar');
      assert.equal(await third.page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      await third.page.close();
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

    await check('a different cloud copy asks which data to keep in a bar on the screen, describing both; early taps are ignored; Later and Open only change how it is shown; each choice does what it says', async () => {
      const page = await newPage(); await nav(page, 'Stocks'); // the device holds the synthetic fixture
      await signIn(page, { cloud: differentCloudCopy() });
      await page.waitForSelector('#syncChoiceBar');
      // It is not a pop-up: nothing dims the page, nothing is blocked, and there is no overlay that could fail to paint.
      assert.equal(await page.$eval('#confirmRoot', el => el.innerHTML), '', 'no dialog was opened');
      assert.equal(await page.evaluate(() => [document.querySelector('.app-shell').inert, document.querySelector('#mobileDock').inert]).then(list => list.join()), 'false,false', 'the page and the tab bar stay usable');
      // A tap meant for something else cannot land on a choice that replaces data in the moments after the bar appears.
      assert.equal(await page.evaluate(() => { document.querySelector('#syncChoiceBar [data-value="cloud"]').click(); return !!document.querySelector('#syncChoiceBar'); }), true, 'an immediate tap on a choice is ignored');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:local')).transactions.length), 1, 'the device copy was not replaced by it');
      assert.equal(await page.evaluate(() => (window.__cloudWrites?.length || 0) + (window.__mockCloud.data.transactions.length === 3 ? 0 : 1)), 0, 'the cloud copy was not replaced by it');
      const bar = await text(page, '#syncChoiceBar');
      assert.match(bar, /Which copy should Northstar keep\?/);
      assert.match(bar, /The two copies differ\. This browser has 1 transaction, 1 account, 1 budget, 1 goal, 1 planned purchase\./);
      assert.match(bar, /Your Google account has 3 transactions, 2 accounts \(last saved [^)]*\d[^)]*\)\./);
      assert.doesNotMatch(bar, /Synthetic|Cloud payee|Cloud checking|432/, 'the bar shows counts only, never names or amounts');
      assert.match(bar, /Use cloud copy replaces this device’s data with your account’s\. Keep this device replaces your account’s data with this device’s\. Not sure\? Tap Later, then use Export backup in Settings\./);
      assert.match(bar, /Nothing changes until you tap a button\./);
      assert.doesNotMatch(bar, /Decide later/, 'there is no pop-up to dismiss, so nothing is called Decide later');
      assert.deepEqual(await page.$$eval('#syncChoiceBar [data-action="answer-sync-choice"]', els => els.map(el => el.innerText)), ['Use cloud copy', 'Keep this device']);
      await screenshot(page, 'bar-open-390');
      // The header, the notice and the Stocks line say the same thing; no toast pretends the visitor deferred anything.
      let line = await saveLine(page);
      assert.equal(line.text, 'Saved on this device only. Cloud sync is waiting for you to choose which data to keep (northstar/conflict). Choose which data to keep');
      assert.equal(line.link, true);
      assert.equal(await page.$('#toastRoot .toast'), null, 'no toast');
      const header = await page.$eval('#syncStatus', el => ({ text: el.innerText, err: el.classList.contains('err') }));
      assert.match(header.text, /^Sync conflict · action needed/); assert.equal(header.err, true);
      const notice = await page.$eval('#syncIssueRoot', el => ({ text: el.innerText, action: el.querySelector('[data-action="choose-sync-data"]')?.innerText }));
      assert.equal(notice.action, 'Choose which data to keep'); assert.match(notice.text, /northstar\/conflict/);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'nothing was uploaded');
      assert.equal(await page.evaluate(() => window.NorthstarLedger().transactions.length), 1, 'the device copy is untouched');

      // Later shrinks it to a strip that stays pinned; the Stocks line (or the notice) brings it back. Neither decides anything.
      await page.$eval('#syncChoiceBar [data-action="minimize-sync-choice"]', el => el.click());
      await page.waitForSelector('#syncChoiceBar.is-collapsed');
      assert.equal(await text(page, '#syncChoiceBar'), 'Choose which data to keep\nOpen');
      assert.equal(await page.$('#syncChoiceBar [data-action="answer-sync-choice"]'), null, 'a strip cannot answer');
      await screenshot(page, 'bar-collapsed-390');
      await page.$eval('.stock-save-link', el => el.click());
      await page.waitForSelector('#syncChoiceBar:not(.is-collapsed)');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'syncChoiceBar', 'the question takes focus without moving the page');
      await page.$eval('#syncChoiceBar [data-action="minimize-sync-choice"]', el => el.click()); await page.waitForSelector('#syncChoiceBar.is-collapsed');
      await page.$eval('#syncIssueRoot [data-action="choose-sync-data"]', el => el.click());
      await page.waitForSelector('#syncChoiceBar:not(.is-collapsed)');
      await page.$eval('#syncChoiceBar [data-action="minimize-sync-choice"]', el => el.click()); await page.waitForSelector('#syncChoiceBar.is-collapsed');
      await page.$eval('#syncChoiceBar [data-action="expand-sync-choice"]', el => el.click());
      await page.waitForSelector('#syncChoiceBar:not(.is-collapsed)');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'shrinking and opening uploaded nothing');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:local')).transactions.length), 1);
      // Settings has its own button too, and it does the same.
      await nav(page, 'Settings');
      assert.equal(await page.$eval('#content .settings-layout > .panel:first-child [data-action="choose-sync-data"]', el => el.innerText), 'Choose which data to keep', 'the account section keeps its own button');
      assert.equal(await page.$eval('#syncDiagnosticsPanel [data-action="choose-sync-data"]', el => el.innerText), 'Choose which data to keep', 'and so does the diagnostics panel');
      assert.equal(await page.$('#content [data-action="retry-sync"]'), null, 'a choice is not a retry');
      assert.ok(await page.$('#syncChoiceBar'), 'the bar followed the visitor to Settings');
      const panel = await text(page, '#syncDiagnosticsPanel');
      assert.match(panel, /Sync is waiting for your choice\./); assert.match(panel, /Answer in the bar at the bottom of the screen/); assert.match(panel, /saved on this device only/);
      assert.doesNotMatch(panel, /changed the cloud document after this device loaded it, so nothing was overwritten/);
      // The access check proves the read works, but the header must not claim that sync is fine.
      await page.$eval('[data-action="check-cloud-access"]', el => el.click());
      await page.waitForFunction(() => /Read access confirmed/.test(document.querySelector('#syncDiagnosticsPanel')?.innerText || '') && !document.querySelector('.app-shell').inert);
      const checked = await page.$eval('#syncStatus', el => ({ text: el.innerText, err: el.classList.contains('err') }));
      assert.match(checked.text, /^Sync conflict · action needed/); assert.equal(checked.err, true); assert.doesNotMatch(checked.text, /confirmed/i);
      assert.match(await toastText(page), /Tap Choose which data to keep to finish syncing\.$/);
      await page.waitForSelector('#syncChoiceBar:not(.is-collapsed)');
      assert.match(await text(page, '#syncIssueRoot'), /northstar\/conflict/, 'the access check did not clear the conflict');
      assert.equal(await page.evaluate(() => (window.__cloudWrites?.length || 0)), 0);

      // "Use cloud copy" resolves it without uploading, through the same code a pop-up would have used, and without opening any dialog.
      await page.evaluate(() => { window.__dialogsOpened = 0; new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.querySelector?.('.confirm-dialog')) window.__dialogsOpened++; }).observe(document.querySelector('#confirmRoot'), { childList: true, subtree: true }); });
      await pick(page, 'cloud');
      await page.waitForFunction(() => document.querySelector('#syncStatus')?.innerText === 'Cloud sync on' && !document.querySelector('.app-shell').inert);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().transactions.length), 3, 'the device now shows the cloud copy');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'choosing the cloud copy uploads nothing');
      assert.equal(await page.evaluate(() => window.__dialogsOpened), 0, 'no dialog was needed');
      assert.equal(await page.$('#syncChoiceBar'), null, 'the question is gone once it is answered');
      assert.equal(await page.evaluate(() => document.body.classList.contains('has-sync-choice-bar')), false, 'and the page, the toast and the assistant button take their room back');
      assert.equal(await page.$('#syncIssueRoot .sync-issue-bar'), null, 'the notice is gone once sync is confirmed');
      await nav(page, 'Stocks'); line = await saveLine(page); assert.equal(line.tone, 'neutral'); assert.match(line.text, /^Showing the starter list\./);
      await page.close();

      // "Keep this device" uploads this device's copy and the line then confirms the saved list.
      const second = await newPage(); await nav(second, 'Stocks');
      await signIn(second, { cloud: differentCloudCopy() });
      await pick(second, 'local');
      await second.waitForFunction(() => window.__cloudWrites?.length >= 1 && document.querySelector('#syncStatus')?.innerText === 'Cloud sync on' && !document.querySelector('.app-shell').inert);
      assert.equal(await second.evaluate(() => window.__mockCloud.data.transactions.length), 1, 'the account now holds this device\'s copy');
      assert.equal(await second.$('#syncChoiceBar'), null);
      await addTicker(second, 'synt');
      await second.waitForFunction(() => /^Saved to your Google account · confirmed/.test(document.querySelector('#stockSaveStatus')?.innerText.replace(/\s+/g, ' ') || ''));
      assert.equal(await second.evaluate(() => window.__mockCloud.data.settings.stockWatchlist.at(-1)), 'SYNT');
      await second.close();
    });

    await check('two different device copies ask which workspace to use in the bar, describe both, and are answered there', async () => {
      const page = await newPage(); await nav(page, 'Stocks'); // the local workspace is the synthetic fixture
      await page.evaluate(copy => localStorage.setItem('northstar-finance-v1:alice', JSON.stringify(copy)), differentCloudCopy().data); // the account's earlier device copy
      await signIn(page, { cloud: null });
      await page.waitForSelector('#syncChoiceBar');
      assert.equal(await page.$eval('#confirmRoot', el => el.innerHTML), '', 'no dialog was opened');
      await waitForSaveTone(page, 'warn');
      const bar = await text(page, '#syncChoiceBar');
      assert.match(bar, /different local and Google-account device copies\. The Google-account copy has 3 transactions, 2 accounts\. The local workspace has 1 transaction, 1 account, 1 budget, 1 goal, 1 planned purchase\./);
      assert.doesNotMatch(bar, /Synthetic|Cloud payee|Cloud checking/, 'counts only');
      assert.match(bar, /The selected copy may replace the account’s device copy\. Cloud conflicts are checked next\./);
      assert.deepEqual(await page.$$eval('#syncChoiceBar [data-action="answer-sync-choice"]', els => els.map(el => el.innerText)), ['Use account device copy', 'Use local workspace']);
      assert.match(await toastText(page), /^Showing the account’s device copy until you choose\. Your other copy was kept\./, 'the toast says which copy is on screen meanwhile');
      assert.match((await saveLine(page)).text, /waiting for you to choose which data to keep \(northstar\/conflict\)\. Choose which data to keep$/);
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'nothing was uploaded');
      await pick(page, 'local'); // Use local workspace, then the cloud step runs
      await page.waitForFunction(() => document.querySelector('#syncStatus')?.innerText === 'Cloud sync on' && !document.querySelector('.app-shell').inert);
      assert.equal(await page.evaluate(() => window.__mockCloud.data.transactions.length), 1, 'the local workspace is what reached the account');
      assert.equal(await page.$('#syncChoiceBar'), null);
      await page.close();
    });

    await check('the bar stays pinned to the bottom of the screen above the tab bar on a phone, a small phone and a desktop, however far the page is scrolled', async () => {
      for (const [width, height, mobile] of [[390, 844, true], [320, 568, true], [1280, 800, false]]) {
        const label = `${width}x${height}`;
        const page = await newPage({ width, height, mobile }); await nav(page, 'Stocks'); // 100 starter rows: a page that really scrolls
        await signIn(page, { cloud: differentCloudCopy() }); await page.waitForSelector('#syncChoiceBar');
        const top = await rects(page);
        assert.ok(top.pageHeight > height * 2, `${label}: the page is long enough to scroll`);
        const { bar, dock } = top;
        assert.equal(await page.$eval('#syncChoiceBar', el => getComputedStyle(el).position), 'fixed', `${label}: pinned to the screen, not to the page`);
        assert.ok(bar.top >= 0 && bar.bottom <= height && bar.left >= 0 && bar.right <= width, `${label}: all of it is on screen ${JSON.stringify(bar)}`);
        assert.ok(bar.bottom <= dock.top - 4 && bar.bottom >= dock.top - 40, `${label}: right above the tab bar, not floating (bar bottom ${bar.bottom}, dock top ${dock.top})`);
        assert.ok(Math.abs((bar.left + bar.right) / 2 - width / 2) <= 1, `${label}: centred across the screen like the tab bar`);
        assert.ok(bar.width <= dock.width + 1 && bar.width <= (mobile ? width - 20 : 520), `${label}: no wider than the tab bar (${bar.width} vs ${dock.width})`);
        assert.ok(bar.bottom > height * 0.55, `${label}: in the lower part of the screen, not the middle`);
        // A bar like this is for glancing at, so it must not take over the screen: the whole question (down to the last line) shows without scrolling inside it.
        const fit = await page.$eval('#syncChoiceBar', el => ({ hidden: el.scrollHeight - el.clientHeight, height: el.getBoundingClientRect().height }));
        assert.ok(fit.hidden <= 1, `${label}: every line is visible without scrolling inside the bar (${fit.hidden}px cut off)`);
        const share = width < 400 && height < 600 ? 0.6 : 0.4;
        assert.ok(fit.height <= height * share, `${label}: it covers at most ${share * 100}% of the screen (${Math.round(fit.height)}px of ${height}px)`);
        assert.ok(!overlaps(bar, dock), `${label}: it does not cover the tab bar`);
        assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, document.querySelector('#mobileDock').getBoundingClientRect().top + 20)?.closest('#mobileDock') !== null), true, `${label}: the tab bar still gets the taps over it`);
        const buttons = await page.$$eval('#syncChoiceBar [data-action="answer-sync-choice"]', els => els.map(el => { const r = el.getBoundingClientRect(), b = document.querySelector('#syncChoiceBar').getBoundingClientRect(); return { label: el.innerText, height: r.height, inside: r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5 && r.left >= b.left && r.right <= b.right }; }));
        for (const b of buttons) assert.ok(b.height >= 44 && b.inside, `${label}: ${b.label} is reachable and at least 44px tall ${JSON.stringify(b)}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no sideways scroll`);
        // It does not move with the page: the top, the middle and the very end of the page see it in exactly the same place.
        for (const y of [0.5, 1]) {
          await page.evaluate(fraction => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction), y);
          const moved = await rects(page);
          assert.ok(moved.scrollY > 0, `${label}: the page did scroll`);
          assert.ok(Math.abs(moved.bar.top - bar.top) < 1 && Math.abs(moved.bar.bottom - bar.bottom) < 1, `${label}: it stayed put at scroll ${moved.scrollY} (${moved.bar.top} vs ${bar.top})`);
        }
        // The end of the page can be scrolled clear of it, and the tab bar does not move.
        const room = await page.evaluate(() => ({ padding: parseFloat(getComputedStyle(document.querySelector('.app-shell .content')).paddingBottom), bar: document.querySelector('#syncChoiceBar').offsetHeight, published: getComputedStyle(document.documentElement).getPropertyValue('--sync-choice-height').trim() }));
        assert.ok(room.padding >= 118 + room.bar, `${label}: room under the page for the bar (${room.padding}px for a ${room.bar}px bar)`);
        assert.equal(room.published, `${room.bar}px`, `${label}: the layout knows how tall the bar is`);
        if (width === 390) await screenshot(page, 'bar-scrolled-390');
        // A toast and the assistant button sit above the bar instead of under it.
        await page.evaluate(() => scrollTo(0, 0)); await addTicker(page, 'synt'); await page.waitForSelector('#toastRoot .toast');
        const lifted = await rects(page);
        assert.ok(lifted.toast, `${label}: a toast showed`);
        assert.ok(!overlaps(lifted.toast, lifted.bar) && lifted.toast.bottom <= lifted.bar.top + 1, `${label}: the toast is above the bar ${JSON.stringify([lifted.toast, lifted.bar])}`);
        if (lifted.orb) assert.ok(!overlaps(lifted.orb, lifted.bar) && lifted.orb.bottom <= lifted.bar.top + 1, `${label}: the assistant button is above the bar ${JSON.stringify([lifted.orb, lifted.bar])}`);
        else assert.fail(`${label}: the assistant button was not found, so it was not checked`);
        await screenshot(page, `bar-with-toast-${width}`);
        // Later keeps it pinned as a slim strip, and everything around it follows.
        await page.evaluate(() => { document.querySelector('#toastRoot').innerHTML = ''; });
        await page.$eval('#syncChoiceBar [data-action="minimize-sync-choice"]', el => el.click()); await page.waitForSelector('#syncChoiceBar.is-collapsed');
        const strip = await rects(page);
        assert.ok(strip.bar.height < 75 && strip.bar.bottom <= strip.dock.top - 4 && strip.bar.bottom >= strip.dock.top - 40, `${label}: a slim strip right above the tab bar ${JSON.stringify(strip.bar)}`);
        assert.equal(await page.evaluate(() => document.querySelector('#syncChoiceBar').offsetHeight + 'px' === getComputedStyle(document.documentElement).getPropertyValue('--sync-choice-height').trim()), true, `${label}: the layout follows the strip`);
        if (strip.orb) assert.ok(strip.orb.bottom <= strip.bar.top + 1, `${label}: the assistant button follows the strip down`);
        await screenshot(page, `bar-strip-${width}`);
        // The page stays usable with the question waiting: the tab bar still navigates and the bar goes along to the new page.
        await nav(page, 'Overview'); assert.ok(await page.$('#syncChoiceBar'), `${label}: still there on the Home page`); await nav(page, 'Transactions'); assert.ok(await page.$('#syncChoiceBar'), `${label}: and on Transactions`);
        assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), false);
        await page.close();
      }
    });

    await check('a change made while the question waits cancels a stale answer, and the bar asks again', async () => {
      const page = await newPage(); await nav(page, 'Stocks');
      await signIn(page, { cloud: differentCloudCopy() }); await page.waitForSelector('#syncChoiceBar');
      // The visitor changes a value on this device (no record is added or removed, so the counts in the question stay the same).
      await nav(page, 'Settings');
      await page.$eval('#currencySelect', el => { el.value = 'EUR'; el.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForFunction(() => window.NorthstarLedger().settings.currency === 'EUR');
      const before = await text(page, '#syncChoiceBar');
      await pick(page, 'cloud');
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.match(await toastText(page), /^That question changed since you looked, so nothing was applied\./);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:alice')).settings.currency), 'EUR', 'the edit on this device was not thrown away by a stale answer');
      assert.equal(await page.evaluate(() => window.NorthstarLedger().transactions.length), 1, 'the device copy was not replaced');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'nothing was uploaded');
      await page.waitForSelector('#syncChoiceBar'); assert.equal(await text(page, '#syncChoiceBar'), before, 'the same question is asked again for the visitor to confirm');
      // Answering the question as it stands now works.
      await pick(page, 'cloud');
      await page.waitForFunction(() => document.querySelector('#syncStatus')?.innerText === 'Cloud sync on' && !document.querySelector('.app-shell').inert);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().transactions.length), 3);
      assert.equal(await page.$('#syncChoiceBar'), null);
      await page.close();
    });

    await check('an answer given on the bar is not applied if the cloud copy changed since you looked, even when no count changed', async () => {
      const page = await newPage(); await nav(page, 'Settings');
      await signIn(page, { cloud: differentCloudCopy() }); await page.waitForSelector('#syncChoiceBar');
      // Another device saves in the meantime: the account now holds 4 transactions.
      await page.evaluate(() => { const extra = { id: 'cloud-tx-4', type: 'Expense', amount: 40, date: '2026-02-04', accountId: 'cloud-a', category: 'Food', description: 'Cloud payee 4' }; window.__mockCloud = { ...window.__mockCloud, data: { ...window.__mockCloud.data, transactions: [...window.__mockCloud.data.transactions, extra] }, updatedAt: Date.UTC(2026, 10, 16, 8, 30) }; });
      await pick(page, 'cloud');
      await page.waitForFunction(() => /Your Google account has 4 transactions/.test(document.querySelector('#syncChoiceBar')?.innerText || ''));
      assert.match(await toastText(page), /^That question changed since you looked, so nothing was applied\./);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:local')).transactions.length), 1, 'the device copy is untouched');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'nothing was uploaded');
      assert.equal(await page.$eval('#confirmRoot', el => el.innerHTML), '', 'it did not turn into a pop-up');
      // Neither the counts nor the saved time show everything: an amount in the account's copy is edited without a new save time (another client, or the Firebase console), and the number of records stays the same.
      await page.evaluate(() => { document.querySelector('#toastRoot').innerHTML = ''; });
      const askedAgain = await text(page, '#syncChoiceBar');
      await page.evaluate(() => { const data = window.__mockCloud.data; window.__mockCloud = { ...window.__mockCloud, data: { ...data, transactions: data.transactions.map((tx, i) => (i === 0 ? { ...tx, amount: tx.amount + 1 } : tx)) } }; });
      await pick(page, 'cloud');
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert && /^.?\s*That question changed since you looked, so nothing was applied\./.test(document.querySelector('#toastRoot .toast')?.innerText.trim() || ''));
      assert.equal(await page.evaluate(() => window.NorthstarLedger().transactions.length), 1, 'an edit that changes no count still cancels the answer: the device copy was not replaced');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'and nothing was uploaded');
      await page.waitForSelector('#syncChoiceBar');
      assert.equal(await text(page, '#syncChoiceBar'), askedAgain, 'the question reads the same, and is asked again for the visitor to confirm');
      await page.close();
    });

    await check('signing out takes the question away and gives its room back, and signing in again asks it afresh', async () => {
      const page = await newPage({ width: 390, height: 844, mobile: true }); await nav(page, 'Stocks');
      await signIn(page, { cloud: differentCloudCopy() }); await page.waitForSelector('#syncChoiceBar');
      assert.equal(await page.evaluate(() => document.body.classList.contains('has-sync-choice-bar')), true);
      await page.evaluate(() => { window.__mockCurrentUser = null; void window.__authCallback(null); });
      await page.waitForFunction(() => !document.querySelector('#syncChoiceBar') && !document.body.classList.contains('has-sync-choice-bar'));
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sync-choice-height').trim()), '', 'the page gets its room back');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0, 'signing out uploads nothing');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-finance-v1:local')).transactions.length), 1, 'the device copy is untouched');
      await signIn(page, { cloud: differentCloudCopy() }); await page.waitForSelector('#syncChoiceBar:not(.is-collapsed)');
      assert.match(await text(page, '#syncChoiceBar'), /The two copies differ\./, 'the same sign-in asks the same question again, open');
      assert.equal(await page.evaluate(() => window.__cloudWrites?.length || 0), 0);
      await page.close();
    });

    await check('dialogs paint from their first frame, with no blur or entry animation of their own, and the bar has nothing that could fail to paint', async () => {
      const page = await newPage(); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      await nav(page, 'Stocks');
      // iPhone Safari painted the dimmed page but not a dialog, which had a blur of its own nested in the backdrop's and an entry animation that starts at opacity 0.
      const inspect = () => page.evaluate(() => {
        const dialog = document.querySelector('#confirmRoot .confirm-dialog'), backdrop = document.querySelector('#confirmRoot .confirm-backdrop');
        const own = getComputedStyle(dialog), around = getComputedStyle(backdrop);
        return { opacity: own.opacity, animation: own.animationName, blur: own.backdropFilter, running: dialog.getAnimations().length, backdropBlur: around.backdropFilter };
      });
      await page.$eval('[data-action="stock-reset"]', el => el.click()); await page.waitForSelector('#confirmRoot .confirm-dialog');
      const ordinary = await inspect();
      assert.deepEqual({ opacity: ordinary.opacity, animation: ordinary.animation, blur: ordinary.blur, running: ordinary.running }, { opacity: '1', animation: 'none', blur: 'none', running: 0 }, JSON.stringify(ordinary));
      assert.match(ordinary.backdropBlur, /blur\(10px\)/, 'the glass look of the backdrop is kept');
      await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#confirmRoot .confirm-dialog'));
      await signIn(page, { cloud: differentCloudCopy() }); await page.waitForSelector('#syncChoiceBar');
      const own = await page.$eval('#syncChoiceBar', el => { const s = getComputedStyle(el); return { position: s.position, blur: s.backdropFilter, animation: s.animationName, transition: s.transitionProperty, transform: s.transform, opacity: s.opacity, background: s.backgroundColor, running: el.getAnimations().length }; });
      assert.deepEqual(own, { position: 'fixed', blur: 'none', animation: 'none', transition: 'all', transform: 'none', opacity: '1', background: 'rgb(255, 255, 255)', running: 0 }, 'a plain, opaque, fixed box');
      await page.close();
    });

    await check('the paused save line and its link fit narrow phones, tablet, and desktop with accessible targets', async () => {
      for (const [width, height, mobile] of [[320, 568, true], [390, 844, true], [768, 1024, true], [1440, 900, false]]) {
        const page = await newPage({ width, height, mobile }); await nav(page, 'Stocks');
        await page.evaluate(() => { window.__mockReadError = 'permission-denied'; });
        await signIn(page); await waitForSaveTone(page, 'warn');
        const layout = await page.evaluate(() => {
          const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
          const status = document.querySelector('#stockSaveStatus'), top = document.querySelector('.stock-list-top');
          return { documentWidth: document.documentElement.scrollWidth, status: box(status), top: box(top),
            link: box(document.querySelector('.stock-save-link[data-action="page"]')), text: box(document.querySelector('.stock-save-text')),
            clipped: status.scrollWidth > status.clientWidth + 1 };
        });
        assert.ok(layout.documentWidth <= width + 1, `${width}: horizontal overflow ${JSON.stringify(layout)}`);
        for (const [name, r] of Object.entries({ status: layout.status, link: layout.link, text: layout.text })) assert.ok(r.left >= -1 && r.right <= width + 1, `${width}: ${name} outside viewport ${JSON.stringify(r)}`);
        assert.ok(layout.status.right <= layout.top.right + 1, `${width}: status wider than its panel ${JSON.stringify(layout)}`);
        assert.equal(layout.clipped, false, `${width}: status text is clipped`);
        assert.ok(layout.link.width >= 44 && layout.link.height >= 44, `${width}: small target ${JSON.stringify(layout.link)}`);
        await page.evaluate(() => { document.querySelector('#toastRoot').innerHTML = ''; }); // the failure toast would cover the link in a screenshot
        await page.$eval('#stockSaveStatus', el => el.scrollIntoView({ block: 'center' }));
        await screenshot(page, `stocks-save-paused-${width}`); await page.close();
      }
    });

    await check('the save line passes scoped automated WCAG checks in its neutral, confirmed, and paused states', async () => {
      const page = await newPage({ width: 1000, height: 800, mobile: false }); await nav(page, 'Stocks');
      await page.addScriptTag({ path: axePath });
      const audit = () => page.evaluate(async () => {
        const result = await window.axe.run(document.querySelector('.stock-list-top'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return { tone: document.querySelector('#stockSaveStatus').dataset.tone, violations: result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })) };
      });
      const seen = [await audit()];
      await signIn(page); await waitForSaveTone(page, 'neutral'); await addTicker(page, 'synt');
      await page.waitForFunction(() => document.querySelector('#stockSaveStatus')?.dataset.tone === 'ok'); seen.push(await audit());
      await page.evaluate(() => { window.__mockWriteError = 'unavailable'; });
      await page.$eval('[data-action="stock-remove"][data-symbol="SYNT"]', el => el.click()); await waitForSaveTone(page, 'warn'); seen.push(await audit());
      assert.deepEqual(seen.map(item => item.tone), ['neutral', 'ok', 'warn']);
      for (const item of seen) assert.deepEqual(item.violations, [], `${item.tone}: ${JSON.stringify(item.violations, null, 2)}`);
      await page.close();
    });

    await check('the question bar, the notice, the save line and the Settings panel pass scoped automated WCAG checks while sync waits for a choice', async () => {
      const page = await newPage({ width: 1000, height: 800, mobile: false }); await nav(page, 'Stocks');
      await page.addScriptTag({ path: axePath });
      const audit = (selector) => page.evaluate(async selector => {
        const result = await window.axe.run(document.querySelector(selector), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return { selector, violations: result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })) };
      }, selector);
      await signIn(page, { cloud: differentCloudCopy() }); await page.waitForSelector('#syncChoiceBar'); await waitForSaveTone(page, 'warn');
      const seen = [await audit('#syncChoiceBar')];
      await page.$eval('#syncChoiceBar [data-action="minimize-sync-choice"]', el => el.click()); await page.waitForSelector('#syncChoiceBar.is-collapsed');
      seen.push(await audit('#syncChoiceBar'));
      await page.$eval('#syncChoiceBar [data-action="expand-sync-choice"]', el => el.click()); await page.waitForSelector('#syncChoiceBar:not(.is-collapsed)');
      seen.push(await audit('.stock-list-top'), await audit('#syncIssueRoot'));
      await nav(page, 'Settings'); seen.push(await audit('#syncDiagnosticsPanel'));
      for (const item of seen) assert.deepEqual(item.violations, [], `${item.selector}: ${JSON.stringify(item.violations, null, 2)}`);
      assert.deepEqual(seen.map(item => item.selector), ['#syncChoiceBar', '#syncChoiceBar', '.stock-list-top', '#syncIssueRoot', '#syncDiagnosticsPanel']);
      await page.close();
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
