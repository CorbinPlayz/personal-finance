/* Chromium checks for Jarvis's living orb (floating, squish, comments, goal pop-up, quiet mode).
 * The Worker, Firebase and market feeds are mocked; this is not a live-data or Safari test.
 * Run: node tests/preview-browser.cjs   (Playwright with its bundled Chromium)
 */
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
  const rel = pathname.replace('/personal-finance/test-branch/', '/personal-finance/'); const filename = rel === '/personal-finance/' ? 'index.html' : rel.replace('/personal-finance/', '');
  if (!pathname.startsWith('/personal-finance/') || !assets.has(filename)) return void res.writeHead(404).end('Not found');
  res.writeHead(200, { 'Content-Type': filename.endsWith('.mjs') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(root, filename)));
});


(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(); const errors = []; let passed = 0;
  async function check(name, fn) { try { await fn(); console.log('PASS', name); passed++; } catch (e) { console.error('FAIL', name); throw e; } }
  async function open(path) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    await page.route('**/*', route => { const url = route.request().url(); if (url.startsWith(base + '/') || url.startsWith('data:')) return route.continue(); const n = Object.keys(firebase).find(k => url.endsWith('/' + k)); if (n) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: firebase[n] }); return route.abort(); });
    await page.goto(base + '/blank');
    await page.evaluate(({ k }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify({ version: 1, accounts: [{ id: 'real', name: 'REAL ACCOUNT', type: 'Checking', balance: 99 }], transactions: [], budgets: [], goals: [], purchases: [], recurring: [], holdings: [], portfolioHistory: [], settings: { currency: 'USD', stockWatchlist: [] } })); ['Intro','Overview'].forEach(x => localStorage.setItem('northstar-tour-v1:alice:' + x, '1')); }, { k: ledgerKey });
    await page.goto(base + path, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__authCallback);
    await page.evaluate(async () => { window.__mockCloud = null; await window.__authCallback({ uid: 'alice', displayName: 'Demo' }); });
    await page.waitForFunction(() => !document.documentElement.classList.contains('northstar-gated')); await page.waitForTimeout(600);
    return page;
  }
  const orbState = page => page.evaluate(() => { const o = document.querySelector('.nsj-orb'); return { t: o.style.translate, s: o.style.scale }; });
  await check('the orb floats on its own and keeps moving', async () => {
    const p = await open('/personal-finance/test-branch/'); await p.waitForSelector('.nsj-orb');
    const seen = new Set();
    for (let i = 0; i < 6; i++) { seen.add((await orbState(p)).t); await p.waitForTimeout(450); }
    assert.ok(seen.size >= 4, 'the orb drifted: ' + [...seen].join(' | '));
    await p.close();
  });
  await check('pressing squishes it like a ball, releasing wobbles back, and tapping still opens the chat', async () => {
    const p = await open('/personal-finance/test-branch/'); await p.waitForSelector('.nsj-orb');
    const sx = async () => parseFloat((await orbState(p)).s.split(' ')[0]);
    assert.ok(Math.abs((await sx()) - 1) < 0.02, 'resting shape is round');
    await p.evaluate(() => document.querySelector('.nsj-orb').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await p.waitForTimeout(500);
    const pressed = await sx(); assert.ok(pressed > 1.12, 'squashed wide while pressed: ' + pressed);
    await p.evaluate(() => document.querySelector('.nsj-orb').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    let min = 9; for (let i = 0; i < 40; i++) { min = Math.min(min, await sx()); await p.waitForTimeout(40); }
    assert.ok(min < 0.99, 'it wobbles past round on release: ' + min);
    await p.waitForTimeout(1500); assert.ok(Math.abs((await sx()) - 1) < 0.03, 'and settles back to round');
    await p.evaluate(() => document.querySelector('.nsj-orb').click());
    await p.waitForSelector('.nsj-panel.open, .nsj-orb.open');
    await p.close();
  });
  await check('Jarvis comments on how things are going, with a Quiet button, and quiet mode silences him', async () => {
    const p = await open('/personal-finance/test-branch/'); await p.waitForSelector('.nsj-orb');
    const c = await p.evaluate(() => window.NorthstarOrb.maybeComment(new Date()));
    assert.ok(c && c.text, 'the demo ledger gives him something to say');
    await p.waitForSelector('.nsj-bubble.show');
    assert.equal(await p.$eval('.nsj-bubble-text', e => e.textContent), c.text);
    await p.evaluate(() => document.querySelector('.nsj-bubble-quiet').click());
    assert.ok(await p.evaluate(() => window.NorthstarOrb.quiet()), 'Quiet turns quiet mode on');
    assert.ok(!(await p.locator('.nsj-bubble.show').count()), 'the bubble goes away');
    await p.evaluate(() => { const o = window.NorthstarOrb; o.maybeComment(new Date(2030, 0, 1)); });
    assert.ok(!(await p.locator('.nsj-bubble.show').count()), 'no comments while quiet');
    await p.close();
  });
  await check('finishing a goal makes the orb pop up with a cheer (unless quiet); the Settings switch controls quiet mode', async () => {
    const p = await open('/personal-finance/test-branch/'); await p.waitForSelector('.nsj-orb');
    await p.evaluate(() => window.NorthstarOrb.goalDone({ name: 'Emergency fund' }));
    await p.waitForSelector('.nsj-bubble.show');
    assert.match(await p.$eval('.nsj-bubble-text', e => e.textContent), /Emergency fund is complete/);
    await p.evaluate(() => document.querySelector('.nsj-bubble-x').click());
    await p.evaluate(() => document.querySelector('[data-page="Settings"]').click()); await p.waitForSelector('#orbQuiet');
    await p.evaluate(() => { const b = document.querySelector('#orbQuiet'); b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.ok(await p.evaluate(() => window.NorthstarOrb.quiet()));
    await p.evaluate(() => window.NorthstarOrb.goalDone({ name: 'Trip' }));
    assert.ok(!(await p.locator('.nsj-bubble.show').count()), 'quiet mode keeps the goal pop-up silent');
    await p.close();
  });
  await check('no page errors', async () => { assert.deepEqual(errors, []); });
  console.log(passed + ' orb checks passed');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
