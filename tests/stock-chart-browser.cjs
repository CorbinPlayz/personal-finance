/* Optional Chromium checks for the Stocks tab charts (desktop mouse + iPhone-size touch).
 * The Worker, Firebase and market feeds are mocked; this is not a live-data or Safari test.
 * Run: node tests/stock-chart-browser.cjs   (Playwright with its bundled Chromium)
 * Set CHART_QA_SCREENSHOTS=/some/dir to save screenshots. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..'), ledgerKey = 'northstar-finance-v1:local';
const assets = new Set(['index.html', 'vault-crypto.mjs', 'csv-export.mjs', 'split.mjs', 'portfolio.mjs', 'recurring.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css', 'stock-watchlist.mjs', 'stock-watchlist-view.mjs', 'stock-history.mjs', 'stock-chart-view.mjs', 'jarvis-tour.mjs', 'jarvis-voice.mjs', 'jarvis-orb.mjs', 'theme-1.css', 'demo-data.mjs', 'stock-watchlist.css']);
const WORKER = 'https://northstar-finance-ai.camc-cf76.workers.dev/';
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
  `,
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') return void res.end('<!doctype html><title>Setup</title>');
  const filename = pathname === '/personal-finance/' ? 'index.html' : pathname.replace('/personal-finance/', '');
  if (!pathname.startsWith('/personal-finance/') || !assets.has(filename)) return void res.writeHead(404).end('Not found');
  res.writeHead(200, { 'Content-Type': filename.endsWith('.mjs') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(root, filename)));
});

/* Synthetic daily closes: weekdays only, from 5 years ago to yesterday. */
function history(symbol) {
  const out = [], end = new Date(); end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() - 1);
  const d = new Date(end); d.setUTCFullYear(d.getUTCFullYear() - 5);
  const base = symbol === 'MSFT' ? 200 : 100, amp = symbol === 'MSFT' ? 30 : 15;
  for (let i = 0; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; out.push([d.toISOString().slice(0, 10), Math.round((base + i * 0.06 + amp * Math.sin(i / 37)) * 100) / 100]); i++; }
  return out;
}
const holdings = [
  { id: 'h1', symbol: 'AAPL', shares: 10, buyPrice: 110, buyDate: '2024-03-01' },
  { id: 'h2', symbol: 'MSFT', shares: 2, buyPrice: 300, buyDate: '2025-06-02' },
];
const fixture = {
  version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], recurring: [], holdings, portfolioHistory: [],
  settings: { currency: 'USD', goalSounds: false, stockWatchlist: ['AAPL', 'MSFT', 'FAIL'], profile: { monthlyIncome: '', essentialBills: '', cushion: '250', payFrequency: 'monthly', payDay: '', goalFocus: '', notes: '' }, guideMemory: null },
};

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = []; let passed = 0;
  const shots = process.env.CHART_QA_SCREENSHOTS;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  async function check(name, fn) { try { await fn(); console.log('PASS', name); passed++; } catch (e) { console.error('FAIL', name); throw e; } }

  async function open({ phone, data = fixture, workerDown = false, signedOut = false }) {
    const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    page.workerCalls = [];
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return route.continue();
      if (url === WORKER) {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
        const body = JSON.parse(req.postData() || '{}'); page.workerCalls.push(body);
        const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
        if (workerDown || body.symbol === 'FAIL') return route.fulfill({ status: 422, headers: cors, body: JSON.stringify({ error: 'No price history for FAIL: Stooq has no history for FAIL; Yahoo has no history for FAIL.' }) });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ symbol: body.symbol, source: 'Stooq', points: history(body.symbol) }) });
      }
      const name = Object.keys(firebase).find(n => url.endsWith('/' + n));
      if (name) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: firebase[name] });
      return route.abort();
    });
    await page.goto(base + '/blank');
    await page.evaluate(({ ledgerKey, data }) => { localStorage.clear(); localStorage.setItem('northstar-welcome-seen-v1', '1'); ['Intro','Overview','Stocks','Goals'].forEach(k => localStorage.setItem('northstar-tour-v1:alice:' + k, '1')); localStorage.setItem(ledgerKey, JSON.stringify(data)); }, { ledgerKey, data });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.NorthstarLedger === 'function' && window.NorthstarLedger() && window.__authCallback);
    if (!signedOut) await page.evaluate(async () => { window.__mockCloud = null; await window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); window.__mockCurrentUser = { uid: 'alice', getIdToken: async () => 'test-token' }; });
    await page.evaluate(() => { document.querySelector('#mobileDock [data-page="Stocks"]').click(); });
    await page.waitForFunction(() => document.querySelector('#content')?.dataset.page === 'Stocks');
    return page;
  }
  const readout = page => page.$eval('.stk-dialog .stk-readout', el => el.innerText.replace(/\s+/g, ' ').trim());
  const viewRange = page => page.$eval('.stk-dialog .stk-readout small', el => el.innerText.replace(/\s+/g, ' ').trim());
  const span = async page => { const t = await viewRange(page); const m = /· (.+) to (.+)$/.exec(t); return (Date.parse(m[2] + ' UTC') - Date.parse(m[1] + ' UTC')) / 864e5; };
  async function waitSpan(page, ok) { for (let i = 0; i < 60; i++) { if (ok(await span(page))) return; await page.waitForTimeout(50); } }
  const plotBox = async page => (await page.locator('.stk-dialog .stk-plot').boundingBox());
  async function openChart(page, symbol = 'AAPL') {
    await page.locator(`.stock-row[data-stock-symbol="${symbol}"] .stock-open`).click();
    await page.waitForSelector('.stk-dialog .stk-svg');
  }

  /* ---------- Desktop ---------- */
  const d = await open({ phone: false });
  await check('desktop: opening the Stocks tab shows the portfolio chart with a step on each purchase date', async () => {
    try { await d.waitForSelector('#pfChartBody .stk-svg'); } catch (e) { console.error('PANEL TEXT:', await d.evaluate(() => document.querySelector("#pfChartBody")?.innerText), '| calls:', JSON.stringify(d.workerCalls), '| errors:', errors.join(' | ')); throw e; }
    const info = await d.$eval('#pfChartBody', el => {
      const path = el.querySelector('.stk-line').getAttribute('d'), pts = path.replace(/[ML]/g, ' ').trim().split(/\s+/).map(p => p.split(',').map(Number));
      let steps = 0; for (let i = 1; i < pts.length; i++) if (pts[i][0] === pts[i - 1][0] && Math.abs(pts[i][1] - pts[i - 1][1]) > 3) steps++;
      return { steps, dots: el.querySelectorAll('.stk-mark').length, dashed: !!el.querySelector('.stk-second'), read: el.querySelector('.stk-readout').innerText.replace(/\s+/g, ' '), legend: el.querySelector('.stk-legend').innerText.replace(/\s+/g, ' ') };
    });
    assert.equal(info.steps, 1, 'the first purchase starts the chart; the second one (MSFT) is a vertical step'); assert.equal(info.dots, 2, 'both purchases are marked'); assert.ok(info.dashed);
    assert.match(info.read, /^\$[\d,]+\.\d\d .*vs money in.*Latest/); assert.match(info.legend, /Portfolio value.*Money you put in.*Shares added/);
    assert.deepEqual(d.workerCalls.map(c => c.symbol).sort(), ['AAPL', 'MSFT']);
    if (shots) { await d.locator('#stockRows').scrollIntoViewIfNeeded(); await d.waitForTimeout(900); await d.screenshot({ path: path.join(shots, 'desktop-stock-list.png') }); }
    if (shots) { await d.locator('#pfChartBody').scrollIntoViewIfNeeded(); await d.waitForTimeout(900); await d.screenshot({ path: path.join(shots, 'desktop-portfolio.png') }); }
  });
  await check('desktop: the portfolio chart is read-only (wheel does nothing) but hovering reads a day', async () => {
    const before = await d.$eval('#pfChartBody .stk-line', el => el.getAttribute('d'));
    await d.locator('#pfChartBody .stk-plot').scrollIntoViewIfNeeded(); const box = await d.locator('#pfChartBody .stk-plot').boundingBox();
    await d.mouse.move(box.x + box.width * 0.6, box.y + 100); await d.mouse.wheel(0, -600);
    assert.equal(await d.$eval('#pfChartBody .stk-line', el => el.getAttribute('d')), before);
    assert.equal(await d.$eval('#pfChartBody .stk-plot', el => getComputedStyle(el).touchAction), 'pan-y', 'page can still scroll by touch');
    const read = await d.$eval('#pfChartBody .stk-readout', el => el.innerText.replace(/\s+/g, ' '));
    assert.doesNotMatch(read, /Latest/); assert.equal(await d.$eval('#pfChartBody .stk-cursor', el => el.style.visibility), 'visible');
    await d.mouse.move(5, 5); await d.waitForFunction(() => /Latest/.test(document.querySelector('#pfChartBody .stk-readout').innerText));
  });
  await check('desktop: clicking a stock opens a 5-year chart', async () => {
    await openChart(d);
    assert.match(await d.innerText('.stk-dialog-head'), /AAPL[\s\S]*past 5 years/);
    assert.match(await readout(d), /^\$[\d,.]+ .* in this view/);
    assert.equal(await d.$eval('.stk-chip.is-on', el => el.textContent), '5Y');
    assert.ok(await span(d) > 1700, 'about five years shown');
    assert.equal(await d.$$eval('.stk-dialog .stk-mark', e => e.length), 1, 'the AAPL purchase is marked');
    assert.ok(await d.locator('[data-z="reset"]').isDisabled());
    if (shots) await d.screenshot({ path: path.join(shots, 'desktop-stock-5y.png') });
  });
  await check('desktop: mouse wheel zooms in and out around the cursor', async () => {
    const box = await plotBox(d), full = await span(d);
    await d.mouse.move(box.x + box.width * 0.5, box.y + 120);
    for (let i = 0; i < 6; i++) await d.mouse.wheel(0, -250);
    await d.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'true');
    await waitSpan(d, s => s < full / 4); const zoomed = await span(d); assert.ok(zoomed < full / 4, `zoomed in (${zoomed} < ${full / 4})`);
    assert.ok(!(await d.locator('[data-z="reset"]').isDisabled()));
    if (shots) await d.screenshot({ path: path.join(shots, 'desktop-stock-zoomed.png') });
    for (let i = 0; i < 12; i++) await d.mouse.wheel(0, 300);
    await d.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'false');
  });
  await check('desktop: dragging moves along the chart when zoomed', async () => {
    await d.locator('[data-z="6M"]').click(); await d.waitForFunction(() => document.querySelector('.stk-chip.is-on')?.textContent === '6M');
    const startText = await viewRange(d), box = await plotBox(d);
    await d.mouse.move(box.x + box.width * 0.2, box.y + 120); await d.mouse.down(); await d.mouse.move(box.x + box.width * 0.7, box.y + 120, { steps: 8 }); await d.mouse.up();
    await d.waitForFunction(t => document.querySelector('.stk-dialog .stk-readout small').innerText.replace(/\s+/g, ' ').trim() !== t, startText);
    assert.equal(await d.$eval('.stk-chip.is-on', el => el.textContent).catch(() => ''), '', 'no range chip is lit once moved off the end');
  });
  await check('desktop: double-click zooms in, +/- buttons and keyboard work, Reset restores 5 years', async () => {
    await d.locator('[data-z="reset"]').click(); await d.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'false');
    const full = await span(d), box = await plotBox(d);
    await d.mouse.dblclick(box.x + box.width * 0.5, box.y + 100); await d.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'true');
    await waitSpan(d, s => s < full * 0.5); const one = await span(d); assert.ok(one < full * 0.5);
    await d.locator('[data-z="out"]').click(); await d.waitForTimeout(250);
    await d.locator('.stk-dialog .stk-plot').focus(); await d.keyboard.press('+'); await d.waitForTimeout(250); const k = await span(d);
    await d.keyboard.press('ArrowLeft'); await d.waitForTimeout(250); assert.equal(await span(d) > 0, true);
    await d.keyboard.press('Home'); await d.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'false'); assert.ok(k < full);
  });
  await check('desktop: hovering reads the price on that day; Escape closes and returns focus to the stock', async () => {
    const box = await plotBox(d); await d.mouse.move(box.x + box.width * 0.4, box.y + 100);
    assert.match(await readout(d), /^\$[\d,.]+ .* since .*[A-Z][a-z]{2} \d+, \d{4}$/);
    await d.keyboard.press('Escape'); await d.waitForSelector('.stk-dialog', { state: 'detached' });
    assert.equal(await d.evaluate(() => document.activeElement?.dataset.symbol), 'AAPL');
    assert.equal(await d.evaluate(() => document.body.style.overflow), '');
  });
  await check('desktop: tapping anywhere on a row opens its chart; the remove button does not', async () => {
    await d.locator('.stock-row[data-stock-symbol="MSFT"] .stock-quote').click(); await d.waitForSelector('.stk-dialog .stk-svg');
    assert.match(await d.innerText('.stk-dialog-head'), /MSFT/); await d.locator('.stk-close').click(); await d.waitForSelector('.stk-dialog', { state: 'detached' });
  });
  await check('desktop: a stock with no history shows the reason and a working Try again', async () => {
    await d.locator('.stock-row[data-stock-symbol="FAIL"] .stock-open').click();
    await d.waitForSelector('.stk-dialog .stk-error');
    assert.match(await d.innerText('.stk-error'), /Stooq has no history for FAIL; Yahoo has no history/);
    const before = d.workerCalls.length; await d.locator('[data-retry]').click(); await d.waitForSelector('.stk-dialog .stk-error'); assert.equal(d.workerCalls.length, before + 1, 'a failure is not cached');
    await d.keyboard.press('Escape');
  });

  /* ---------- iPhone-size, real touch input ---------- */
  const p = await open({ phone: true });
  const cdp = await p.context().newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1 })) });
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await touch('touchEnd', []); };
  await check('phone: portfolio chart fits the screen without sideways scroll', async () => {
    await p.waitForSelector('#pfChartBody .stk-svg');
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, svg: document.querySelector('#pfChartBody .stk-svg').getBoundingClientRect().width }));
    assert.ok(m.sw <= m.cw + 1, `no horizontal overflow (${m.sw} <= ${m.cw})`); assert.ok(m.svg > 250 && m.svg <= m.cw);
    await p.locator('#pfChartBody').scrollIntoViewIfNeeded(); if (shots) await p.screenshot({ path: path.join(shots, 'phone-portfolio.png') });
    if (shots) { await p.locator('#stockRows').scrollIntoViewIfNeeded(); await p.waitForTimeout(700); await p.screenshot({ path: path.join(shots, 'phone-stock-list.png') }); }
  });
  await check('phone: tapping a stock opens a bottom sheet; buttons are at least 44px', async () => {
    await p.locator('.stock-row[data-stock-symbol="AAPL"] .stock-open').tap(); await p.waitForSelector('.stk-dialog .stk-svg');
    const sizes = await p.$$eval('.stk-dialog .stk-chip, .stk-dialog .stk-btn', els => els.map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    assert.ok(sizes.every(s => s >= 43.5), 'tap targets: ' + sizes.join(','));
    const dlg = await p.$eval('.stk-dialog', e => { const r = e.getBoundingClientRect(); return { bottom: Math.round(r.bottom), w: Math.round(r.width) }; }); assert.equal(dlg.w, 390); assert.equal(dlg.bottom, 844);
    const covered = await p.evaluate(() => { const r = document.querySelector('.stk-dialog [data-z="reset"]').getBoundingClientRect(); const top = document.elementFromPoint(r.right - 6, r.top + r.height / 2); return top && !top.closest('.stk-dialog'); });
    assert.equal(covered, false, 'Jarvis button must not sit on top of the chart sheet');
    if (shots) await p.screenshot({ path: path.join(shots, 'phone-stock-5y.png') });
  });
  await check('phone: two-finger pinch zooms in (and the page itself does not zoom)', async () => {
    const box = await plotBox(p), cx = box.x + box.width / 2, cy = box.y + box.height / 2, full = await span(p);
    await touch('touchStart', [[cx - 20, cy], [cx + 20, cy]]);
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[cx - 20 - i * 12, cy], [cx + 20 + i * 12, cy]]);
    await touch('touchEnd', []);
    await p.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'true');
    await waitSpan(p, s => s < full / 3); const z = await span(p); assert.ok(z < full / 3, `pinched in (${z} < ${full / 3})`);
    assert.equal(await p.evaluate(() => window.visualViewport.scale), 1);
    if (shots) await p.screenshot({ path: path.join(shots, 'phone-stock-pinched.png') });
  });
  await check('phone: one-finger drag pans, and pinching outward zooms back out', async () => {
    const box = await plotBox(p), y = box.y + box.height / 2, before = await viewRange(p);
    await touch('touchStart', [[box.x + box.width * 0.3, y]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[box.x + box.width * 0.3 + i * 25, y]]);
    await touch('touchEnd', []);
    await p.waitForFunction(t => document.querySelector('.stk-dialog .stk-readout small').innerText.replace(/\s+/g, ' ').trim() !== t, before);
    const zoomed = await span(p), cx = box.x + box.width / 2;
    await touch('touchStart', [[cx - 80, y], [cx + 80, y]]);
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[cx - 80 + i * 6, y], [cx + 80 - i * 6, y]]);
    await touch('touchEnd', []); await p.waitForTimeout(120);
    await waitSpan(p, s => s > zoomed * 1.5); assert.ok(await span(p) > zoomed * 1.5, 'zoomed back out');
  });
  await check('phone: double-tap zooms in; tapping a day reads its price; Reset restores everything', async () => {
    await p.locator('[data-z="reset"]').tap(); await p.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'false');
    const box = await plotBox(p), x = box.x + box.width / 2, y = box.y + box.height / 2, full = await span(p);
    await Promise.all([touch('touchStart', [[x, y]]), touch('touchEnd', []), touch('touchStart', [[x, y]]), touch('touchEnd', [])]);
    await p.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'true'); await waitSpan(p, s => s < full * 0.5); assert.ok(await span(p) < full * 0.5);
    await p.waitForTimeout(700); await tap(x + 40, y);
    await p.waitForFunction(() => /since/.test(document.querySelector('.stk-dialog .stk-readout').innerText));
    await p.locator('[data-z="reset"]').tap(); await p.waitForFunction(() => document.querySelector('.stk-dialog .stk-plot').dataset.zoomed === 'false');
    await p.locator('[data-z="1M"]').tap(); await p.waitForFunction(() => document.querySelector('.stk-chip.is-on')?.textContent === '1M');
    assert.ok(await span(p) < 40);
  });
  await check('phone: the sheet closes with the close button and the page scroll is restored', async () => {
    await p.locator('.stk-close').tap(); await p.waitForSelector('.stk-dialog', { state: 'detached' });
    assert.equal(await p.evaluate(() => document.body.style.overflow), '');
  });
  const down = await open({ phone: true, workerDown: true });
  await check('phone: when history cannot load, the portfolio chart explains why and offers Try again', async () => {
    await down.waitForSelector('#pfChartBody [data-action="pf-chart-retry"]');
    assert.match(await down.innerText('#pfChartBody'), /No price history for FAIL|Stooq/);
  });
  const old = await open({ phone: false, data: { ...fixture, holdings: [{ id: 'o1', symbol: 'AAPL', shares: 12, buyPrice: 58.4, buyDate: '2019-03-11' }, { id: 'o2', symbol: 'MSFT', shares: 6, buyPrice: 142.1, buyDate: '2018-09-03' }, { id: 'o3', symbol: 'AAPL', shares: 2, buyPrice: 150, buyDate: '2024-03-01' }] } });
  await check('desktop: stocks bought more than 5 years ago still chart without an error', async () => {
    await old.waitForSelector('#pfChartBody svg'); const body = await old.innerText('#pfChartBody');
    assert.doesNotMatch(body, /error|could not|No price history|Add a purchase date/i, body);
    assert.match(await old.innerText('#pfChartBody'), /2 purchases were made before .*last 5 years/i);
    await old.evaluate(() => document.querySelector('[data-action="stock-chart"][data-symbol="AAPL"]').click());
    await old.waitForSelector('.stk-dialog .stk-plot svg'); assert.doesNotMatch(await old.innerText('.stk-dialog'), /error|could not load/i);
    await old.evaluate(() => document.querySelector('.stk-close').click());
  });
  const empty = await open({ phone: false, data: { ...fixture, holdings: [] } });
  await check('desktop: with no purchases the chart area says how to get a chart', async () => {
    assert.match(await empty.innerText('#pfChartBody'), /Add a stock you bought/);
    assert.equal(empty.workerCalls.length, 0, 'no history is fetched until it is needed');
  });
  const undated = await open({ phone: false, data: { ...fixture, holdings: [{ id: 'u', symbol: 'AAPL', shares: 1, buyPrice: 100, buyDate: '' }] } });
  await check('desktop: purchases without a date ask for a date instead of guessing', async () => {
    assert.match(await undated.innerText('#pfChartBody'), /Add a purchase date/);
  });


  await browser.close(); server.close();
  assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log(`${passed} browser checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
