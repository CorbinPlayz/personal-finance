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
const assets = new Set(['index.html', 'vault-crypto.mjs', 'csv-export.mjs', 'split.mjs', 'portfolio.mjs', 'recurring.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css', 'stock-watchlist.mjs', 'stock-watchlist-view.mjs', 'stock-history.mjs', 'stock-chart-view.mjs', 'jarvis-tour.mjs', 'theme-1.css', 'demo-data.mjs', 'stock-watchlist.css']);
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



const SH='/tmp/claude-0/-home-claude/fec61d33-339d-5f10-8a48-83257106c815/scratchpad/shots/';
(async () => {
  const { buildDemoLedger } = await import('../demo-data.mjs');
  const fixture = buildDemoLedger(new Date());
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const tag = process.argv[2] || 'a';
  for (const [name, vp, mobile] of [['d', { width: 1366, height: 860 }, false], ['m', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => console.log('PAGEERR', e.message));
    await page.route('**/*', route => { const url = route.request().url(); if (url.startsWith(base + '/') || url.startsWith('data:')) return route.continue(); const n = Object.keys(firebase).find(k => url.endsWith('/' + k)); if (n) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: firebase[n] + (n === 'firebase-auth.js' ? ' export async function signInWithPopup(){return {}} export async function signOut(){}' : '') }); return route.abort(); });
    await page.goto(base + '/blank');
    const keys = ['Intro','Overview','Transactions','Accounts','Budgets','Goals','Purchases','Stocks','Guide','Settings'];
    await page.evaluate(({ ledgerKey, data, keys }) => { localStorage.clear(); localStorage.setItem(ledgerKey, JSON.stringify(data)); keys.forEach(k => localStorage.setItem('northstar-tour-v1:alice:' + k, '1')); }, { ledgerKey, data: fixture, keys });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__authCallback);
    await page.screenshot({ path: SH + tag + '-' + name + '-login.png' });
    await page.evaluate(async () => { window.__mockCloud = null; await window.__authCallback({ uid: 'alice', displayName: 'Demo User' }); });
    await page.waitForFunction(() => !document.documentElement.classList.contains('northstar-gated'));
    await page.waitForTimeout(1200);
    if (name === 'd') for (const pg of ['Overview','Transactions','Accounts','Budgets','Goals','Purchases','Stocks','Guide','Settings']) {
      await page.evaluate(p => { const b = document.querySelector('[data-page="' + p + '"]'); b && b.click(); }, pg);
      await page.waitForTimeout(700);
      const out = await page.evaluate(() => { const res = new Map(); document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width < 60 || r.height < 24) return; const bg = getComputedStyle(el).backgroundColor.match(/[\d.]+/g); if (!bg) return; const c = getComputedStyle(el).color.match(/[\d.]+/g).map(Number); const lum = (c[0]*299+c[1]*587+c[2]*114)/1000; if (el.children.length === 0 && el.textContent.trim() && lum < 90 && !el.closest('.nstour,.login-gate')) { const k = el.tagName.toLowerCase() + '.' + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(/\s+/).filter(Boolean).slice(0,2).join('.'); res.set(k, (res.get(k)||0) + 1); } }); return [...res.entries()].map(([k,v]) => k + ' x' + v).join(' | '); });
      console.log('==', pg, out);
    }
    await ctx.close();
  }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
