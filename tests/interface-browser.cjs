/*
 * Optional Chromium integration checks; no external service is contacted.
 * Install puppeteer-core outside the repo, then run with NODE_PATH and CHROMIUM_PATH.
 * CHROMIUM_FLAGS can supply extra flags for a sandboxed/serverless Chromium.
 * These are simulated browser checks, not a physical iPhone, Safari or live provider test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const key = 'northstar-finance-v1:local';
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const ledger = {
  version: 1,
  accounts: [
    { id: 'checking', name: 'Everyday Checking', type: 'Checking', balance: 1000.99, minimumBalance: 200 },
    { id: 'savings', name: 'Savings', type: 'Savings', balance: 9000.45, minimumBalance: 500 },
  ],
  transactions: [{ id: 'food', type: 'Expense', amount: 40, category: 'Food', description: 'Synthetic groceries', date: today, accountId: 'checking' }],
  budgets: [{ id: 'budget', category: 'Food', limit: 200 }],
  goals: [{ id: 'goal', name: 'Trip', target: 1000, saved: 100 }],
  purchases: [{ id: 'plan', name: 'Desk', price: 100, saved: 40, status: 'Planning', priority: 'High', date: today, category: 'Shopping', accountId: 'checking', reminderDays: [0] }],
  settings: { currency: 'USD', goalSounds: false },
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') return res.end('<!doctype html><title>Test setup</title>');
  const filename = pathname === '/personal-finance/' ? 'index.html' : pathname.replace('/personal-finance/', '');
  if (pathname.startsWith('/personal-finance/') && ['index.html', 'vault-crypto.mjs'].includes(filename)) {
    res.writeHead(200, { 'Content-Type': filename.endsWith('.mjs') ? 'application/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(root, filename)));
  }
  res.writeHead(404); res.end('Not found');
});
const firebaseModules = {
  'firebase-app.js': 'export function getApps(){return []} export function initializeApp(){return {}}',
  'firebase-auth.js': `export function getAuth(){return {currentUser:null}} export function onAuthStateChanged(auth,callback){window.__authCallback=callback;callback(null)} export class GoogleAuthProvider{}`,
  'firebase-firestore.js': `export function getFirestore(){return {}} export function doc(){return {}} export function getDocFromServer(){return new Promise((resolve,reject)=>{window.__resolveMockCloud=resolve;window.__rejectMockCloud=reject})} export function runTransaction(){throw new Error('Unexpected cloud write in test')}`,
};

(async () => {
  if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean)] });
  let count = 0;
  const failures = [];
  const noticeRequests = [];
  async function check(name, fn) {
    try { await fn(); console.log('PASS', name); count++; }
    catch (error) { console.error('FAIL', name); throw error; }
  }
  async function newPage({ width = 390, height = 844, mobile = true, reduced = false, instrument = false } = {}) {
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('pageerror', error => failures.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith(base + '/') && new URL(url).pathname.endsWith('/ai-reader-notice.js')) noticeRequests.push(url);
      if (url.startsWith(base + '/') || url.startsWith('data:')) return void request.continue();
      const name = Object.keys(firebaseModules).find(item => url.endsWith('/' + item));
      if (name) return void request.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: firebaseModules[name] });
      return void request.abort();
    });
    if (instrument) await page.evaluateOnNewDocument(() => {
      window.__animations = [];
      const original = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        window.__animations.push({ className: typeof this.className === 'string' ? this.className : '', frames, options });
        return original.call(this, frames, options);
      };
    });
    await page.goto(base + '/blank');
    await page.evaluate(({ key, ledger }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('northstar-welcome-seen-v1', '1');
      localStorage.setItem(key, JSON.stringify(ledger));
    }, { key, ledger });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.NorthstarLedger === 'function' && !!window.NorthstarJarvis && !!document.querySelector('.nsj-orb') && !!window.__authCallback);
    return page;
  }
  async function activate(page, selector) {
    if (page.viewport().hasTouch) await page.tap(selector); else await page.click(selector);
  }
  async function hit(page, selector) {
    return page.$eval(selector, el => {
      const r = el.getBoundingClientRect();
      const node = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { hit: el === node || el.contains(node), width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom, node: node && node.outerHTML.slice(0, 100) };
    });
  }
  async function navigate(page, pageName) {
    const small = page.viewport().width <= 700, secondary = ['Accounts', 'Budgets', 'Settings'].includes(pageName);
    let selector = `#mobileDock .dock-item[data-page="${pageName}"]`;
    if (small && secondary) {
      await activate(page, '#dockMoreBtn');
      await page.waitForFunction(() => !document.getElementById('dockMoreMenu').hidden);
      selector = `#dockMoreMenu [data-page="${pageName}"]`;
      await page.$eval(selector, el => el.scrollIntoView({ block: 'nearest' }));
      const target = await hit(page, selector);
      assert.equal(target.hit, true, `${page.viewport().width}x${page.viewport().height} ${pageName} menu item hit ${target.node}`);
    }
    await activate(page, selector);
    await page.waitForFunction(name => document.getElementById('content').dataset.page === name, {}, pageName);
  }
  async function openJarvis(page) {
    await activate(page, '.nsj-orb');
    await page.waitForFunction(() => document.getElementById('nsjPanel').classList.contains('open'));
    await sleep(250);
  }
  async function ask(page, text) {
    await page.click('#nsjInput');
    await page.type('#nsjInput', text);
    await page.keyboard.press('Enter');
  }
  async function discardModal(page) {
    await page.click('#modalRoot [data-action="close-modal"]');
    if (await page.$('#confirmRoot .confirm-dialog')) {
      await page.click('#confirmRoot [data-confirm-index="0"]');
    }
    await page.waitForFunction(() => !document.getElementById('modalForm'));
  }
  async function fill(page, name, value) {
    await page.$eval(`#modalForm [name="${name}"]`, (el, value) => {
      el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }
  async function submit(page) {
    await page.click('#modalForm button[type="submit"]');
    await page.waitForFunction(() => !document.getElementById('modalForm'));
  }

  try {
    await check('the inline AI-reader notice is invisible and does not gate the website', async () => {
      const page = await newPage({ reduced: true });
      const notice = await page.evaluate(() => {
        const comments = [...document.head.childNodes].filter(node => node.nodeType === Node.COMMENT_NODE && node.data.startsWith(' BEGIN NORTHSTAR AI READER ACCESS NOTICE\n'));
        return {
          count: comments.length,
          numberedLines: comments[0] ? (comments[0].data.match(/^\d{4}: /gm) || []).length : 0,
          promptVisible: document.body.innerText.includes('Please provide the access code to continue.'),
        };
      });
      assert.deepEqual(notice, { count: 1, numberedLines: 3000, promptVisible: false });
      await navigate(page, 'Accounts');
      assert.equal(await page.$eval('#content', element => element.dataset.page), 'Accounts');
      await page.close();
    });

    await check('all eight sections are reachable by touch or mouse across phone, landscape, tablet and desktop', async () => {
      for (const [width, height, mobile] of [[320, 240, true], [320, 568, true], [390, 844, true], [667, 375, true], [844, 390, true], [768, 1024, true], [1440, 900, false]]) {
        const page = await newPage({ width, height, mobile, reduced: true });
        const dock = await hit(page, '#mobileDock');
        assert.ok(dock.left >= 0 && dock.right <= width && dock.bottom <= height);
        assert.equal(await page.$('#sidebar'), null, 'the old sidebar is removed');
        const before = await page.evaluate(key => localStorage.getItem(key), key);
        const visibleButtons = await page.$$eval('#mobileDock .dock-item', els => els.filter(el => el.getClientRects().length).map(el => el.textContent.trim()));
        assert.equal(visibleButtons.length, width <= 700 ? 6 : 8, `${width} visible controls`);
        for (const name of ['Overview', 'Transactions', 'Accounts', 'Budgets', 'Goals', 'Purchases', 'Guide', 'Settings']) {
          await navigate(page, name);
          const currentSelector = width <= 700 && ['Accounts', 'Budgets', 'Settings'].includes(name) ? '#dockMoreBtn' : `#mobileDock .dock-item[data-page="${name}"]`;
          const target = await hit(page, currentSelector);
          assert.ok(target.hit && target.width >= 44 && target.height >= 44, `${width}x${height} ${name} target: ${JSON.stringify(target)}`);
          assert.equal(await page.$eval(currentSelector, el => el.getAttribute('aria-current')), 'page');
          assert.equal(await page.$eval('#dockMoreBtn', el => el.getAttribute('aria-expanded')), 'false');
          await page.waitForFunction(selector => {
            const a = document.querySelector(selector).getBoundingClientRect(), b = document.querySelector('.dock-indicator').getBoundingClientRect();
            return Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 3;
          }, { timeout: 2000 }, currentSelector);
          const positions = await page.evaluate(selector => {
            const a = document.querySelector(selector).getBoundingClientRect(), b = document.querySelector('.dock-indicator').getBoundingClientRect();
            return { delta: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2), active: a.toJSON(), indicator: b.toJSON() };
          }, currentSelector);
          assert.ok(positions.delta < 3, `${width}x${height} indicator follows ${name}: ${JSON.stringify(positions)}`);
        }
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before, 'navigation must not rewrite finance records');
        await page.close();
      }
    });

    await check('More supports keyboard, dismissal, current-page indication and resizing', async () => {
      const page = await newPage();
      await page.focus('#dockMoreBtn'); await page.keyboard.press('Enter');
      assert.equal(await page.$eval('#dockMoreMenu', el => el.hidden), false);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.page), 'Accounts');
      await page.keyboard.press('Escape');
      assert.equal(await page.$eval('#dockMoreMenu', el => el.hidden), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'dockMoreBtn');
      await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      assert.equal(await page.$eval('#content', el => el.dataset.page), 'Accounts');
      assert.equal(await page.$eval('#dockMoreBtn', el => el.getAttribute('aria-current')), 'page');
      await page.click('#dockMoreBtn');
      await page.focus('#dockMoreMenu [data-page="Budgets"]');
      await page.setViewport({ width: 1000, height: 700, isMobile: true, hasTouch: true });
      await sleep(250);
      assert.equal(await page.$eval('#dockMoreMenu', el => el.hidden), true);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.page), 'Accounts');
      await page.close();
    });

    await check('assistant controls remain visible and hittable, including a very short viewport', async () => {
      for (const [width, height, mobile] of [[320, 240, true], [320, 568, true], [390, 844, true], [844, 390, true], [1440, 900, false]]) {
        const page = await newPage({ width, height, mobile });
        await openJarvis(page);
        for (const selector of ['.nsj-head > .nsj-close', '#nsjClearChat', '#nsjGear', '#nsjInput', '#nsjSend']) {
          const target = await hit(page, selector);
          assert.ok(target.hit && target.left >= 0 && target.right <= width && target.top >= 0 && target.bottom <= height, `${width}x${height} ${selector}: ${JSON.stringify(target)}`);
        }
        await activate(page, '#nsjGear');
        assert.equal(await page.$eval('#nsjSheet', el => el.inert), false);
        await activate(page, '#nsjSheetClose');
        assert.equal(await page.$eval('#nsjSheet', el => el.inert), true);
        await activate(page, '.nsj-head > .nsj-close');
        assert.equal(await page.$eval('#nsjPanel', el => el.inert), true);
        await page.close();
      }
    });

    await check('Jarvis opens real forms above the panel, preserves data until Save, and supports shortcuts', async () => {
      const page = await newPage();
      const before = await page.evaluate(key => localStorage.getItem(key), key);
      await openJarvis(page);
      await ask(page, 'I spent $24.35 at Safeway yesterday from Everyday Checking');
      await page.waitForSelector('#modalForm');
      assert.ok((await hit(page, '#modalForm [name="amount"]')).hit, 'modal form is above the assistant');
      const draft = await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById('modalForm'))));
      assert.equal(draft.description, 'Safeway'); assert.equal(draft.amount, '24.35'); assert.equal(draft.type, 'Expense'); assert.equal(draft.accountId, 'checking');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
      assert.equal((await page.evaluate(() => window.NorthstarLedger())).transactions.length, 1);
      await discardModal(page);
      await activate(page, '[data-draft="Income"]');
      await page.waitForSelector('#modalForm');
      assert.equal(await page.$eval('#modalForm [name="type"]', el => el.value), 'Income');
      assert.equal(await page.$eval('#modalForm [name="category"]', el => el.value), 'Income', 'income category is an actual option');
      await discardModal(page);
      await activate(page, '[data-draft="Transfer"]');
      await page.waitForSelector('#modalForm');
      assert.equal(await page.$eval('#modalTxType', el => el.value), 'Transfer');
      assert.equal(await page.$eval('#transferExtra', el => el.classList.contains('hidden')), false);
      await discardModal(page);
      await activate(page, '[data-draft="Goal"]');
      await page.waitForSelector('#modalForm [name="target"]'); await discardModal(page);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
      await ask(page, 'How much did I spend this month?');
      assert.match(await page.$eval('#nsjLog', el => el.textContent), /\$40\.00 out this month/);
      await activate(page, '#nsjClearChat');
      const cleared = await page.$eval('#nsjLog', el => el.textContent);
      assert.match(cleared, /Conversation cleared/); assert.doesNotMatch(cleared, /Safeway/);
      await activate(page, '.nsj-head > .nsj-close');
      await page.click('[data-action="add-transaction"]'); await page.waitForSelector('#modalForm');
      await fill(page, 'description', 'Unsaved synthetic draft');
      await page.focus('#modalForm [data-action="close-modal"]'); await page.keyboard.press('j');
      assert.equal(await page.$eval('#nsjPanel', el => el.classList.contains('open')), false, 'shortcut cannot open over a finance dialog');
      const currentPage = await page.$eval('#content', el => el.dataset.page);
      await page.keyboard.press('a'); await page.keyboard.press('n');
      await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
      assert.equal(await page.$eval('#content', el => el.dataset.page), currentPage, 'navigation shortcuts do not change pages behind an unfinished form');
      assert.equal(await page.$eval('#modalForm [name="description"]', el => el.value), 'Unsaved synthetic draft');
      assert.equal(await page.$('#nsxPalette.open'), null, 'command palette does not open over a finance dialog');
      await discardModal(page);
      await page.click('.nsj-orb'); await page.click('[data-draft="Goal"]'); await page.waitForSelector('#modalForm');
      await sleep(250);
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('#modalRoot')), true, 'delayed assistant focus cannot steal focus from the draft');
      await discardModal(page);
      await page.close();
    });

    await check('financial progress and purchase movement are presentation-only; reduced motion skips them', async () => {
      for (const reduced of [false, true]) {
        const page = await newPage({ width: 1440, height: 900, mobile: false, reduced, instrument: true });
        await navigate(page, 'Goals'); await sleep(850); // let the page entrance settle before clicking a moving card
        await page.click('[data-action="edit-goal"][data-id="goal"]'); await fill(page, 'saved', '250'); await submit(page);
        assert.equal(await page.$eval('[data-goal-id="goal"] [role="progressbar"]', el => el.getAttribute('aria-valuenow')), '25');
        assert.match(await page.$eval('[data-goal-id="goal"] .goal-numbers', el => el.textContent), /\$250\.00/);
        await navigate(page, 'Budgets'); await sleep(850);
        await page.click('[data-action="edit-budget"][data-id="budget"]'); await fill(page, 'limit', '100'); await submit(page);
        await openJarvis(page); await page.click('[data-draft="Expense"]'); await page.waitForSelector('#modalForm');
        await fill(page, 'description', 'Synthetic lunch'); await fill(page, 'amount', '10'); await fill(page, 'category', 'Food'); await fill(page, 'accountId', 'checking'); await submit(page);
        assert.equal((await page.evaluate(() => window.NorthstarLedger())).accounts[0].balance, 990.99);
        assert.equal(await page.$eval('#toastRoot .toast', el => el.classList.contains('transaction-flow')), true);
        await page.click('.nsj-head > .nsj-close');
        await navigate(page, 'Purchases'); await sleep(500);
        await page.click('.purchase-tile[data-id="plan"]'); await page.waitForSelector('.purchase-detail-view');
        await page.click('[data-action="purchase-bought"][data-id="plan"]');
        assert.equal((await page.evaluate(() => window.NorthstarLedger())).accounts[0].balance, 890.99);
        await page.click('[data-action="back-to-purchases"]');
        await page.waitForSelector('.priority-group-purchased .purchase-tile[data-id="plan"]');
        await page.$eval('.priority-group-purchased .purchase-tile[data-id="plan"]', el => el.scrollIntoView({ block: 'center' }));
        await sleep(850); // allow the accepted compact badge press/echo to settle
        const result = await page.evaluate(() => {
          const tile = document.querySelector('.priority-group-purchased .purchase-tile[data-id="plan"]');
          const badge = tile.querySelector('.purchase-tile-badge').getBoundingClientRect();
          return { animations: window.__animations, badge: { width: badge.width, height: badge.height }, ring: !!tile.querySelector('circle.purchase-badge-ring'), cross: tile.querySelectorAll('path.purchase-badge-x').length, strike: !!tile.querySelector('.purchase-tile-strike') };
        });
        assert.ok(Math.abs(result.badge.width - result.badge.height) < 0.1 && result.badge.width < 40, `compact circular badge geometry: ${JSON.stringify(result.badge)}`);
        assert.equal(result.ring, true); assert.equal(result.cross, 2); assert.equal(result.strike, true);
        const financeAnimations = result.animations.filter(a => /progress-fill|goal-progress-marker|purchase-tile-purchased/.test(a.className));
        if (reduced) assert.equal(financeAnimations.length, 0);
        else {
          assert.ok(financeAnimations.some(a => a.className.includes('goal-progress-marker')), 'goal marker moved');
          assert.ok(financeAnimations.filter(a => a.className.includes('progress-fill')).length >= 3, 'goal and budget changes animate');
          assert.ok(financeAnimations.some(a => a.className.includes('purchase-tile-purchased')), 'completed tile moves when visible');
        }
        await page.close();
      }
    });

    await check('protected goal completion celebrates only after the encrypted device save succeeds', async () => {
      const page = await newPage({ width: 1000, height: 800, mobile: false });
      const uid = 'synthetic-protected-user', password = 'synthetic-passphrase';
      const protectedLedger = { ...ledger, goals: [
        { id: 'goal', name: 'Trip', target: 1000, saved: 100 },
        { id: 'failure-goal', name: 'Synthetic goal', target: 100, saved: 0 },
      ] };
      const original = await page.evaluate(async ({ uid, password, protectedLedger }) => {
        const { newKdf, deriveVaultKey, encryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const kdf = newKdf(), key = await deriveVaultKey(password, kdf);
        const raw = JSON.stringify(await encryptLedger(protectedLedger, key, kdf));
        localStorage.setItem('northstar-vault-v1:' + uid, raw);
        localStorage.setItem('northstar-vault-active-v1', JSON.stringify({ uid, phase: 'active' }));
        return raw;
      }, { uid, password, protectedLedger });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#vaultUnlockPass');
      await page.type('#vaultUnlockPass', password); await page.click('#vaultUnlockSubmit');
      await page.waitForFunction(() => !window.NorthstarVaultLocked);
      await navigate(page, 'Goals'); await sleep(850);
      await page.evaluate(() => {
        const realLocks = navigator.locks;
        Object.defineProperty(navigator, 'locks', { configurable: true, value: {
          request(name, callback) {
            return new Promise((resolve, reject) => {
              window.__releaseGoalWrite = () => { void realLocks.request(name, callback).then(resolve, reject); };
            });
          },
        } });
      });
      await page.click('[data-action="edit-goal"][data-id="goal"]');
      await fill(page, 'saved', '1000'); await submit(page);
      await page.waitForFunction(() => typeof window.__releaseGoalWrite === 'function');
      assert.equal(await page.$('#goalCelebrationRoot .goal-celebration'), null, 'no celebration while the save waits for the lock');
      assert.equal(await page.evaluate(uid => localStorage.getItem('northstar-vault-v1:' + uid), uid), original);
      await page.evaluate(() => window.__releaseGoalWrite());
      await page.waitForSelector('#goalCelebrationRoot .goal-celebration');
      const saved = await page.evaluate(async ({ uid, password }) => {
        const raw = localStorage.getItem('northstar-vault-v1:' + uid), envelope = JSON.parse(raw);
        const { deriveVaultKey, decryptLedger } = await import('/personal-finance/vault-crypto.mjs');
        const data = await decryptLedger(envelope, await deriveVaultKey(password, envelope.kdf));
        return { raw, saved: data.goals.find(g => g.id === 'goal').saved };
      }, { uid, password });
      assert.notEqual(saved.raw, original); assert.equal(saved.saved, 1000);

      await page.evaluate(uid => {
        delete navigator.locks;
        document.getElementById('goalCelebrationRoot').replaceChildren();
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
          if (name === 'northstar-vault-v1:' + uid) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
          return set.call(this, name, value);
        };
      }, uid);
      await page.click('[data-action="edit-goal"][data-id="failure-goal"]');
      await fill(page, 'saved', '100'); await submit(page);
      await page.waitForFunction(() => document.getElementById('syncStatus').textContent.includes('Device save needs attention'));
      assert.equal(await page.$('#goalCelebrationRoot .goal-celebration'), null, 'failed device save is not celebrated');
      assert.equal(await page.evaluate(uid => localStorage.getItem('northstar-vault-v1:' + uid), uid), saved.raw);
      await page.close();
    });

    await check('mocked provider replies can be cancelled, cannot race, and stop when the workspace changes', async () => {
      const page = await newPage({ width: 1200, height: 850, mobile: false });
      await page.evaluate(() => {
        window.__providerCalls = [];
        const realFetch = window.fetch.bind(window);
        window.fetch = function (url, options) {
          if (!String(url).startsWith('https://api.openai.com/')) return realFetch(url, options);
          return new Promise(resolve => {
            const call = { url: String(url), body: options.body, signal: options.signal, resolve };
            window.__providerCalls.push(call);
          });
        };
        window.__resolveProvider = (index, text) => window.__providerCalls[index].resolve(new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        window.NorthstarJarvis.setConn({ provider: 'openai', model: 'synthetic-model', key: 'fictional-key', enabled: true, includeTx: false });
      });
      await openJarvis(page); await ask(page, 'Give me a summary');
      await page.waitForFunction(() => window.__providerCalls.length === 1);
      assert.equal(await page.$eval('#nsjInput', el => el.disabled), true);
      assert.ok(await page.$('.nsj-typing'));
      const sent = await page.evaluate(() => JSON.parse(window.__providerCalls[0].body));
      assert.doesNotMatch(sent.messages[0].content, /Synthetic groceries/);
      assert.match(sent.messages[0].content, /Combined tracked total is not spendable cash/);
      await page.click('#nsjClearChat');
      assert.equal(await page.evaluate(() => window.__providerCalls[0].signal.aborted), true);
      await ask(page, 'Second question'); await page.waitForFunction(() => window.__providerCalls.length === 2);
      await page.evaluate(() => window.__resolveProvider(0, 'STALE FIRST REPLY'));
      await sleep(100);
      assert.equal(await page.$eval('#nsjInput', el => el.disabled), true, 'old request cannot unblock the new one');
      assert.doesNotMatch(await page.$eval('#nsjLog', el => el.textContent), /STALE FIRST/);
      await page.evaluate(() => window.__resolveProvider(1, 'Fresh provider reply'));
      await page.waitForFunction(() => document.getElementById('nsjLog').textContent.includes('Fresh provider reply'));
      assert.match(await page.$eval('#nsjLog', el => el.textContent), /Cloud · OpenAI · synthetic-model/);
      await ask(page, 'Third question'); await page.waitForFunction(() => window.__providerCalls.length === 3);
      await page.click('.nsj-head > .nsj-close');
      assert.equal(await page.evaluate(() => window.__providerCalls[2].signal.aborted), true);
      await page.evaluate(() => window.__resolveProvider(2, 'STALE CLOSED REPLY')); await sleep(100);
      await openJarvis(page);
      assert.doesNotMatch(await page.$eval('#nsjLog', el => el.textContent), /STALE CLOSED/);
      assert.match(await page.$eval('#nsjLog', el => el.textContent), /request cancelled/i);

      await page.evaluate(() => window.NorthstarJarvis.setConn({ enabled: false }));
      await page.click('#nsjGear'); await page.click('#nsjSave');
      await page.waitForFunction(() => window.__providerCalls.length === 4);
      await page.$eval('#nsjModel', el => { el.value = 'changed-model'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.equal(await page.evaluate(() => window.__providerCalls[3].signal.aborted), true);
      await page.evaluate(() => window.__resolveProvider(3, 'connected')); await sleep(100);
      assert.equal(await page.evaluate(() => window.NorthstarJarvis.conn().enabled), false, 'a stale test cannot enable the edited connection');
      assert.match(await page.$eval('#nsjConnStatus', el => el.textContent), /cancelled/i);
      await page.click('#nsjSheetClose');

      await page.evaluate(() => window.NorthstarJarvis.setConn({ enabled: true }));
      await ask(page, 'Question before account change'); await page.waitForFunction(() => window.__providerCalls.length === 5);
      await page.evaluate(() => { void window.__authCallback({ uid: 'mock-user', displayName: 'Synthetic User' }); });
      await page.waitForFunction(() => typeof window.__rejectMockCloud === 'function');
      assert.equal(await page.evaluate(() => window.__providerCalls[4].signal.aborted), true);
      assert.equal(await page.evaluate(() => window.NorthstarLedger()), null, 'no ledger is exposed while the cloud read is pending');
      assert.equal(await page.$eval('.nsj-orb', el => el.inert), true);
      assert.equal(await page.$eval('#nsjPanel', el => el.classList.contains('open')), false);
      await page.evaluate(() => window.__resolveProvider(4, 'STALE WORKSPACE REPLY')); await sleep(100);
      assert.doesNotMatch(await page.$eval('#nsjLog', el => el.textContent), /STALE WORKSPACE|Fresh provider reply/);
      await page.evaluate(() => window.__rejectMockCloud(new Error('Synthetic offline failure')));
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
      assert.equal(await page.$eval('.nsj-orb', el => el.inert), false);
      await page.close();
    });

    await check('provider errors fall back locally, redact keys, and cannot send while locked', async () => {
      const page = await newPage({ width: 1000, height: 700, mobile: false });
      await page.evaluate(() => {
        window.__providerCount = 0;
        window.fetch = async () => {
          window.__providerCount++;
          return new Response(JSON.stringify({ error: { message: 'Rejected fictional-key' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        };
        window.NorthstarJarvis.setConn({ provider: 'openai', model: 'synthetic-model', key: 'fictional-key', enabled: true });
      });
      await openJarvis(page); await ask(page, 'How much did I spend this month?');
      await page.waitForFunction(() => document.getElementById('nsjLog').textContent.includes('Local fallback'));
      const answer = await page.$eval('#nsjLog', el => el.textContent);
      assert.match(answer, /\$40\.00 out this month/);
      assert.match(answer, /OpenAI HTTP 401.*\[redacted\]/);
      assert.doesNotMatch(answer, /fictional-key/);
      const blocked = await page.evaluate(async () => {
        window.NorthstarVaultLocked = true;
        try { await window.NorthstarJarvis.callCloud('blocked'); return false; }
        catch (e) { return /unlock|loading/i.test(e.message); }
        finally { window.NorthstarVaultLocked = false; }
      });
      assert.equal(blocked, true); assert.equal(await page.evaluate(() => window.__providerCount), 1);
      await page.close();
    });

    await check('connection storage failures and conflicting key copies are disclosed and fail closed', async () => {
      const page = await newPage({ width: 1000, height: 800, mobile: false });
      const connKey = 'northstar-jarvis-conn-v1';
      await page.evaluate(() => window.NorthstarJarvis.setConn({ provider: 'openai', model: 'synthetic-model', key: 'fictional-secret', enabled: true, remember: true }));
      await openJarvis(page); await page.click('#nsjGear');
      await page.evaluate(key => {
        const remove = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function (name) {
          if (this === localStorage && name === key) throw new DOMException('Synthetic failure', 'SecurityError');
          return remove.call(this, name);
        };
      }, connKey);
      await page.click('#nsjRemember');
      assert.equal(await page.$eval('#nsjStorageWarning', el => el.hidden), false);
      assert.match(await page.$eval('#nsjStorageWarning', el => el.textContent), /older key may remain/i);
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).key, connKey), 'fictional-secret');
      assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).key, connKey), 'fictional-secret');
      await page.click('#nsjClear');
      assert.match(await page.$eval('#nsjConnStatus', el => el.textContent), /memory only/i);
      assert.equal(await page.$eval('#nsjStorageWarning', el => el.hidden), false);
      assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).key, connKey), '');
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).key, connKey), 'fictional-secret');

      // Reload restores the browser API, but the inconsistent old/new copies
      // must not silently re-enable the remembered connection.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.NorthstarJarvis && !!document.querySelector('.nsj-orb'));
      assert.equal(await page.evaluate(() => window.NorthstarJarvis.conn().enabled), false);
      await openJarvis(page); await page.click('#nsjGear');
      assert.equal(await page.$eval('#nsjStorageWarning', el => el.hidden), false);
      await page.click('#nsjClear');
      assert.equal(await page.$eval('#nsjStorageWarning', el => el.hidden), true);
      assert.match(await page.$eval('#nsjConnStatus', el => el.textContent), /Key cleared/);
      assert.equal(await page.evaluate(key => {
        return [localStorage.getItem(key), sessionStorage.getItem(key)].filter(Boolean).some(raw => JSON.parse(raw).key);
      }, connKey), false);
      await page.close();
    });

    assert.deepEqual(failures, [], 'no uncaught browser errors');
    assert.deepEqual(noticeRequests, [], 'the comment-only notice must never be fetched by the site');
    console.log(`\n${count} browser scenarios passed. Providers and Firebase were mocked; all other external requests were blocked.`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
