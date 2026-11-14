/*
 * Optional graph integration and accessibility checks in Chromium.
 * Install puppeteer-core and axe-core outside the repository; set NODE_PATH and
 * CHROMIUM_PATH. CHROMIUM_FLAGS can supply flags for a sandboxed Chromium.
 * All records are synthetic; Firebase is mocked and other external requests are
 * blocked. This is not a physical iPhone, Safari, or live Firebase test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const axePath = require.resolve('axe-core/axe.min.js');

const root = path.join(__dirname, '..');
const key = 'northstar-finance-v1:local';
const now = new Date();
function day(offset, date = 5) {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ledger = {
  version: 1,
  accounts: [{ id: 'checking', name: 'Synthetic checking', type: 'Checking', balance: 1000.99 },
    { id: 'savings', name: 'Synthetic savings', type: 'Savings', balance: 2000 }],
  transactions: [
    { id: 'income-now', type: 'Income', amount: 1000, date: day(0, 1), accountId: 'checking', category: 'Income', description: 'Paycheck' },
    { id: 'food', type: 'Expense', amount: 100.25, date: day(0, 2), accountId: 'checking', category: 'Food', description: 'Groceries' },
    { id: 'bills', type: 'Expense', amount: 60, date: day(0, 3), accountId: 'checking', category: 'Bills', description: 'Phone bill' },
    { id: 'transfer', type: 'Transfer', amount: 75, date: day(0, 4), accountId: 'checking', toAccountId: 'savings', category: 'Other', description: 'Transfer' },
    { id: 'linked-expense', type: 'Expense', amount: 10, date: day(0, 5), accountId: 'checking', category: 'Food', description: 'Linked item', purchaseId: 'linked' },
    { id: 'prior-income', type: 'Income', amount: 400, date: day(-1, 1), accountId: 'savings', category: 'Income', description: 'Prior income' },
    { id: 'prior-expense', type: 'Expense', amount: 20, date: day(-1, 2), accountId: 'savings', category: 'Food', description: 'Prior expense' },
    { id: 'bad-date', type: 'Expense', amount: 700, date: '2026-02-31', accountId: 'checking', category: 'Broken', description: 'Invalid date' },
  ],
  budgets: [{ id: 'food-budget', category: 'Food', limit: 100 }, { id: 'bills-budget', category: 'Bills', limit: 100 }],
  goals: [{ id: 'trip', name: 'Synthetic trip', saved: 100.25, target: 1000 }, { id: 'rain', name: 'Synthetic rainy day', saved: 200, target: 2000 }],
  purchases: [
    { id: 'desk', name: 'Synthetic desk', price: 100, saved: 40, status: 'Saving', priority: 'High', category: 'Shopping', accountId: 'checking', date: day(2),
      priceHistory: [{ date: day(-2, 1), price: 120 }, { date: day(-1, 1), price: 90 }, { date: day(0, 1), price: 80 }, { date: '2026-02-31', price: 1 }] },
    { id: 'linked', name: 'Linked plan', price: 20, saved: 5, status: 'Planning', priority: 'Medium', category: 'Food', accountId: 'checking', date: day(2), transactionId: 'linked-expense' },
    { id: 'later', name: 'Postponed item', price: 80, saved: 10, status: 'Postponed', priority: 'Low', category: 'Shopping', accountId: 'checking', date: day(2) },
  ],
  settings: { currency: 'USD', goalSounds: false, profile: { monthlyIncome: '2000', essentialBills: '1200', cushion: '250' } },
};
const blank = { version: 1, accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: { currency: 'USD', goalSounds: false } };

const files = new Set(['index.html', 'vault-crypto.mjs', 'finance-graphs.mjs', 'financial-graphs-view.mjs', 'financial-graphs.css']);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') return res.end('<!doctype html><title>Test setup</title>');
  const filename = pathname === '/personal-finance/' ? 'index.html' : pathname.replace('/personal-finance/', '');
  if (!pathname.startsWith('/personal-finance/') || !files.has(filename)) return void res.writeHead(404).end('Not found');
  res.writeHead(200, { 'Content-Type': filename.endsWith('.mjs') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(root, filename)));
});
const firebase = {
  'firebase-app.js': 'export function getApps(){return []} export function initializeApp(){return {}}',
  'firebase-auth.js': 'export function getAuth(){return {currentUser:null}} export function onAuthStateChanged(auth,cb){window.__authCallback=cb;cb(null)} export class GoogleAuthProvider{}',
  'firebase-firestore.js': "export function getFirestore(){return {}} export function doc(){return {}} export function getDocFromServer(){return new Promise(()=>{})} export function runTransaction(){throw new Error('Unexpected cloud write')}"
};

(async () => {
  if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean)] });
  const failures = [];
  let passed = 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function check(name, fn) {
    if (process.env.GRAPH_QA_ONLY && !name.toLowerCase().includes(process.env.GRAPH_QA_ONLY.toLowerCase())) return;
    try { await fn(); console.log('PASS', name); passed++; }
    catch (error) { console.error('FAIL', name); throw error; }
  }
  async function newPage({ width = 390, height = 844, mobile = true, reduced = true, data = ledger } = {}) {
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('pageerror', error => failures.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (url.startsWith(base + '/') || url.startsWith('data:')) return void req.continue();
      const name = Object.keys(firebase).find(item => url.endsWith('/' + item));
      if (name) return void req.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: firebase[name] });
      req.abort();
    });
    await page.evaluateOnNewDocument(() => {
      window.__graphAnimations = [];
      window.__animationDebug = [];
      document.addEventListener('animationstart', event => {
        if (window.__animationDebug.length < 100) window.__animationDebug.push({ name: event.animationName, key: event.target.dataset?.graphKey || '', classes: event.target.className });
        if (event.animationName === 'nsGraphArrive') window.__graphAnimations.push(event.target.dataset.graphKey);
      }, true);
      new MutationObserver(mutations => mutations.forEach(mutation => {
        const el = mutation.target;
        if (el.dataset?.graphKey && window.__animationDebug.length < 100) window.__animationDebug.push({ change: el.dataset.graphKey, old: mutation.oldValue, current: el.className });
      })).observe(document, { attributes: true, attributeOldValue: true, attributeFilter: ['class'], subtree: true });
    });
    await page.goto(base + '/blank');
    await page.evaluate(({ key, data }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('northstar-welcome-seen-v1', '1');
      localStorage.setItem(key, JSON.stringify(data));
    }, { key, data });
    await page.goto(base + '/personal-finance/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.NorthstarLedger === 'function' && window.NorthstarLedger() && !!window.__authCallback);
    return page;
  }
  async function navigate(page, name) {
    await page.evaluate(name => {
      const button = document.querySelector(`#mobileDock [data-page="${name}"]`) || document.querySelector(`#dockMoreMenu [data-page="${name}"]`);
      if (!button) throw new Error(`Missing navigation for ${name}`);
      button.click();
    }, name);
    await page.waitForFunction(name => document.getElementById('content').dataset.page === name, {}, name);
  }
  async function text(page, selector) { return page.$eval(selector, el => el.innerText); }
  async function setInput(page, selector, value) {
    await page.$eval(selector, (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  }
  async function screenshot(page, name) {
    if (!process.env.GRAPH_QA_SCREENSHOTS) return;
    fs.mkdirSync(process.env.GRAPH_QA_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.GRAPH_QA_SCREENSHOTS, `${name}.png`), fullPage: true });
  }
  async function openDetails(page, selector) { await page.$eval(selector, el => { el.open = true; }); }
  async function graphFits(page, label) {
    const result = await page.evaluate(() => [...document.querySelectorAll('.ns-graph, .ns-mini-chart, .ns-category-layout, .ns-data-composition')].map(el => {
      const r = el.getBoundingClientRect();
      return { key: el.dataset.graphKey || el.className, left: r.left, right: r.right, width: el.clientWidth, scroll: el.scrollWidth, viewport: innerWidth };
    }));
    for (const g of result) {
      assert.ok(g.left >= -1 && g.right <= g.viewport + 1, `${label}: ${g.key} outside viewport: ${JSON.stringify(g)}`);
      assert.ok(g.scroll <= g.width + 1, `${label}: ${g.key} content overflows: ${JSON.stringify(g)}`);
    }
    const duplicates = await page.evaluate(() => {
      const seen = new Set(), repeated = new Set();
      document.querySelectorAll('[id]').forEach(el => { if (seen.has(el.id)) repeated.add(el.id); else seen.add(el.id); });
      return [...repeated];
    });
    assert.deepEqual(duplicates, [], `${label}: duplicate IDs`);
  }

  try {
    await check('recorded activity, categories, and account charts use the right records and transfer directions', async () => {
      const page = await newPage({ width: 1440, height: 900, mobile: false });
      const before = await page.evaluate(key => ({ memory: JSON.stringify(window.NorthstarLedger()), stored: localStorage.getItem(key) }), key);
      const flow = await text(page, '[data-graph-key="overview-flow"]');
      assert.match(flow, /Income \$1,400\.00/); assert.match(flow, /Spending \$190\.25/);
      assert.match(flow, /Transfers are excluded/); assert.match(flow, /1 entry could not be graphed/);
      await openDetails(page, '[data-graph-key="overview-flow"] details');
      assert.match(await text(page, '[data-graph-key="overview-flow"] table'), /\$1,000\.00\s+\$170\.25/);
      const category = await text(page, '[data-graph-key="overview-categories"]');
      assert.match(category, /Food\s+\$110\.25/); assert.match(category, /Bills\s+\$60\.00/);
      await navigate(page, 'Accounts');
      await openDetails(page, '[data-graph-key="account-checking"] details');
      await openDetails(page, '[data-graph-key="account-savings"] details');
      assert.match(await text(page, '[data-graph-key="account-checking"] table'), /\$1,000\.00\s+\$245\.25/);
      assert.match(await text(page, '[data-graph-key="account-savings"] table'), /\$75\.00\s+\$0\.00/);
      assert.match(await page.$eval('[data-graph-key="account-checking"] summary', el => el.getAttribute('aria-label')), /Synthetic checking/);
      assert.match(await text(page, '[data-graph-key="account-checking"]'), /not balance history/);
      assert.deepEqual(await page.evaluate(key => ({ memory: JSON.stringify(window.NorthstarLedger()), stored: localStorage.getItem(key) }), key), before);
      await page.close();
    });

    await check('transaction filters, budgets, purchases, and Guide graphs stay read-only and accurately labeled', async () => {
      const page = await newPage();
      const before = await page.evaluate(key => ({ memory: JSON.stringify(window.NorthstarLedger()), stored: localStorage.getItem(key) }), key);
      await navigate(page, 'Transactions');
      await page.select('#txTypeFilter', 'Transfer');
      assert.match(await text(page, '[data-graph-key="transaction-mix"]'), /Transfers · 1\s+\$75\.00/);
      assert.match(await text(page, '[data-graph-key="transaction-mix"]'), /Income · 0\s+\$0\.00/);
      await page.select('#txTypeFilter', 'All');
      await page.type('#txSearch', 'Groceries');
      assert.match(await text(page, '[data-graph-key="transaction-mix"]'), /Spending · 1\s+\$100\.25/);
      await navigate(page, 'Budgets');
      const budget = await text(page, '[data-graph-key="budget-map"]');
      assert.match(budget, /Food\s+\$110\.25 \/ \$100\.00/); assert.match(budget, /over the limit/);
      assert.match(budget, /1 entry could not be graphed/);
      await navigate(page, 'Purchases');
      const purchase = await text(page, '[data-graph-key="purchase-map"]');
      assert.match(purchase, /Synthetic desk/); assert.doesNotMatch(purchase, /Linked plan|Postponed item/);
      assert.match(purchase, /not bank-verified/i);
      assert.equal(await page.$('#purchaseExpenseHistory, [data-action="show-purchase-expenses"]'), null);
      assert.ok(await page.$('.purchase-tile-purchased .purchase-badge-ring'));
      await page.$eval('.purchase-tile[data-id="desk"]', el => el.click());
      const price = await text(page, '[data-graph-key="price-desk"]');
      assert.match(price, /Latest · \$80\.00/); assert.match(price, /Not a live price feed or forecast/);
      assert.match(price, /1 entry could not be graphed/);
      await openDetails(page, '[data-graph-key="price-desk"] details');
      assert.match(await text(page, '[data-graph-key="price-desk"] table'), /\$120\.00/);
      await navigate(page, 'Guide');
      const guide = await text(page, '[data-graph-key="guide-profile"]');
      assert.match(guide, /Monthly income · \$2,000\.00/); assert.match(guide, /Room left\s+\$550\.00/);
      assert.match(guide, /not actual transactions or a verified balance/);
      await navigate(page, 'Settings');
      const mix = await text(page, '[data-graph-key="settings-counts"]');
      assert.match(mix, /counts, not balances/); assert.match(mix, /2\s+Accounts/); assert.match(mix, /8\s+Transactions/);
      assert.deepEqual(await page.evaluate(key => ({ memory: JSON.stringify(window.NorthstarLedger()), stored: localStorage.getItem(key) }), key), before);
      await page.close();
    });

    await check('Guide never graphs a missing imported buffer as if it were saved', async () => {
      const incomplete = JSON.parse(JSON.stringify(ledger));
      delete incomplete.settings.profile.cushion;
      const page = await newPage({ data: incomplete });
      const before = await page.evaluate(key => localStorage.getItem(key), key);
      await navigate(page, 'Guide');
      assert.match(await text(page, '[data-graph-key="guide-profile"]'), /Build your monthly picture/);
      assert.equal(await page.$eval('#guideProfileForm [name="cushion"]', el => el.value), '250', 'the existing Guide form default is unchanged');
      assert.equal(await page.evaluate(() => Object.hasOwn(window.NorthstarLedger().settings.profile, 'cushion')), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before, 'viewing the graph does not write a default');
      await page.$eval('#guideProfileForm', form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('[data-graph-key="guide-profile"]')?.innerText.includes('Room left'));
      assert.match(await text(page, '[data-graph-key="guide-profile"]'), /Room left\s+\$550\.00/);
      assert.equal(await page.evaluate(() => window.NorthstarLedger().settings.profile.cushion), '250');
      await page.close();
    });

    await check('keyboard-accessible scenario comparisons use explicit inputs, reset, and never write finance data', async () => {
      const page = await newPage();
      await navigate(page, 'Goals');
      const before = await page.evaluate(key => ({ memory: JSON.stringify(window.NorthstarLedger()), stored: localStorage.getItem(key) }), key);
      assert.match(await text(page, '#nsGoalScenarios'), /Inputs are not saved/);
      await setInput(page, '#nsScenarioA', '25.50'); await setInput(page, '#nsScenarioB', '40');
      assert.match(await text(page, '#nsScenarioResult'), /After 12 months, A: \$406\.25/);
      assert.match(await text(page, '#nsScenarioResult'), /After 12 months, B: \$580\.25/);
      const summary = '#nsScenarioResult summary';
      assert.deepEqual(await page.evaluate(() => ['nsScenarioGoal', 'nsScenarioA', 'nsScenarioB'].map(id => document.querySelector(`label[for="${id}"]`)?.control?.id)), ['nsScenarioGoal', 'nsScenarioA', 'nsScenarioB']);
      await page.focus('#nsScenarioGoal');
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'nsScenarioA');
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'nsScenarioB');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'View exact scenario values');
      await page.keyboard.press('Enter');
      assert.equal(await page.$eval('#nsScenarioResult details', el => el.open), true);
      assert.match(await text(page, '#nsScenarioResult table'), /3 months\s+\$176\.75\s+\$220\.25/);
      await page.select('#nsScenarioGoal', 'rain');
      assert.match(await text(page, '#nsScenarioResult'), /After 12 months, A: \$506\.00/);
      await setInput(page, '#nsScenarioA', '-1');
      assert.match(await text(page, '#nsScenarioResult'), /non-negative/);
      await setInput(page, '#nsScenarioA', '0');
      assert.match(await text(page, '#nsScenarioResult'), /After 12 months, A: \$200\.00/);
      await page.evaluate(() => { window.NorthstarVaultLocked = true; });
      const locked = await text(page, '#nsScenarioResult');
      await setInput(page, '#nsScenarioA', '99');
      assert.equal(await text(page, '#nsScenarioResult'), locked, 'a locked workspace cannot update the graph');
      await page.evaluate(() => { window.NorthstarVaultLocked = false; });
      await navigate(page, 'Overview'); await navigate(page, 'Goals');
      assert.equal(await page.$eval('#nsScenarioA', el => el.value), '');
      assert.deepEqual(await page.evaluate(key => ({ memory: JSON.stringify(window.NorthstarLedger()), stored: localStorage.getItem(key) }), key), before);
      await screenshot(page, 'goals-empty-scenario');
      await setInput(page, '#nsScenarioA', '25.50'); await setInput(page, '#nsScenarioB', '40');
      await screenshot(page, 'goals-filled-scenario');
      await page.close();
    });

    await check('graphs update after an explicit Save and never write while a form is only a draft', async () => {
      const page = await newPage({ width: 1440, height: 900, mobile: false });
      const before = await page.evaluate(() => window.NorthstarLedger());
      await page.$eval('[data-action="add-transaction"]', el => el.click());
      await setInput(page, '#modalForm [name="description"]', 'Synthetic extra expense');
      await setInput(page, '#modalForm [name="amount"]', '30');
      await page.select('#modalForm [name="type"]', 'Expense');
      await page.select('#modalForm [name="category"]', 'Food');
      await page.select('#modalForm [name="accountId"]', 'checking');
      assert.deepEqual(await page.evaluate(() => window.NorthstarLedger()), before);
      await page.$eval('#modalForm', form => form.requestSubmit());
      await page.waitForFunction(() => !document.getElementById('modalForm'));
      assert.match(await text(page, '[data-graph-key="overview-flow"]'), /Spending \$220\.25/);
      const after = await page.evaluate(() => window.NorthstarLedger());
      assert.equal(after.transactions.length, before.transactions.length + 1);
      assert.equal(after.accounts.find(a => a.id === 'checking').balance, 970.99);
      assert.equal(after.accounts.find(a => a.id === 'savings').balance, 2000);
      await page.close();
    });

    await check('blank workspaces show honest empty states without sample records', async () => {
      const page = await newPage({ data: blank });
      const before = await page.evaluate(() => JSON.stringify(window.NorthstarLedger()));
      assert.match(await text(page, '[data-graph-key="overview-flow"]'), /Your timeline starts here/);
      assert.match(await text(page, '#content'), /No spending recorded yet/);
      await navigate(page, 'Transactions'); assert.match(await text(page, '#content'), /No matching amounts to chart/);
      await navigate(page, 'Accounts'); assert.match(await text(page, '#content'), /Start with your accounts/);
      await navigate(page, 'Budgets'); assert.match(await text(page, '#content'), /No budgets yet/);
      await navigate(page, 'Goals'); assert.match(await text(page, '#content'), /No savings goals yet/);
      await navigate(page, 'Purchases'); assert.match(await text(page, '#content'), /Nothing on the list yet/);
      await navigate(page, 'Guide'); assert.match(await text(page, '#content'), /Build your monthly picture/);
      await navigate(page, 'Settings'); assert.match(await text(page, '[data-graph-key="settings-counts"]'), /No records to chart yet/);
      assert.equal(await page.evaluate(() => JSON.stringify(window.NorthstarLedger())), before);
      await page.close();
    });

    await check('graphs and exact-value disclosures fit phone, tablet, and desktop widths', async () => {
      for (const [width, height, mobile] of [[320, 568, true], [390, 844, true], [768, 1024, true], [1440, 900, false]]) {
        const page = await newPage({ width, height, mobile });
        for (const section of ['Overview', 'Transactions', 'Accounts', 'Budgets', 'Goals', 'Purchases', 'Guide', 'Settings']) {
          if (section !== 'Overview') await navigate(page, section);
          await page.evaluate(() => document.querySelectorAll('.ns-graph-details').forEach(el => { el.open = true; }));
          await graphFits(page, `${width}px ${section}`);
          if ((width === 390 || width === 1440) && process.env.GRAPH_QA_SCREENSHOTS) {
            await page.evaluate(() => document.querySelectorAll('.ns-graph-details').forEach(el => { el.open = false; }));
            await screenshot(page, `${width}-${section.toLowerCase()}`);
          }
        }
        await navigate(page, 'Purchases'); await page.$eval('.purchase-tile[data-id="desk"]', el => el.click());
        await openDetails(page, '[data-graph-key="price-desk"] details');
        await graphFits(page, `${width}px purchase detail`);
        if ((width === 390 || width === 1440) && process.env.GRAPH_QA_SCREENSHOTS) await screenshot(page, `${width}-price-detail`);
        await page.close();
      }
    });

    await check('long labels and large valid amounts stay inside the graph and are escaped', async () => {
      const stress = JSON.parse(JSON.stringify(ledger));
      const payload = '<img src=x onerror="window.__graphXss=1">' + ' unusually-long-label'.repeat(12);
      stress.transactions[1].category = payload;
      stress.transactions[1].amount = 9876543210987.65;
      stress.budgets[0] = { id: 'long', category: payload, limit: 1234567890123.45 };
      stress.goals[0] = { id: 'trip', name: payload, saved: 9876543210987.65, target: 1234567890123.45 };
      stress.purchases[0] = { ...stress.purchases[0], name: payload, price: 9876543210987.65, saved: 1234567890123.45,
        priceHistory: [{ date: day(-1, 1), price: 9876543210987.65 }, { date: day(0, 1), price: 1234567890123.45 }] };
      const page = await newPage({ width: 320, height: 568, mobile: true, data: stress });
      for (const section of ['Overview', 'Accounts', 'Budgets', 'Goals', 'Purchases']) {
        if (section !== 'Overview') await navigate(page, section);
        await page.evaluate(() => document.querySelectorAll('.ns-graph-details').forEach(el => { el.open = true; }));
        await graphFits(page, `large values: ${section}`);
        assert.equal(await page.$('.ns-graph img, .ns-category-layout img'), null);
        assert.notEqual(await page.evaluate(() => window.__graphXss), 1);
      }
      await page.$eval('.purchase-tile[data-id="desk"]', el => el.click());
      await openDetails(page, '[data-graph-key="price-desk"] details');
      await graphFits(page, 'large values: price timeline');
      await page.close();
    });

    await check('graph entry motion is one-shot and reduced-motion disables it', async () => {
      const page = await newPage({ width: 1440, height: 900, mobile: false, reduced: false });
      if (process.env.GRAPH_QA_DEBUG) {
        await delay(1000);
        console.log('  motion debug', await page.evaluate(() => {
          const el = document.querySelector('[data-graph-key="overview-flow"]'), box = el?.getBoundingClientRect();
          return { events: window.__graphAnimations, debug: window.__animationDebug, seen: document.documentElement.className, hidden: document.hidden,
            inert: document.querySelector('.app-shell')?.inert, locked: window.NorthstarVaultLocked,
            reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
            graph: el && { classes: el.className, animation: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity, box: box.toJSON() } };
        }));
      }
      await page.waitForFunction(() => window.__graphAnimations.includes('overview-flow'));
      await delay(800);
      assert.equal(await page.$eval('[data-graph-key="overview-flow"]', el => getComputedStyle(el).opacity), '1');
      await navigate(page, 'Transactions');
      await page.waitForFunction(() => window.__graphAnimations.includes('transaction-mix'));
      const before = await page.evaluate(() => window.__graphAnimations.filter(key => key === 'transaction-mix').length);
      await page.type('#txSearch', 'Groceries'); await delay(800);
      assert.equal(await page.evaluate(() => window.__graphAnimations.filter(key => key === 'transaction-mix').length), before);
      await navigate(page, 'Budgets');
      await page.waitForFunction(() => window.__graphAnimations.includes('budget-map'));
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.waitForFunction(() => !document.querySelector('[data-graph-key="budget-map"]').classList.contains('ns-graph-enter'));
      assert.equal(await page.$eval('[data-graph-key="budget-map"]', el => getComputedStyle(el).animationName), 'none');
      await page.close();
      const reduced = await newPage({ width: 1440, height: 900, mobile: false, reduced: true });
      await delay(800); await navigate(reduced, 'Transactions'); await delay(500);
      assert.deepEqual(await reduced.evaluate(() => window.__graphAnimations), []);
      assert.equal(await reduced.$eval('[data-graph-key="transaction-mix"]', el => getComputedStyle(el).animationName), 'none');
      await reduced.close();
    });

    await check('new graph regions pass scoped automated WCAG checks', async () => {
      const page = await newPage({ width: 1440, height: 900, mobile: false });
      await page.addScriptTag({ path: axePath });
      let incomplete = 0;
      for (const [section, selector] of [['Overview', '[data-graph-key="overview-flow"]'], ['Overview', '[data-graph-key="overview-categories"]'],
        ['Transactions', '[data-graph-key="transaction-mix"]'], ['Accounts', '[data-graph-key="account-checking"]'],
        ['Budgets', '[data-graph-key="budget-map"]'], ['Goals', '[data-graph-key="goal-orbits"]'],
        ['Goals', '[data-graph-key="goal-scenarios"]'], ['Purchases', '[data-graph-key="purchase-map"]'], ['Guide', '[data-graph-key="guide-profile"]'], ['Settings', '[data-graph-key="settings-counts"]']]) {
        if (await page.$eval('#content', el => el.dataset.page) !== section) await navigate(page, section);
        if (section === 'Goals' && selector.includes('scenarios')) await setInput(page, '#nsScenarioA', '25.50');
        await page.evaluate(selector => document.querySelector(selector)?.querySelectorAll('details').forEach(el => { el.open = true; }), selector);
        const result = await page.evaluate(async selector => {
          const result = await window.axe.run(document.querySelector(selector), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
          return { violations: result.violations.map(v => ({ id: v.id, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: result.incomplete.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) };
        }, selector);
        incomplete += result.incomplete.length;
        if (process.env.GRAPH_QA_DEBUG && result.incomplete.length) console.log(`  ${section} incomplete:`, JSON.stringify(result.incomplete));
        assert.deepEqual(result.violations, [], `${section} ${selector}: ${JSON.stringify(result.violations, null, 2)}`);
      }
      await navigate(page, 'Purchases'); await page.$eval('.purchase-tile[data-id="desk"]', el => el.click());
      const priceResult = await page.evaluate(async () => {
        const result = await window.axe.run(document.querySelector('[data-graph-key="price-desk"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return { violations: result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), incomplete: result.incomplete.length };
      });
      incomplete += priceResult.incomplete;
      assert.deepEqual(priceResult.violations, []);
      console.log(`  Automated graph checks had ${incomplete} incomplete/manual-review results.`);
      await page.close();
    });
    await check('graph text meets automated contrast checks on a conservative opaque surface', async () => {
      const page = await newPage({ width: 1440, height: 900, mobile: false });
      await page.addScriptTag({ path: axePath });
      // Axe cannot resolve many translucent/gradient backgrounds. A second pass
      // uses a deliberately darker, flat surface as a conservative supplement;
      // it does not replace review of the actual rendered design.
      await page.addStyleTag({ content: '.ns-graph,.ns-graph-tag,.ns-mix-item,.ns-goal-orbit,.ns-graph-empty,.ns-scenario-target span,.account-card,.panel{background:#e8ebe8!important}.ns-graph::before{content:none!important}' });
      for (const [section, selector] of [['Overview', '[data-graph-key="overview-flow"]'], ['Overview', '[data-graph-key="overview-categories"]'],
        ['Transactions', '[data-graph-key="transaction-mix"]'], ['Accounts', '[data-graph-key="account-checking"]'],
        ['Budgets', '[data-graph-key="budget-map"]'], ['Goals', '[data-graph-key="goal-orbits"]'],
        ['Goals', '[data-graph-key="goal-scenarios"]'], ['Purchases', '[data-graph-key="purchase-map"]'], ['Guide', '[data-graph-key="guide-profile"]'], ['Settings', '[data-graph-key="settings-counts"]']]) {
        if (await page.$eval('#content', el => el.dataset.page) !== section) await navigate(page, section);
        if (section === 'Goals' && selector.includes('scenarios')) await setInput(page, '#nsScenarioA', '25.50');
        await page.evaluate(selector => document.querySelector(selector)?.querySelectorAll('details').forEach(el => { el.open = true; }), selector);
        const violations = await page.evaluate(async selector => {
          const result = await window.axe.run(document.querySelector(selector), { runOnly: { type: 'rule', values: ['color-contrast'] } });
          return result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
        }, selector);
        assert.deepEqual(violations, [], `${section} ${selector}: ${JSON.stringify(violations, null, 2)}`);
      }
      await page.close();
    });
    assert.deepEqual(failures, [], 'no uncaught page errors');
    console.log(`\n${passed} graph browser scenarios passed. External services were mocked or blocked.`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
