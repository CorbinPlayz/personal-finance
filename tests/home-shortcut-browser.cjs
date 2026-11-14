/*
 * Thirty optional Chromium checks for the icon-only Home shortcut.
 * Install puppeteer-core outside the repo, then set NODE_PATH and CHROMIUM_PATH.
 * CHROMIUM_FLAGS may contain flags for a sandboxed/serverless Chromium.
 * All records are synthetic and external services are blocked or mocked.
 * These checks are not a physical-phone, Safari, or screen-reader audit.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const ledgerKey = 'northstar-finance-v1:local';
const ledger = {
  version: 1,
  accounts: [
    { id: 'checking', name: 'Synthetic checking', type: 'Checking', balance: 101.25 },
    { id: 'savings', name: 'Synthetic savings', type: 'Savings', balance: 300.50 },
  ],
  transactions: [{ id: 'expense', type: 'Expense', amount: 12.50, category: 'Food', description: 'Synthetic expense', date: '2026-11-04', accountId: 'checking' }],
  budgets: [{ id: 'food', category: 'Food', limit: 100 }],
  goals: [{ id: 'goal', name: 'Synthetic goal', target: 400, saved: 50 }],
  purchases: [{ id: 'plan', name: 'Synthetic plan', price: 80, saved: 20, status: 'Planning', priority: 'High', date: '2026-12-01', category: 'Shopping', accountId: 'checking' }],
  settings: { currency: 'USD', goalSounds: false },
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') return res.end('<!doctype html><title>Test setup</title>');
  const filename = pathname === '/personal-finance/' ? 'index.html' : pathname.replace('/personal-finance/', '');
  if (pathname.startsWith('/personal-finance/') && ['index.html', 'vault-crypto.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css'].includes(filename)) {
    res.writeHead(200, { 'Content-Type': filename.endsWith('.mjs') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(root, filename)));
  }
  res.writeHead(404); res.end('Not found');
});
const firebaseModules = {
  'firebase-app.js': 'export function getApps(){return []} export function initializeApp(){return {}}',
  'firebase-auth.js': `export function getAuth(){return {currentUser:null}} export function onAuthStateChanged(auth,callback){window.__authCallback=callback;callback(null)} export class GoogleAuthProvider{}`,
  'firebase-firestore.js': `export function getFirestore(){return {}} export function doc(){return {}} export function getDocFromServer(){return new Promise((resolve,reject)=>{window.__resolveMockCloud=resolve;window.__rejectMockCloud=reject})} export function runTransaction(){window.__cloudWrites=(window.__cloudWrites||0)+1;throw new Error('Unexpected cloud write in test')}`,
};

(async () => {
  if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean)] });
  const errors = [];
  let count = 0;
  async function check(name, fn) {
    try { await fn(); count++; console.log(`PASS ${String(count).padStart(2, '0')} ${name}`); }
    catch (error) { console.error(`FAIL ${name}`); throw error; }
  }
  async function newPage({ width = 390, height = 844, mobile = true, reduced = true } = {}) {
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return void request.continue();
      const name = Object.keys(firebaseModules).find(item => url.endsWith('/' + item));
      if (name) return void request.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: firebaseModules[name] });
      return void request.abort();
    });
    await page.goto(base + '/blank');
    await page.evaluate(({ ledgerKey, ledger }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('northstar-welcome-seen-v1', '1');
      localStorage.setItem(ledgerKey, JSON.stringify(ledger));
    }, { ledgerKey, ledger });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.NorthstarLedger === 'function' && !!window.__authCallback && !document.querySelector('.app-shell').inert);
    return page;
  }
  async function withPage(options, fn) {
    const page = await newPage(options);
    try { await fn(page); } finally { await page.close(); }
  }
  async function activate(page, selector) {
    if (page.viewport().hasTouch) await page.tap(selector); else await page.click(selector);
  }
  async function go(page, name) {
    const secondary = ['Accounts', 'Budgets', 'Settings'].includes(name);
    let selector = `#mobileDock .dock-item[data-page="${name}"]`;
    if (page.viewport().width <= 700 && secondary) {
      await activate(page, '#dockMoreBtn');
      await page.waitForFunction(() => !document.getElementById('dockMoreMenu').hidden);
      selector = `#dockMoreMenu [data-page="${name}"]`;
      await page.$eval(selector, el => el.scrollIntoView({ block: 'nearest' }));
    }
    await activate(page, selector);
    await page.waitForFunction(name => document.getElementById('content').dataset.page === name, {}, name);
  }
  async function assertHome(page) {
    await page.waitForFunction(() => document.getElementById('content').dataset.page === 'Overview');
    const state = await page.evaluate(() => {
      const home = document.querySelector('#mobileDock .dock-item[data-page="Overview"]');
      return { title: document.querySelector('#content h1')?.textContent, breadcrumb: document.getElementById('breadcrumbTitle').textContent,
        active: home.classList.contains('active'), current: home.getAttribute('aria-current'),
        otherCurrent: [...document.querySelectorAll('#mobileDock .dock-item[data-page]')].filter(el => el !== home && el.getAttribute('aria-current') === 'page').length };
    });
    assert.deepEqual(state, { title: 'Overview', breadcrumb: 'Overview', active: true, current: 'page', otherCurrent: 0 });
  }
  async function scrollDown(page) {
    await page.evaluate(() => window.scrollTo({ top: Math.min(500, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }));
    await page.waitForFunction(() => scrollY > 100);
    return page.evaluate(() => scrollY);
  }
  async function watchScroll(page) {
    await page.evaluate(() => {
      const original = window.scrollTo; window.__shortcutScrollCalls = [];
      window.scrollTo = function (...args) { window.__shortcutScrollCalls.push(args); return original.apply(window, args); };
    });
  }
  async function highlight(page) {
    return page.$eval('#mobileDock .dock-item[data-page="Overview"]', el => el.classList.contains('home-shortcut-highlight'));
  }

  try {
    // 1–7: every other destination, including mobile More-menu pages, returns to the same Home.
    await withPage({}, async page => {
      const before = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
      const beforeMemory = await page.evaluate(() => JSON.stringify(window.NorthstarLedger()));
      for (const name of ['Transactions', 'Accounts', 'Budgets', 'Goals', 'Purchases', 'Guide', 'Settings']) {
        await check(`touch shortcut returns from ${name}`, async () => {
          await go(page, name); await activate(page, '#homeShortcut'); await assertHome(page);
          assert.equal(await highlight(page), true);
          assert.equal(await page.evaluate(() => document.activeElement?.matches('#content h1')), true);
          assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
          assert.equal(await page.evaluate(() => JSON.stringify(window.NorthstarLedger())), beforeMemory);
        });
      }
    });

    // 8–13: independent responsive hit tests, including narrow breakpoint edges.
    const viewports = [
      ['very short phone', [[320, 240, true]]],
      ['narrow phones', [[320, 568, true], [381, 800, true]]],
      ['phone and breakpoint edges', [[390, 844, true], [430, 800, true], [431, 800, true]]],
      ['landscape phone', [[844, 390, true]]],
      ['tablet', [[768, 1024, true]]],
      ['desktop', [[1440, 900, false]]],
    ];
    for (const [label, sizes] of viewports) {
      await check(`${label}: icon target and header controls are visible and hittable`, async () => {
        for (const [width, height, mobile] of sizes) await withPage({ width, height, mobile }, async page => {
          await go(page, 'Transactions');
          const bounds = await page.evaluate(() => {
            const button = document.getElementById('homeShortcut'), word = document.querySelector('.breadcrumb-brand b');
            const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
            const r = button.getBoundingClientRect(), w = word.getBoundingClientRect();
            const hit = (x, y) => { const el = document.elementFromPoint(x, y); return el === button || button.contains(el); };
            return { button: rect(button), word: rect(word), visibleWord: getComputedStyle(word).display !== 'none' && w.right <= document.querySelector('.breadcrumb').getBoundingClientRect().right + .1,
              hits: [[r.left + 2, (r.top + r.bottom) / 2], [r.right - 2, (r.top + r.bottom) / 2], [(r.left + r.right) / 2, r.top + 2], [(r.left + r.right) / 2, r.bottom - 2], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]].map(p => hit(...p)),
              controls: ['#signInBtn', '.nsx-sound'].map(selector => { const el = document.querySelector(selector), box = el.getBoundingClientRect(), at = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2); return { ...rect(el), hit: at === el || el.contains(at) }; }) };
          });
          assert.ok(bounds.button.width >= 44 && bounds.button.height >= 44, `${width}x${height}: 44px target`);
          assert.ok(bounds.button.x >= 0 && bounds.button.y >= 0 && bounds.button.right <= width && bounds.button.bottom <= height);
          assert.ok(bounds.hits.every(Boolean), `${width}x${height}: all five icon target points must hit`);
          assert.ok(bounds.visibleWord && bounds.word.x >= bounds.button.right, `${width}x${height}: word stays visible and outside the button`);
          assert.ok(bounds.controls.every(c => c.hit && c.x >= 0 && c.right <= width && c.bottom <= height), `${width}x${height}: header controls stay on-screen`);
          await activate(page, '#homeShortcut'); await assertHome(page);
        });
      });
    }

    await check('Tab reaches a visibly focused, correctly named button in the accessibility tree', async () => withPage({ width: 1440, height: 900, mobile: false }, async page => {
      await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'homeShortcut');
      const focus = await page.$eval('#homeShortcut', el => ({ tag: el.tagName, type: el.type, label: el.getAttribute('aria-label'),
        focusVisible: el.matches(':focus-visible'), outlineStyle: getComputedStyle(el).outlineStyle, outlineWidth: getComputedStyle(el).outlineWidth,
        svgHidden: el.querySelector('svg').getAttribute('aria-hidden') }));
      assert.equal(focus.tag, 'BUTTON'); assert.equal(focus.type, 'button'); assert.equal(focus.label, 'Go to Home, Overview');
      assert.equal(focus.focusVisible, true); assert.notEqual(focus.outlineStyle, 'none'); assert.notEqual(focus.outlineWidth, '0px'); assert.equal(focus.svgHidden, 'true');
      const client = await page.createCDPSession();
      const doc = await client.send('DOM.getDocument');
      const { nodeId } = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#homeShortcut' });
      const tree = await client.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      const node = tree.nodes.find(n => n.role?.value === 'button');
      assert.ok(node && !node.ignored); assert.equal(node.name.value, 'Go to Home, Overview');
      await client.detach();
    }));

    for (const key of ['Enter', 'Space']) {
      await check(`${key} activates the shortcut and announces the new Overview heading`, async () => withPage({ width: 1440, height: 900, mobile: false }, async page => {
        await go(page, 'Transactions'); await page.focus('#homeShortcut'); await page.keyboard.press(key); await assertHome(page);
        assert.equal(await page.evaluate(() => document.activeElement?.matches('#content h1') && document.activeElement.textContent === 'Overview'), true);
      }));
    }

    await check('touching the icon on Home preserves scroll and leaves the existing content intact', async () => withPage({}, async page => {
      const before = await scrollDown(page);
      await page.evaluate(() => { window.__homeNode = document.getElementById('content').firstElementChild; });
      await watchScroll(page); await activate(page, '#homeShortcut'); await delay(150);
      assert.equal(await page.evaluate(() => scrollY), before);
      assert.equal(await page.evaluate(() => document.getElementById('content').firstElementChild === window.__homeNode), true);
      assert.deepEqual(await page.evaluate(() => window.__shortcutScrollCalls), []); assert.equal(await highlight(page), true);
      assert.equal(await page.$eval('#homeShortcut', el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'touch hover does not remain stuck');
    }));

    await check('keyboard activation on Home preserves scroll, content, and focus', async () => withPage({ width: 768, height: 700, mobile: false }, async page => {
      await page.focus('#homeShortcut'); const before = await scrollDown(page);
      await page.evaluate(() => { window.__homeNode = document.getElementById('content').firstElementChild; });
      await watchScroll(page); await page.keyboard.press('Enter'); await delay(150);
      assert.equal(await page.evaluate(() => scrollY), before); assert.equal(await page.evaluate(() => document.activeElement.id), 'homeShortcut');
      assert.equal(await page.evaluate(() => document.getElementById('content').firstElementChild === window.__homeNode), true);
      assert.deepEqual(await page.evaluate(() => window.__shortcutScrollCalls), []);
    }));

    await check('desktop clicking on Home preserves the current scroll position', async () => withPage({ width: 1440, height: 600, mobile: false }, async page => {
      const before = await scrollDown(page); await watchScroll(page); await page.click('#homeShortcut'); await delay(150);
      assert.equal(await page.evaluate(() => scrollY), before); assert.deepEqual(await page.evaluate(() => window.__shortcutScrollCalls), []);
    }));

    await check('a scrolled section returns to the top immediately with reduced motion', async () => withPage({ height: 568 }, async page => {
      await go(page, 'Transactions'); await scrollDown(page); await watchScroll(page); await activate(page, '#homeShortcut'); await assertHome(page);
      await page.waitForFunction(() => scrollY === 0);
      const calls = await page.evaluate(() => window.__shortcutScrollCalls);
      assert.ok(calls.some(args => args[0]?.top === 0 && args[0]?.behavior === 'auto'));
    }));

    await check('a scrolled section uses the existing smooth Home navigation when motion is enabled', async () => withPage({ height: 568, reduced: false }, async page => {
      await go(page, 'Transactions'); await scrollDown(page); await watchScroll(page); await activate(page, '#homeShortcut'); await assertHome(page);
      const calls = await page.evaluate(() => window.__shortcutScrollCalls);
      assert.ok(calls.some(args => args[0]?.top === 0 && args[0]?.behavior === 'smooth'));
      await page.waitForFunction(() => scrollY === 0, { timeout: 3000 });
    }));

    await check('desktop icon shows subtle hover and press feedback', async () => withPage({ width: 1440, height: 900, mobile: false, reduced: false }, async page => {
      const original = await page.$eval('#homeShortcut', el => getComputedStyle(el).backgroundColor);
      await page.hover('#homeShortcut');
      await page.waitForFunction(original => getComputedStyle(document.getElementById('homeShortcut')).backgroundColor !== original, { timeout: 3000 }, original);
      const hovered = await page.$eval('#homeShortcut', el => getComputedStyle(el).backgroundColor);
      assert.notEqual(hovered, original);
      await page.mouse.down();
      await page.waitForFunction(() => getComputedStyle(document.getElementById('homeShortcut')).transform !== 'none', { timeout: 3000 });
      assert.notEqual(await page.$eval('#homeShortcut', el => getComputedStyle(el).transform), 'none');
      await page.mouse.up();
    }));

    await check('Home dock highlight is visible, temporary, pointer-transparent, and adds no hint', async () => withPage({ width: 1440, height: 900, mobile: false, reduced: false }, async page => {
      const before = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
      await go(page, 'Transactions'); await page.click('#homeShortcut'); await assertHome(page); await delay(220);
      const pulse = await page.$eval('#mobileDock .dock-item[data-page="Overview"]', el => {
        const pseudo = getComputedStyle(el, '::after'); return { active: el.classList.contains('home-shortcut-highlight'), animation: pseudo.animationName,
          opacity: Number(pseudo.opacity), shadow: pseudo.boxShadow, pointer: pseudo.pointerEvents };
      });
      assert.equal(pulse.active, true); assert.equal(pulse.animation, 'homeShortcutHighlight'); assert.ok(pulse.opacity > .1);
      assert.notEqual(pulse.shadow, 'none'); assert.equal(pulse.pointer, 'none');
      assert.equal(await page.$('#homeShortcut[title], .home-shortcut-hint, #toastRoot .toast'), null);
      await delay(950); assert.equal(await highlight(page), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
    }));

    await check('repeated activation restarts the highlight rather than leaving an old timer in charge', async () => withPage({ width: 1440, height: 900, mobile: false, reduced: false }, async page => {
      await page.click('#homeShortcut'); await delay(450); await page.click('#homeShortcut'); await delay(650);
      assert.equal(await highlight(page), true, 'the first timer must not clear the second highlight');
      await delay(450); assert.equal(await highlight(page), false);
    }));

    await check('navigating elsewhere immediately clears an in-progress Home highlight', async () => withPage({ width: 1440, height: 900, mobile: false, reduced: false }, async page => {
      await page.click('#homeShortcut'); assert.equal(await highlight(page), true); await go(page, 'Goals');
      assert.equal(await highlight(page), false); assert.equal(await page.$eval('#mobileDock .dock-item[data-page="Goals"]', el => el.getAttribute('aria-current')), 'page');
    }));

    await check('reduced motion disables press scaling and makes even a mid-pulse change static', async () => withPage({ width: 1440, height: 900, mobile: false, reduced: false }, async page => {
      await page.click('#homeShortcut'); assert.equal(await highlight(page), true);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      const pulse = await page.$eval('#mobileDock .dock-item[data-page="Overview"]', el => ({ animation: getComputedStyle(el, '::after').animationName, opacity: getComputedStyle(el, '::after').opacity }));
      assert.equal(pulse.animation, 'none'); assert.equal(pulse.opacity, '1');
      await page.hover('#homeShortcut'); await page.mouse.down();
      assert.equal(await page.$eval('#homeShortcut', el => getComputedStyle(el).transform), 'none');
      await page.mouse.up(); await delay(1100); assert.equal(await highlight(page), false);
    }));

    await check('clicking NORTHSTAR text does not navigate, highlight, or create another control', async () => withPage({ width: 1440, height: 900, mobile: false }, async page => {
      await go(page, 'Transactions');
      const word = await page.$eval('.breadcrumb-brand b', el => ({ parentControl: !!el.closest('button,a,[role="button"],[data-action]'), tabIndex: el.tabIndex, text: el.textContent }));
      assert.deepEqual(word, { parentControl: false, tabIndex: -1, text: 'NORTHSTAR' });
      await page.click('.breadcrumb-brand b'); await delay(100);
      assert.equal(await page.$eval('#content', el => el.dataset.page), 'Transactions'); assert.equal(await highlight(page), false);
    }));

    await check('the shortcut closes More and preserves Home scroll when More was open', async () => withPage({}, async page => {
      await go(page, 'Budgets'); await activate(page, '#dockMoreBtn'); await activate(page, '#homeShortcut'); await assertHome(page);
      assert.equal(await page.$eval('#dockMoreMenu', el => el.hidden), true); assert.equal(await page.$eval('#dockMoreBtn', el => el.getAttribute('aria-expanded')), 'false');
      const before = await scrollDown(page); await activate(page, '#dockMoreBtn'); await activate(page, '#homeShortcut'); await delay(100);
      assert.equal(await page.evaluate(() => scrollY), before); assert.equal(await page.$eval('#dockMoreMenu', el => el.hidden), true);
    }));

    await check('an unfinished financial form and its discard confirmation cannot be replaced by the shortcut', async () => withPage({ width: 1440, height: 900, mobile: false }, async page => {
      await go(page, 'Transactions'); const before = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
      await page.click('[data-action="add-transaction"]'); await page.waitForSelector('#modalForm [name="description"]');
      await page.type('#modalForm [name="description"]', 'Unsaved synthetic draft');
      const blocked = await page.$eval('#homeShortcut', el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return !el.contains(hit); });
      assert.equal(blocked, true, 'the real pointer is blocked by the modal');
      await page.$eval('#homeShortcut', el => el.click());
      assert.equal(await page.$eval('#content', el => el.dataset.page), 'Transactions');
      assert.equal(await page.$eval('#modalForm [name="description"]', el => el.value), 'Unsaved synthetic draft');
      await page.click('#modalRoot [data-action="close-modal"]'); await page.waitForSelector('#confirmRoot .confirm-dialog');
      await page.$eval('#homeShortcut', el => el.click());
      assert.ok(await page.$('#confirmRoot .confirm-dialog')); assert.equal(await page.$eval('#modalForm [name="description"]', el => el.value), 'Unsaved synthetic draft');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
    }));

    await check('welcome, pending cloud sync, and a locked vault keep the background shortcut blocked', async () => withPage({}, async page => {
      const before = await page.evaluate(key => localStorage.getItem(key), ledgerKey);
      await go(page, 'Settings'); await activate(page, '[data-action="welcome-again"]');
      await page.waitForFunction(() => document.querySelector('.app-shell').inert && !document.getElementById('welcomeScreen').classList.contains('hidden'));
      await page.$eval('#homeShortcut', el => el.click());
      assert.equal(await page.$eval('#content', el => el.dataset.page), 'Settings'); assert.equal(await highlight(page), false);
      await activate(page, '#welcomeEnter'); await page.waitForFunction(() => document.getElementById('welcomeScreen').classList.contains('hidden') && !document.querySelector('.app-shell').inert);
      await go(page, 'Transactions');
      await page.evaluate(async ledger => {
        const { newKdf, deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const kdf = newKdf(), key = await deriveVaultKey('synthetic-browser-test-passphrase', kdf);
        window.__syntheticEnvelope = await encryptLedger(ledger, key, kdf);
      }, ledger);
      await page.evaluate(() => { window.__authCallback({ uid: 'mock-user', displayName: 'Synthetic User' }); });
      await page.waitForFunction(() => typeof window.__resolveMockCloud === 'function' && document.querySelector('.app-shell').inert);
      await page.$eval('#homeShortcut', el => el.click());
      assert.equal(await page.$eval('#content', el => el.dataset.page), 'Transactions'); assert.equal(await highlight(page), false);
      await page.evaluate(() => window.__resolveMockCloud({ exists: () => true, data: () => window.__syntheticEnvelope }));
      await page.waitForFunction(() => window.NorthstarVaultLocked === true);
      await page.$eval('#homeShortcut', el => el.click());
      assert.equal(await page.$eval('#content', el => el.dataset.page), 'Transactions');
      assert.equal(await page.evaluate(() => document.querySelector('.app-shell').inert && window.NorthstarLedger() === null), true);
      assert.equal(await page.evaluate(() => window.__cloudWrites || 0), 0); assert.equal(await page.evaluate(key => localStorage.getItem(key), ledgerKey), before);
    }));

    assert.equal(count, 30, 'run all thirty focused checks');
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    console.log(`\n${count} focused Home-shortcut scenarios passed. External services were blocked or mocked.`);
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
