/*
 * Optional browser regression checks, separate from the dependency-free Node suite.
 * Install puppeteer-core outside the repo, set NODE_PATH and CHROMIUM_PATH, then run:
 *   node tests/welcome-browser.cjs
 * CHROMIUM_FLAGS may contain extra space-separated flags for a serverless binary.
 * External requests are blocked or mocked; this is not a physical iPhone or live Firebase test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const welcomeKey = 'northstar-welcome-seen-v1';
const vaultMarker = 'northstar-vault-active-v1';
const vaultUid = 'browser-test-only';
const passphrase = 'synthetic-browser-test-passphrase';
const sampleLedger = {
  version: 1,
  accounts: [{ id: 'test-account', name: 'Synthetic checking', type: 'Checking', balance: 123.45 }],
  transactions: [], budgets: [], goals: [], purchases: [], settings: { currency: 'USD' },
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><title>Test setup</title>');
  }
  if (pathname === '/personal-finance/' || pathname === '/personal-finance/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(root, 'index.html')));
  }
  const filename = pathname.replace('/personal-finance/', '');
  if (pathname.startsWith('/personal-finance/') && ['vault-crypto.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css'].includes(filename)) {
    res.writeHead(200, { 'Content-Type': filename.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(root, filename)));
  }
  res.writeHead(404); res.end('Not found');
});

const firebaseModules = {
  'firebase-app.js': `export function getApps(){return []} export function initializeApp(){return {}}`,
  'firebase-auth.js': `
    export function getAuth(){return {currentUser:{uid:'mock-user',displayName:'Synthetic User'}}}
    export function onAuthStateChanged(auth,callback){setTimeout(()=>callback(auth.currentUser),0)}
    export class GoogleAuthProvider{}
  `,
  'firebase-firestore.js': `
    export function getFirestore(){return {}}
    export function doc(){return {}}
    export function getDocFromServer(){return new Promise((resolve,reject)=>{window.__resolveMockCloud=resolve;window.__rejectMockCloud=reject})}
    export function runTransaction(){window.__cloudWrites=(window.__cloudWrites||0)+1;throw new Error('Unexpected cloud write')}
  `,
};

(async () => {
  if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean)],
  });
  const failures = [];
  let count = 0;

  async function newPage({ width = 390, height = 844, mobile = true, mockFirebase = false } = {}) {
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    page.on('pageerror', error => failures.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return void request.continue();
      const name = Object.keys(firebaseModules).find(key => url.endsWith('/' + key));
      if (mockFirebase && name) return void request.respond({
        status: 200, contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: firebaseModules[name],
      });
      return void request.abort();
    });
    await page.goto(base + '/blank', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    return page;
  }
  async function load(page) {
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.NorthstarLedger === 'function');
    await delay(220); // includes the initial focus timer
  }
  async function visibleButton(page) {
    return page.evaluate(() => {
      const button = document.getElementById('welcomeEnter');
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
        hit: button === hit || button.contains(hit), active: document.activeElement === button,
        scroll: document.getElementById('welcomeScroll').scrollTop,
        screenHidden: document.getElementById('welcomeScreen').classList.contains('hidden') };
    });
  }
  async function tapEntry(page) {
    const r = await visibleButton(page);
    assert.ok(r.hit, 'the direct entry must receive a real pointer hit');
    await page.touchscreen.tap((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden'));
  }
  async function swipe(page, direction = 'up', selector = '#welcomeScroll') {
    const rect = selector ? await page.$eval(selector, el => {
      const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height };
    }) : { left: 0, top: 0, width: page.viewport().width, height: page.viewport().height };
    const x = Math.round(rect.left + rect.width / 2);
    const start = Math.round(rect.top + rect.height * (direction === 'up' ? 0.82 : 0.24));
    const end = Math.round(rect.top + rect.height * (direction === 'up' ? 0.24 : 0.82));
    const client = await page.createCDPSession();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
    for (let i = 1; i <= 8; i++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(start + (end - start) * i / 8) }] });
      await delay(18);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(250);
    await client.detach();
  }
  async function tapSelector(page, selector) {
    const box = await page.$eval(selector, el => {
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(box.x, box.y);
  }
  async function openSettings(page) {
    await page.tap('#dockMoreBtn');
    await page.waitForFunction(() => !document.getElementById('dockMoreMenu').hidden);
    await page.tap('#dockMoreMenu [data-action="page"][data-page="Settings"]');
    await page.waitForSelector('[data-action="welcome-again"]');
  }
  async function check(name, fn) {
    if (process.env.WELCOME_QA_ONLY && !name.toLowerCase().includes(process.env.WELCOME_QA_ONLY.toLowerCase())) return;
    try { await fn(); console.log('PASS', name); count++; }
    catch (error) { console.error('FAIL', name); throw error; }
  }

  try {
    await check('garage entry opens over the real dashboard and never rewrites finance records', async () => {
      for (const [width, height, mobile] of [[320, 240, true], [390, 844, true], [1440, 900, false]]) {
        const page = await newPage({ width, height, mobile });
        const original = await page.evaluate(ledger => {
          const raw = JSON.stringify(ledger); localStorage.setItem('northstar-finance-v1:local', raw); return raw;
        }, sampleLedger);
        await load(page);
        const before = await page.evaluate(() => JSON.stringify(window.NorthstarLedger()));
        assert.equal(await page.$eval('.ns-garage', el => getComputedStyle(el).display), 'none', 'the shutter does not play before entry');
        if (mobile) await page.tap('#welcomeEnter'); else await page.click('#welcomeEnter');
        await page.waitForFunction(() => document.querySelector('.ns-garage-door').getAnimations().some(a => a.animationName === 'nsGarageLift'));
        const active = await page.evaluate(() => document.activeElement.id);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), active, 'focus stays put until the shutter finishes');
        const frame = await page.evaluate(() => {
          const door = document.querySelector('.ns-garage-door'), animation = door.getAnimations().find(a => a.animationName === 'nsGarageLift');
          animation.pause(); animation.currentTime = 0; const closed = door.getBoundingClientRect().bottom;
          animation.currentTime = 625; const lifting = door.getBoundingClientRect().bottom;
          const hit = document.elementFromPoint(innerWidth / 2, innerHeight - 10);
          const blocksClicks = document.getElementById('welcomeScreen').contains(hit);
          animation.currentTime = 1240; const opened = door.getBoundingClientRect().bottom;
          animation.play();
          return { closed, lifting, opened, height: innerHeight, blocksClicks, inert: document.querySelector('.app-shell').inert,
            decorative: document.querySelector('.ns-garage').getAttribute('aria-hidden') };
        });
        assert.ok(frame.closed >= height - 1, `${width}: shutter starts closed`);
        assert.ok(frame.lifting < frame.closed - height * .1, `${width}: shutter lifts to reveal the app`);
        assert.ok(frame.opened < height * .05, `${width}: shutter finishes offscreen`);
        assert.equal(frame.inert, true); assert.equal(frame.decorative, 'true');
        assert.equal(frame.blocksClicks, true, 'revealed controls cannot be tapped before the transition finishes');
        await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden'));
        assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
        assert.equal(await page.evaluate(() => JSON.stringify(window.NorthstarLedger())), before);
        assert.equal(await page.evaluate(() => localStorage.getItem('northstar-finance-v1:local')), original);
        await page.close();
      }
    });

    await check('garage entry immediately finishes if reduced motion is enabled mid-reveal', async () => {
      const page = await newPage(); await load(page);
      await page.tap('#welcomeEnter');
      await page.waitForFunction(() => document.querySelector('.ns-garage-door').getAnimations().some(a => a.animationName === 'nsGarageLift'));
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden'), { timeout: 1000 });
      assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
      await page.close();
    });

    await check('entry is visible without scrolling at phone, short, landscape, tablet, and desktop sizes', async () => {
      for (const [width, height, mobile] of [[320, 240, true], [320, 568, true], [390, 844, true], [667, 375, true], [844, 390, true], [768, 1024, true], [1440, 900, false]]) {
        const page = await newPage({ width, height, mobile });
        await load(page);
        const state = await visibleButton(page);
        assert.equal(state.scroll, 0, `${width}x${height} starts at top`);
        assert.equal(state.active, true, `${width}x${height} focuses direct entry`);
        assert.ok(state.hit && state.left >= 0 && state.top >= 0 && state.right <= width && state.bottom <= height, `${width}x${height} entry is entirely visible and tappable`);
        assert.ok(state.width >= 44 && state.height >= 44, `${width}x${height} touch target`);
        const background = await page.evaluate(() => ({ shell: document.querySelector('.app-shell').inert, dock: document.getElementById('mobileDock').inert }));
        assert.equal(background.shell, true); assert.equal(background.dock, true);
        if (mobile) await tapEntry(page); else { await page.click('#welcomeEnter'); await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden')); }
        assert.equal(await page.evaluate(key => localStorage.getItem(key), welcomeKey), '1');
        assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), false);
        await page.close();
      }
    });

    await check('touch swipes move only the intro, retain the pinned entry, and reach the bottom action', async () => {
      for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
        const page = await newPage({ width, height }); await load(page);
        const initial = await visibleButton(page);
        await swipe(page, 'up');
        const afterUp = await visibleButton(page);
        assert.ok(afterUp.scroll > 50, `${width}x${height}: swipe up moved the scroller`);
        assert.equal(afterUp.top, initial.top); assert.equal(afterUp.hit, true);
        assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0, 'page behind intro does not move');
        await swipe(page, 'down');
        assert.ok((await visibleButton(page)).scroll < afterUp.scroll, 'swipe down moves back toward the start');
        for (let i = 0; i < 20; i++) {
          const atBottom = await page.$eval('#welcomeScroll', el => el.scrollTop >= el.scrollHeight - el.clientHeight - 2);
          if (atBottom) break;
          await swipe(page, 'up');
        }
        assert.equal(await page.$eval('#welcomeScroll', el => el.scrollTop >= el.scrollHeight - el.clientHeight - 2), true, 'bottom is reachable by swiping');
        assert.ok(parseFloat(await page.$eval('#welcomeProgressBar', el => el.style.width)) > 99);
        assert.equal((await visibleButton(page)).hit, true, 'direct entry stays available at the bottom');
        await tapSelector(page, '.welcome-final [data-action="dismiss-welcome"]');
        await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden'));
        assert.equal(await page.evaluate(key => localStorage.getItem(key), welcomeKey), '1');
        await page.close();
      }
    });

    await check('rotating a phone keeps the entry visible and the intro swipeable', async () => {
      const page = await newPage(); await load(page);
      await swipe(page, 'up');
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await delay(150);
      const before = await visibleButton(page);
      assert.ok(before.hit && before.top >= 0 && before.bottom <= 390 && before.right <= 844);
      await swipe(page, 'up');
      assert.ok((await visibleButton(page)).scroll > before.scroll);
      await tapEntry(page); await page.close();
    });

    await check('unprotected finance data stays unchanged and the main app still scrolls after entry', async () => {
      const page = await newPage();
      const ledger = { ...sampleLedger, transactions: [{ id: 'test-expense', type: 'Expense', amount: 5, category: 'Food', description: 'Synthetic lunch', date: '2026-10-10', accountId: 'test-account' }] };
      const original = JSON.stringify(ledger);
      await page.evaluate(raw => localStorage.setItem('northstar-finance-v1:local', raw), original);
      await load(page); await tapEntry(page);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().accounts[0].balance), 123.45);
      await swipe(page, 'up', null);
      assert.ok(await page.evaluate(() => document.scrollingElement.scrollTop) > 50, 'main page scrolls after dismissing the intro');
      await delay(1500); // let touch momentum settle before the next tap
      await page.tap('#mobileDock [data-page="Purchases"]');
      await page.waitForSelector('[data-action="edit-transaction"][data-id="test-expense"]');
      await delay(700); // let the navigation's scroll-to-top finish
      await page.tap('[data-action="edit-transaction"][data-id="test-expense"]');
      await page.waitForSelector('#modalForm');
      assert.equal(await page.evaluate(() => window.NorthstarLedger().transactions[0].description), 'Synthetic lunch');
      assert.equal(await page.evaluate(() => localStorage.getItem('northstar-finance-v1:local')), original, 'viewing the completed tile does not rewrite the ledger');
      await page.close();
    });

    await check('explore jumps within the intro; direct entry, reload, and Settings replay work', async () => {
      const page = await newPage(); await load(page);
      await tapSelector(page, '#welcomeContinue');
      await delay(120);
      const scrolled = await page.$eval('#welcomeScroll', el => el.scrollTop);
      assert.ok(scrolled > 400, 'Explore moves to the journey');
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0);
      await tapEntry(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.NorthstarLedger === 'function');
      assert.equal(await page.$eval('#welcomeScreen', el => getComputedStyle(el).display), 'none');
      await openSettings(page);
      await page.tap('[data-action="welcome-again"]');
      await delay(120);
      const replay = await visibleButton(page);
      assert.equal(replay.scroll, 0); assert.equal(replay.active, true); assert.equal(replay.hit, true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), welcomeKey), null);
      await tapEntry(page);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'welcome-again', 'focus returns to the replay control');
      await page.tap('[data-action="welcome-again"]');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.NorthstarLedger === 'function');
      assert.notEqual(await page.$eval('#welcomeScreen', el => getComputedStyle(el).display), 'none', 'replay stays open on reload until dismissed');
      await page.close();
    });

    await check('keyboard focus stays in the dialog and Enter/Escape work; reduced motion skips the reveal', async () => {
      const page = await newPage(); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await load(page);
      await page.keyboard.press('n');
      assert.equal(await page.$eval('#modalRoot', el => el.childElementCount), 0, 'global app shortcuts do not open behind the intro');
      await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
      assert.equal(await page.evaluate(() => document.activeElement.closest('.welcome-final') !== null), true, 'Shift+Tab wraps to the last intro button');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'welcomeEnter');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden'), { timeout: 1000 });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
      await openSettings(page);
      await page.tap('[data-action="welcome-again"]'); await delay(100);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden'), { timeout: 1000 });
      await page.close();
    });

    await check('welcome storage write failure permits entry but cannot persist dismissal', async () => {
      const page = await newPage();
      await page.evaluateOnNewDocument(key => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('blocked', 'QuotaExceededError'); return original.call(this, name, value); };
      }, welcomeKey);
      await load(page); await tapEntry(page);
      assert.match(await page.$eval('#toastRoot', el => el.textContent), /intro may return on reload/i);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), welcomeKey), null);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.NorthstarLedger === 'function');
      assert.notEqual(await page.$eval('#welcomeScreen', el => getComputedStyle(el).display), 'none');
      await page.close();
    });

    await check('an unreadable vault marker fails closed instead of bypassing protection', async () => {
      const page = await newPage();
      await page.evaluateOnNewDocument(() => { Storage.prototype.getItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
      await load(page);
      assert.equal(await page.evaluate(() => window.NorthstarVaultLocked), true);
      assert.equal(await page.evaluate(() => window.NorthstarLedger()), null);
      await page.evaluate(() => document.getElementById('welcomeEnter').click());
      assert.equal(await page.evaluate(() => window.NorthstarVaultLocked), true);
      assert.equal(await page.evaluate(() => window.NorthstarLedger()), null);
      await page.close();
    });

    await check('protected device stays locked before entry and reveals the intro only after unlock', async () => {
      for (const seen of [false, true]) {
        const page = await newPage();
        const original = await page.evaluate(async ({ uid, password, ledger, seen, welcomeKey, vaultMarker }) => {
          const { newKdf, deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
          const kdf = newKdf(), key = await deriveVaultKey(password, kdf);
          const raw = JSON.stringify(await encryptLedger(ledger, key, kdf));
          localStorage.setItem('northstar-vault-v1:' + uid, raw);
          localStorage.setItem(vaultMarker, JSON.stringify({ uid, phase: 'active' }));
          if (seen) localStorage.setItem(welcomeKey, '1');
          return raw;
        }, { uid: vaultUid, password: passphrase, ledger: sampleLedger, seen, welcomeKey, vaultMarker });
        await load(page);
        assert.equal(await page.evaluate(() => window.NorthstarVaultLocked), true);
        assert.equal(await page.evaluate(() => window.NorthstarLedger()), null);
        await page.evaluate(() => document.getElementById('welcomeEnter').click());
        assert.equal(await page.evaluate(() => window.NorthstarLedger()), null, 'welcome cannot bypass a locked vault');
        assert.equal(await page.evaluate(key => localStorage.getItem(key), welcomeKey), seen ? '1' : null);
        await page.type('#vaultUnlockPass', 'wrong passphrase'); await page.click('#vaultUnlockSubmit');
        await page.waitForFunction(() => !document.getElementById('vaultUnlockError').hidden);
        assert.equal(await page.evaluate(() => window.NorthstarVaultLocked), true);
        await page.type('#vaultUnlockPass', passphrase); await page.click('#vaultUnlockSubmit');
        await page.waitForFunction(() => !window.NorthstarVaultLocked);
        if (!seen) {
          await page.waitForFunction(() => document.activeElement.id === 'welcomeEnter');
          assert.equal((await visibleButton(page)).hit, true);
          await tapEntry(page);
        } else assert.equal(await page.$eval('#welcomeScreen', el => getComputedStyle(el).display), 'none');
        assert.equal(await page.evaluate(() => window.NorthstarLedger().accounts[0].balance), 123.45);
        assert.equal(await page.evaluate(uid => localStorage.getItem('northstar-vault-v1:' + uid), vaultUid), original, 'intro does not rewrite encrypted data');
        await page.close();
      }
    });

    await check('a stalled cloud read does not trap the intro; the app remains inert until sync fails safely', async () => {
      const page = await newPage({ mockFirebase: true });
      await page.evaluate(ledger => localStorage.setItem('northstar-finance-v1:mock-user', JSON.stringify(ledger)), sampleLedger);
      await load(page);
      await page.waitForFunction(() => typeof window.__rejectMockCloud === 'function');
      assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), true);
      await tapEntry(page);
      assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), true, 'no editing while cloud is unresolved');
      await page.evaluate(() => window.__rejectMockCloud(new Error('Synthetic offline failure')));
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().accounts[0].balance), 123.45);
      assert.equal(await page.evaluate(() => window.__cloudWrites || 0), 0);
      await page.close();
    });

    await check('encrypted cloud data arriving during the garage reveal still locks the workspace', async () => {
      const page = await newPage({ mockFirebase: true });
      const envelope = await page.evaluate(async ({ password, ledger }) => {
        const { newKdf, deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const kdf = newKdf(), key = await deriveVaultKey(password, kdf);
        return encryptLedger(ledger, key, kdf);
      }, { password: passphrase, ledger: sampleLedger });
      await load(page);
      await page.waitForFunction(() => typeof window.__resolveMockCloud === 'function');
      await page.tap('#welcomeEnter');
      await page.waitForFunction(() => document.querySelector('.ns-garage-door').getAnimations().some(a => a.animationName === 'nsGarageLift'));
      await page.evaluate(data => window.__resolveMockCloud({ exists: () => true, data: () => data }), envelope);
      await page.waitForFunction(() => window.NorthstarVaultLocked === true);
      assert.equal(await page.evaluate(() => window.NorthstarLedger()), null);
      assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), true);
      assert.equal(await page.$eval('#welcomeScreen', el => getComputedStyle(el).visibility), 'hidden');
      assert.equal(await page.evaluate(() => window.__cloudWrites || 0), 0);
      await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden'));
      assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), true, 'the timer must not unlock the app');
      await page.close();
    });

    await check('an encrypted cloud result still locks the workspace after early intro entry', async () => {
      const page = await newPage({ mockFirebase: true });
      const envelope = await page.evaluate(async ({ password, ledger }) => {
        const { newKdf, deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const kdf = newKdf(), key = await deriveVaultKey(password, kdf);
        return encryptLedger(ledger, key, kdf);
      }, { password: passphrase, ledger: sampleLedger });
      await load(page);
      await page.waitForFunction(() => typeof window.__resolveMockCloud === 'function');
      await tapEntry(page);
      await page.evaluate(data => window.__resolveMockCloud({ exists: () => true, data: () => data }), envelope);
      await page.waitForFunction(() => window.NorthstarVaultLocked === true);
      assert.equal(await page.evaluate(() => window.NorthstarLedger()), null);
      assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert), true);
      assert.equal(await page.evaluate(() => window.__cloudWrites || 0), 0);
      await page.close();
    });

    assert.deepEqual(failures, [], 'no uncaught browser errors');
    console.log(`\n${count} browser scenarios passed. External services were blocked or mocked.`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
