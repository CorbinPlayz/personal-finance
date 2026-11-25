/* Optional Chromium checks for the required login gate.
 * The Worker, Firebase and market feeds are mocked; this is not a live-data or Safari test.
 * Run: node tests/login-gate-browser.cjs   (Playwright with its bundled Chromium)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..'), ledgerKey = 'northstar-finance-v1:local';
const assets = new Set(['index.html', 'vault-crypto.mjs', 'csv-export.mjs', 'split.mjs', 'portfolio.mjs', 'recurring.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css', 'stock-watchlist.mjs', 'stock-watchlist-view.mjs', 'stock-history.mjs', 'stock-chart-view.mjs', 'jarvis-tour.mjs', 'stock-watchlist.css']);
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

const fixture = { version: 1, accounts: [{ id: 'a1', name: 'Checking', type: 'Checking', balance: 1234 }], transactions: [], budgets: [], goals: [], purchases: [], recurring: [], holdings: [], portfolioHistory: [], settings: { currency: 'USD', goalSounds: false, stockWatchlist: [] } };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = []; let passed = 0;
  async function check(name, fn) { try { await fn(); console.log('PASS', name); passed++; } catch (e) { console.error('FAIL', name); throw e; } }
  async function open({ phone = false, brokenFirebase = false, hold = false } = {}) {
    const authBody = (hold ? firebase['firebase-auth.js'].replace('};cb(null)}', '}}') : firebase['firebase-auth.js']) + ' export async function signInWithPopup(){window.__popup=(window.__popup||0)+1;return {}} export async function signInWithRedirect(){} export async function signOut(){}';
    const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return route.continue();
      const name = Object.keys(firebase).find(n => url.endsWith('/' + n));
      if (name && brokenFirebase) return route.abort();
      if (name) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: name === 'firebase-auth.js' ? authBody : firebase[name] });
      return route.abort();
    });
    await page.goto(base + '/blank');
    await page.evaluate(({ ledgerKey, data }) => { localStorage.clear(); localStorage.setItem(ledgerKey, JSON.stringify(data)); }, { ledgerKey, data: fixture });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    if (!brokenFirebase) await page.waitForFunction(() => window.__authCallback);
    return page;
  }
  const visible = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }, sel);
  const covered = page => page.evaluate(() => { const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!el?.closest('#loginGate'); });

  await check('signed out: only the login screen is visible and it covers the app', async () => {
    const p = await open();
    await p.evaluate(() => window.__authCallback(null));
    await p.waitForFunction(() => document.querySelector('#loginGate').dataset.state === 'login');
    assert.ok(await visible(p, '#loginGate')); assert.ok(await visible(p, '#loginGoogle'));
    assert.equal(await visible(p, '.app-shell'), false); assert.equal(await visible(p, '#welcomeScreen'), false);
    assert.equal(await visible(p, '.nsj-orb'), false);
    assert.ok(await covered(p), 'nothing from the app sits on top of the login screen');
    assert.doesNotMatch(await p.evaluate(() => document.body.innerText), /1,234/, 'no account data is visible');
    assert.match(await p.$eval('#loginTitle', e => e.innerText), /Sign in/);
  });
  await check('before Firebase answers it says checking, never the app', async () => {
    const p = await open({ hold: true });
    assert.equal(await p.$eval('#loginGate', e => e.dataset.state), 'checking');
    assert.ok(await visible(p, '.login-checking')); assert.equal(await visible(p, '.app-shell'), false);
  });
  await check('signing in opens the app with the person\'s data and no old welcome', async () => {
    const p = await open();
    await p.evaluate(async () => { window.__mockCloud = null; await window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
    await p.waitForFunction(() => !document.documentElement.classList.contains('northstar-gated'));
    assert.equal(await visible(p, '#loginGate'), false); assert.ok(await visible(p, '.app-shell'));
    assert.equal(await visible(p, '#welcomeScreen'), false);
    assert.match(await p.evaluate(() => document.body.innerText), /1,234/);
  });
  await check('the Continue with Google button starts sign-in', async () => {
    const p = await open();
    await p.evaluate(() => window.__authCallback(null));
    await p.waitForFunction(() => document.querySelector('#loginGate').dataset.state === 'login');
    await p.evaluate(() => { window.__popup = 0; });
    await p.locator('#loginGoogle').click();
    await p.waitForFunction(() => window.__popup === 1);
    assert.equal(await p.$eval('#loginGate', e => e.dataset.state), 'login');
  });
  await check('signing out returns to the login screen', async () => {
    const p = await open();
    await p.evaluate(async () => { window.__mockCloud = null; await window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
    await p.waitForFunction(() => !document.documentElement.classList.contains('northstar-gated'));
    await p.evaluate(() => window.__authCallback(null));
    await p.waitForFunction(() => document.querySelector('#loginGate').dataset.state === 'login');
    assert.equal(await visible(p, '.app-shell'), false); assert.ok(await covered(p));
  });
  await check('if sign-in cannot load there is a retry and no way into the app', async () => {
    const p = await open({ brokenFirebase: true });
    await p.waitForFunction(() => document.querySelector('#loginGate').dataset.state === 'error');
    assert.ok(await visible(p, '#loginRetry')); assert.equal(await visible(p, '#loginGoogle'), false);
    assert.equal(await visible(p, '.app-shell'), false);
    await p.keyboard.press('Escape'); await p.keyboard.press('Tab');
    assert.equal(await visible(p, '.app-shell'), false);
  });
  await check('phone: the login screen fits without sideways scrolling and the button is reachable', async () => {
    const p = await open({ phone: true });
    await p.evaluate(() => window.__authCallback(null));
    await p.waitForFunction(() => document.querySelector('#loginGate').dataset.state === 'login');
    const m = await p.evaluate(() => { const g = document.querySelector('#loginGate'), b = document.querySelector('#loginGoogle').getBoundingClientRect(); g.scrollLeft = 80; const moved = g.scrollLeft; return { moved, sw: g.scrollWidth, cw: g.clientWidth, left: b.left, right: b.right, vw: innerWidth }; });
    assert.equal(m.moved, 0, 'the login screen cannot be dragged sideways ' + JSON.stringify(m)); assert.ok(m.left >= 0 && m.right <= m.vw);
    assert.ok(await covered(p));
  });
  await check('no page errors', async () => { assert.deepEqual(errors, []); });
  console.log(`${passed} login gate checks passed`);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
