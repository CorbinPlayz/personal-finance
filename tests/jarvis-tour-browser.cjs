/* Optional Chromium checks for the Jarvis tours and sound.
 * The Worker, Firebase and market feeds are mocked; this is not a live-data or Safari test.
 * Run: node tests/jarvis-tour-browser.cjs   (Playwright with its bundled Chromium)
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
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = []; let passed = 0;
  async function check(name, fn) { try { await fn(); console.log('PASS', name); passed++; } catch (e) { console.error('FAIL', name); throw e; } }
  async function open({ phone = false, seen = [] } = {}) {
    const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
      window.__audio = { made: 0, sources: 0, oscillators: 0 };
      const Real = window.AudioContext;
      if (Real) window.AudioContext = class extends Real { constructor(...a) { super(...a); window.__audio.made++; const cs = this.createBufferSource.bind(this), co = this.createOscillator.bind(this); this.createBufferSource = () => { window.__audio.sources++; return cs(); }; this.createOscillator = () => { window.__audio.oscillators++; return co(); }; } };
    });
    await page.clock.install();
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return route.continue();
      const name = Object.keys(firebase).find(n => url.endsWith('/' + n));
      if (name) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: firebase[name] + (name === 'firebase-auth.js' ? ' export async function signInWithPopup(){return {}} export async function signOut(){}' : '') });
      return route.abort();
    });
    await page.goto(base + '/blank');
    await page.evaluate(({ ledgerKey, data, seen }) => { localStorage.clear(); localStorage.setItem(ledgerKey, JSON.stringify(data)); seen.forEach(k => localStorage.setItem('northstar-tour-v1:alice:' + k, '1')); }, { ledgerKey, data: fixture, seen });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__authCallback);
    return page;
  }
  const signIn = page => page.evaluate(async () => { window.__mockCloud = null; await window.__authCallback({ uid: 'alice', displayName: 'Synthetic user' }); });
  const inView = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }, sel);
  async function waitTour(page, title) { await page.clock.runFor(2500); await page.waitForSelector('.nstour .nstour-title'); if (title) assert.equal(await page.$eval('.nstour-title', e => e.textContent), title); }

  for (const phone of [false, true]) {
    const label = phone ? 'phone' : 'desktop';
    await check(`${label}: after sign-in the intro tour plays by itself for ~30 s, moving around the screen`, async () => {
      const p = await open({ phone });
      assert.equal(await p.locator('.nstour').count(), 0, 'no tour behind the login screen');
      await signIn(p);
      await waitTour(p, 'Welcome to Northstar');
      const texts = new Set(), spots = new Set(); let gone = 0;
      for (let i = 0; i < 40; i++) {
        if (!(await p.locator('.nstour').count())) { gone = i; break; }
        texts.add(await p.$eval('.nstour-text', e => e.textContent)); spots.add(await p.$eval('.nstour-orb', e => e.style.transform));
        assert.ok(await inView(p, '.nstour-card'), 'caption stays on screen'); assert.ok(await inView(p, '.nstour-orb'), 'Jarvis stays on screen');
        await p.clock.runFor(1000);
      }
      assert.ok(texts.size >= 5, 'at least five different explanations: ' + texts.size); assert.ok(spots.size >= 4, 'Jarvis moved to several places: ' + spots.size);
      assert.ok(gone >= 26 && gone <= 31, 'the tour lasted about 30 s, ended after ' + gone + ' s');
    });
  }
  await check('Skip ends the tour and it does not come back after a reload', async () => {
    const p = await open(); await signIn(p); await waitTour(p);
    await p.locator('.nstour-skip').click();
    assert.equal(await p.locator('.nstour').count(), 0);
    await p.reload(); await p.waitForFunction(() => window.__authCallback); await signIn(p); await p.clock.runFor(4000);
    assert.equal(await p.locator('.nstour').count(), 0);
  });
  await check('Escape skips a tour', async () => {
    const p = await open(); await signIn(p); await waitTour(p);
    await p.keyboard.press('Escape'); assert.equal(await p.locator('.nstour').count(), 0);
  });
  await check('opening a new section plays that section\'s tour once', async () => {
    const p = await open({ seen: ['Intro', 'Overview'] }); await signIn(p); await p.clock.runFor(3000);
    assert.equal(await p.locator('.nstour').count(), 0, 'seen tours do not repeat');
    await p.evaluate(() => document.querySelector('#mobileDock [data-page="Goals"]').click());
    await waitTour(p, 'Goals');
    await p.clock.runFor(31000); assert.equal(await p.locator('.nstour').count(), 0);
    await p.evaluate(() => document.querySelector('#mobileDock [data-page="Transactions"]').click());
    await waitTour(p, 'Transactions'); await p.locator('.nstour-skip').click();
    await p.evaluate(() => document.querySelector('#mobileDock [data-page="Goals"]').click()); await p.clock.runFor(3000);
    assert.equal(await p.locator('.nstour').count(), 0, 'Goals is not repeated');
  });
  await check('leaving the section mid-tour ends that tour', async () => {
    const p = await open({ seen: ['Intro', 'Overview', 'Transactions'] }); await signIn(p);
    await p.evaluate(() => document.querySelector('#mobileDock [data-page="Budgets"]').click());
    await waitTour(p, 'Budgets');
    await p.evaluate(() => document.querySelector('#mobileDock [data-page="Transactions"]').click());
    await p.clock.runFor(8000);
    assert.notEqual(await p.$eval('.nstour-title', e => e.textContent).catch(() => ''), 'Budgets');
  });
  await check('signing out hides any tour; Settings can replay one', async () => {
    const p = await open({ seen: ['Intro', 'Overview', 'Settings'] }); await signIn(p);
    await p.evaluate(() => document.querySelector('#mobileDock [data-page="Settings"], [data-page="Settings"]').click());
    await p.waitForFunction(() => document.querySelector('#content')?.dataset.page === 'Settings');
    await p.locator('[data-action="replay-tour"]').click(); await p.waitForSelector('.nstour');
    await p.evaluate(() => window.__authCallback(null)); await p.clock.runFor(1500);
    assert.equal(await p.locator('.nstour').count(), 0, 'tour is gone on the login screen');
  });
  await check('sound: audio starts on the first tap, the welcome chime plays on sign-in, and everyone starts unmuted', async () => {
    const p = await open();
    await p.evaluate(() => { window.__chimes = 0; const orig = window.NorthstarSound.welcome; window.NorthstarSound.welcome = function () { window.__chimes++; return orig.apply(this, arguments); }; });
    await p.mouse.click(200, 200);
    await p.waitForFunction(() => window.__audio.made >= 1);
    await p.clock.runFor(200);
    const a = await p.evaluate(() => ({ ...window.__audio, fx: JSON.parse(localStorage.getItem('northstar-fx-v2') || '{}') }));
    assert.ok(a.sources >= 1, 'the soft ambience started');
    await signIn(p); await p.clock.runFor(500);
    assert.equal(await p.evaluate(() => window.__chimes), 1, 'welcome chime played once');
    assert.ok((await p.evaluate(() => window.__audio.oscillators)) >= 3, 'chime notes were scheduled');
    assert.notEqual(a.fx.muted, true);
  });
  await check('no page errors', async () => { assert.deepEqual(errors, []); });
  console.log(`${passed} tour and sound checks passed`);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
