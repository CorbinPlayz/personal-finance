// Run with: node --test tests/purchase-expenses.test.cjs
// Exercise the app's real renderers and finance actions without a build step.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleScript, 'the app module must exist');
function section(start, end) {
  const a = moduleScript.indexOf(start), b = moduleScript.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing section: ${start}`);
  return moduleScript.slice(a, b);
}
function sourceLine(prefix) {
  const line = moduleScript.split('\n').find(value => value.startsWith(prefix));
  assert.ok(line, `missing app helper: ${prefix}`);
  return line;
}
const renderers = section('function sortPurchaseItems(', 'function getGuideProfile()');
const helpers = ['const esc=', 'const money=', 'const fmtDate=', 'function accountName(', 'function sortedTransactions('].map(sourceLine).join('\n');
let graphViews;
test.before(async () => { graphViews = await import('../financial-graphs-view.mjs'); });

function makeData(overrides = {}) {
  return { accounts: [{ id: 'checking', name: 'Everyday checking', balance: 500 }], transactions: [], purchases: [], budgets: [], goals: [], settings: { currency: 'USD' }, ...overrides };
}
function expense(id, date, overrides = {}) {
  return { id, date, type: 'Expense', description: id, amount: 12.34, category: 'Food', accountId: 'checking', ...overrides };
}
function plan(id, overrides = {}) {
  return { id, name: id, price: 40, saved: 40, status: 'Purchased', priority: 'Medium', date: '2027-01-01', category: 'Shopping', accountId: 'checking', ...overrides };
}
function makeRenderContext(data, options = {}) {
  const context = vm.createContext({ data, purchaseDetailId: options.detail || null, completedPurchaseQuery: options.query || '',
    getReminders: () => [], pageHeading: (title, action = '') => `<header>${title}${action}</header>`,
    emptyState: title => `<div class="empty-state">${title}</div>`, renderPurchaseCard: () => '<div>Purchase detail</div>',
    renderPurchaseGraph: graphViews.renderPurchaseGraph });
  vm.runInContext(`${helpers}\n${renderers}`, context);
  return context;
}
function render(data, options) { return makeRenderContext(data, options).renderPurchases(); }
function tiles(markup) {
  return [...markup.matchAll(/<article class="purchase-tile([^\"]*)"([^>]*)>([\s\S]*?)<\/article>/g)]
    .map(match => ({ classes: match[1], attributes: match[2], html: match[3] }));
}
function completed(markup) { return tiles(markup).filter(tile => tile.classes.includes('purchase-tile-purchased')); }
function attr(tile, name) { return tile.attributes.match(new RegExp(`${name}="([^"]*)"`))?.[1]; }

test('projects every expense as a completed purchase; never includes income or transfers or changes the ledger', () => {
  const data = makeData({ transactions: [expense('old', '2025-01-03'), { ...expense('income', '2026-11-09'), type: 'Income' }, expense('new', '2026-11-08', { amount: 79.5, category: 'Shopping' }), { ...expense('transfer', '2026-11-10'), type: 'Transfer' }] });
  const before = JSON.stringify(data), markup = render(data), cards = completed(markup);
  assert.deepEqual(cards.map(card => attr(card, 'data-transaction-id')), ['new', 'old']);
  assert.equal(attr(cards[0], 'data-action'), 'edit-transaction');
  assert.equal(attr(cards[0], 'data-id'), 'new');
  assert.match(cards[0].html, /\$79\.50/);
  assert.match(cards[0].html, /Shopping · Everyday checking/);
  assert.match(cards[0].html, /Purchased<\/span><strong>Nov 8, 2026/);
  assert.match(cards[0].html, /purchase-tile-strike/);
  assert.match(cards[0].html, /<circle class="purchase-badge-ring"/);
  assert.equal((cards[0].html.match(/<path class="purchase-badge-x"/g) || []).length, 2);
  assert.doesNotMatch(markup, /purchaseExpenseHistory|show-purchase-expenses|manage-expenses/);
  assert.equal(JSON.stringify(data), before, 'rendering must not mutate any records or balances');
});

test('works with no plans, no expenses, and one expense', () => {
  const empty = render(makeData({ transactions: [{ ...expense('income', '2026-11-09'), type: 'Income' }] }));
  assert.match(empty, /Nothing on the list yet/); assert.equal(completed(empty).length, 0);
  const one = render(makeData({ transactions: [expense('one', '2026-11-08')] }));
  assert.equal(completed(one).length, 1); assert.match(one, /data-completed-count[^>]*>1 item/);
  assert.match(one, /Search completed purchases/);
});

test('deduplicates explicit links in both directions and uses the recorded expense price and date', () => {
  const data = makeData({ purchases: [plan('active', { name: 'Upcoming monitor', price: 300, saved: 50, status: 'Saving', priority: 'High' }), plan('plan-a', { name: 'Keyboard', price: 75, transactionId: 'linked-a' }), plan('plan-b', { name: 'Mouse', price: 40 })],
    transactions: [expense('linked-a', '2026-11-08', { amount: 70 }), expense('linked-b', '2026-11-07', { amount: 35, purchaseId: 'plan-b' }), expense('unlinked', '2026-11-06')] });
  const markup = render(data), cards = completed(markup);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(card => attr(card, 'data-transaction-id')), ['linked-a', 'linked-b', 'unlinked']);
  assert.deepEqual(cards.map(card => attr(card, 'data-action')), ['open-purchase', 'open-purchase', 'edit-transaction']);
  assert.equal(attr(cards[0], 'data-id'), 'plan-a'); assert.match(cards[0].html, /\$70\.00/); assert.match(cards[0].html, /Purchased<\/span><strong>Nov 8, 2026/); assert.doesNotMatch(cards[0].html, /Jan 1, 2027/);
  assert.match(markup, /PLANNED PURCHASE VALUE<\/span><strong>\$300\.00/);
  assert.match(markup, /ALREADY SET ASIDE<\/span><strong>\$50\.00/);
  const detail = render(data, { detail: 'plan-a' });
  assert.match(detail, /Linked expense/); assert.match(detail, /data-action="edit-transaction" data-id="linked-a"/);
});

test('a linked expense is represented once even if its plan was returned to planning', () => {
  const data = makeData({ purchases: [plan('p', { status: 'Planning', saved: 10, transactionId: 't' })], transactions: [expense('t', '2026-11-08', { purchaseId: 'p' })] });
  const markup = render(data), cards = tiles(markup);
  assert.equal(cards.length, 1); assert.equal(completed(markup).length, 1);
  assert.match(cards[0].html, /Plan: Planning/); assert.equal(attr(cards[0], 'data-action'), 'open-purchase');
  assert.match(markup, /their saved amounts still count until their status changes/);
  const filtered = completed(render(data, { query: 'planning' }));
  assert.equal(filtered.length, 1); assert.doesNotMatch(filtered[0].attributes, /\shidden(?:\s|$)/);
});

test('identical but unlinked expenses remain distinct; standalone plans label the target date honestly', () => {
  const data = makeData({ purchases: [plan('p', { name: 'Coffee', price: 12.34 })], transactions: [expense('a', '2026-11-08', { description: 'Coffee' }), expense('b', '2026-11-08', { description: 'Coffee' })] });
  const cards = completed(render(data)); assert.equal(cards.length, 3);
  const standalone = cards.find(card => attr(card, 'data-id') === 'p');
  assert.match(standalone.html, /Target<\/span><strong>Jan 1, 2027/);
  assert.equal(cards.filter(card => attr(card, 'data-action') === 'edit-transaction').length, 2);
});

test('escapes transaction fields and handles missing account or date', () => {
  const payload = '<img src=x onerror="alert(1)">';
  const markup = render(makeData({ transactions: [expense('one', '', { description: payload, category: payload, accountId: 'missing' })] }));
  const card = completed(markup)[0]; assert.doesNotMatch(card.html, /<img/);
  assert.match(card.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(card.html, /Unknown account/); assert.match(card.html, /No date/);
});

test('a linked expense without a usable date never borrows the plan target date', () => {
  for (const date of ['', undefined, 123]) {
    const data = makeData({ purchases: [plan('p', { transactionId: 't', date: '2027-01-01' })], transactions: [expense('t', date)] });
    const markup = render(data), card = completed(markup)[0];
    assert.match(card.html, /Purchased<\/span><strong>No date/); assert.doesNotMatch(card.html, /Jan 1, 2027/);
    const filtered = render(data, { query: '2027-01-01' });
    assert.match(filtered, /data-completed-count[^>]*>0 of 1 items/); assert.match(completed(filtered)[0].attributes, /\shidden(?:\s|$)/);
  }
  const malformed = completed(render(makeData({ transactions: [expense('bad-date', '2026-02-31')] })))[0];
  assert.match(malformed.html, /2026-02-31/); assert.doesNotMatch(malformed.html, /Mar 3, 2026/);
});

test('malformed transaction dates do not break the overview or transaction month filters', () => {
  const data = makeData({ transactions: [expense('bad', 123), expense('good', '2026-11-08')] });
  const ctx = vm.createContext({ data, query: '', txTypeFilter: 'All', txMonthFilter: 'All', monthNow: () => '2026-11', pageHeading: () => '', options: () => '', emptyState: () => '', renderTransactionGraph: graphViews.renderTransactionGraph });
  vm.runInContext(helpers + '\n' + sourceLine('function thisMonthTx(') + '\n' + section('function renderTransactions(', '\nfunction renderAccountBalanceBreakdown('), ctx);
  assert.deepEqual(Array.from(ctx.thisMonthTx('Expense'), t => t.id), ['good']);
  assert.match(ctx.renderTransactions(), /No date/);
  ctx.txMonthFilter = '2026-11'; const filtered = ctx.renderTransactions();
  assert.match(filtered, /1 matching transaction/); assert.match(filtered, /good/); assert.doesNotMatch(filtered, /data-id="bad"/);
});

test('searches without truncating long histories or altering the ledger', () => {
  const transactions = Array.from({ length: 250 }, (_, i) => expense(`expense-${String(i).padStart(3, '0')}`, `2026-11-${String(i % 28 + 1).padStart(2, '0')}`));
  const data = makeData({ transactions }), before = JSON.stringify(data), markup = render(data, { query: 'expense-123' }), cards = completed(markup);
  assert.equal(cards.length, 250); assert.equal(new Set(cards.map(card => attr(card, 'data-id'))).size, 250);
  assert.equal(cards.filter(card => !/\shidden(?:\s|$)/.test(card.attributes)).length, 1);
  assert.match(markup, /1 of 250 items/); assert.equal(JSON.stringify(data), before);
});

class FakeFormData {
  constructor(form) { this.values = form.values; }
  entries() { return Object.entries(this.values); }
  has(name) { return name in this.values; }
  getAll(name) { const v = this.values[name]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; }
}
function financeContext() {
  const errors = [], toasts = [];
  const data = makeData({ accounts: [{ id: 'checking', name: 'Everyday checking', balance: 900 }, { id: 'savings', name: 'Savings', balance: 500 }],
    transactions: [expense('t1', '2026-11-09', { amount: 100, purchaseId: 'p1' })],
    purchases: [plan('p1', { name: 'Monitor', price: 100, saved: 100, transactionId: 't1', priceHistory: [{ date: '2026-10-01', price: 110 }] })] });
  const ctx = vm.createContext({ data, FormData: FakeFormData, modalState: null, formError: x => errors.push(x),
    id: () => 'new-tx', today: () => '2026-11-09', roundMoney: n => Math.round(Number(n) * 100) / 100,
    maxPurchaseAllocation: () => 1000, accountName: () => 'Everyday checking', persist: () => {}, render: () => {},
    showToast: x => toasts.push(x), celebrateGoal: () => {}, money: n => '$' + n });
  vm.runInContext(section('function applyTransaction(', '\nfunction sortedTransactions(') + '\n' + section('function submitModal(', '\nasync function deleteItem(') + '\n' + section('function setPurchaseStatus(', '\nfunction navigate('), ctx);
  ctx.submit = (kind, id, values) => { ctx.modalState = { kind, id }; ctx.submitModal({ preventDefault() {}, target: { id: 'modalForm', values } }); assert.deepEqual(errors, []); };
  ctx.toasts = toasts; ctx.errors = errors; return ctx;
}
const transactionValues = { description: 'Monitor', amount: '100', type: 'Expense', category: 'Shopping', date: '2026-11-09', accountId: 'checking' };
const purchaseValues = { name: 'Monitor', price: '100', saved: '100', status: 'Purchased', date: '2027-01-01', priority: 'Medium', accountId: 'checking', category: 'Shopping', notes: '' };

test('editing both sides preserves links and price history; planning then bought does not charge twice', () => {
  const c = financeContext();
  c.submit('transaction', 't1', transactionValues);
  assert.equal(c.data.transactions[0].purchaseId, 'p1'); assert.equal(c.data.accounts[0].balance, 900);
  c.submit('purchase', 'p1', purchaseValues);
  assert.equal(c.data.purchases[0].transactionId, 't1'); assert.equal(c.data.purchases[0].priceHistory[0].price, 110);
  c.setPurchaseStatus('p1', 'Planning'); c.setPurchaseStatus('p1', 'Purchased');
  assert.equal(c.data.transactions.length, 1); assert.equal(c.data.accounts[0].balance, 900);
  assert.match(c.toasts.at(-1), /No duplicate/);
});

test('a stale transaction edit cannot silently create a new expense or change balances', () => {
  const c = financeContext(), before = JSON.stringify(c.data);
  c.modalState = { kind: 'transaction', id: 'deleted-in-another-view' };
  c.submitModal({ preventDefault() {}, target: { id: 'modalForm', values: transactionValues } });
  assert.match(c.errors[0], /no longer exists/i);
  assert.equal(JSON.stringify(c.data), before);
});

test('editing a linked expense reverses its old effect and applies the new amount once', () => {
  const c = financeContext(); c.submit('transaction', 't1', { ...transactionValues, amount: '80' });
  assert.equal(c.data.accounts[0].balance, 920); assert.equal(c.data.accounts[1].balance, 500);
  assert.equal(c.data.transactions[0].purchaseId, 'p1'); assert.equal(c.data.transactions[0].amount, 80);
  c.setPurchaseStatus('p1', 'Planning'); c.setPurchaseStatus('p1', 'Purchased');
  assert.equal(c.data.accounts[0].balance, 920); assert.equal(c.data.transactions.length, 1);
});

test('reclassifying a linked transaction cannot silently create a second expense', () => {
  const c = financeContext(); c.submit('transaction', 't1', { ...transactionValues, type: 'Income', category: 'Income' });
  assert.equal(c.data.accounts[0].balance, 1100); assert.equal(c.data.transactions[0].purchaseId, 'p1');
  c.setPurchaseStatus('p1', 'Planning'); c.setPurchaseStatus('p1', 'Purchased');
  assert.equal(c.data.accounts[0].balance, 1100); assert.equal(c.data.transactions.length, 1); assert.equal(c.data.purchases[0].status, 'Planning');
  assert.match(c.toasts.at(-1), /no longer an expense/);
});

test('changing a transfer to an expense removes its destination while preserving metadata', () => {
  const c = financeContext();
  c.data.transactions[0] = { ...c.data.transactions[0], type: 'Transfer', toAccountId: 'savings' };
  c.data.accounts[1].balance = 600;
  c.submit('transaction', 't1', transactionValues);
  assert.equal(c.data.transactions[0].toAccountId, undefined); assert.equal(c.data.transactions[0].purchaseId, 'p1');
  assert.equal(c.data.accounts[0].balance, 900); assert.equal(c.data.accounts[1].balance, 500);
});


test('filtered long lists never give the visible badge an excessive stagger delay', () => {
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).find(text => text.includes('function setupPurchasedCrosses()'));
  assert.ok(script);
  const cards = Array.from({ length: 500 }, (_, i) => ({ hidden: i !== 450, style: { delay: '', setProperty(_name, value) { this.delay = value; } }, classList: { add() {} } }));
  const group = { querySelectorAll: () => cards, querySelector: () => ({}) };
  const observer = class { observe() {} disconnect() {} unobserve() {} };
  const ctx = vm.createContext({ document: { readyState: 'complete', body: {}, querySelector: () => group }, window: { IntersectionObserver: observer }, IntersectionObserver: observer, MutationObserver: class { observe() {} }, getComputedStyle: () => ({ gridTemplateColumns: '140px 140px' }) });
  vm.runInContext(script, ctx);
  assert.equal(cards[450].style.delay, '0ms');
  assert.ok(cards.every(card => parseInt(card.style.delay, 10) <= 78));
});

test('a seen purchase mark stays settled after rerender or returning to the planner', () => {
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).find(text => text.includes('function setupPurchasedCrosses()'));
  assert.ok(script);
  const card = (id, transactionId) => ({ dataset: { id, transactionId }, hidden: false, style: { setProperty() {} }, classList: { values: new Set(), add(name) { this.values.add(name); } } });
  const makeGroup = cards => ({ querySelectorAll: () => cards, querySelector: () => ({}) });
  const first = card('expense-1', 'expense-1'), unseen = card('expense-2', 'expense-2');
  let group = makeGroup([first, unseen]), mutation;
  const observers = [];
  class IntersectionObserver { constructor(callback) { this.callback = callback; this.observed = []; observers.push(this); } observe(item) { this.observed.push(item); } unobserve() {} disconnect() {} }
  class MutationObserver { constructor(callback) { mutation = callback; } observe() {} }
  const ctx = vm.createContext({ document: { readyState: 'complete', body: {}, querySelector: () => group }, window: { IntersectionObserver }, IntersectionObserver, MutationObserver, getComputedStyle: () => ({ gridTemplateColumns: '140px 140px' }) });
  vm.runInContext(script, ctx);
  observers[0].callback([{ target: first, isIntersecting: true }]);
  assert.equal(first.classList.values.has('purchase-x-visible'), true); assert.equal(first.classList.values.has('purchase-x-settled'), false);
  const rerendered = card('linked-plan', 'expense-1'), stillUnseen = card('expense-2', 'expense-2');
  group = makeGroup([rerendered, stillUnseen]); mutation();
  assert.equal(rerendered.classList.values.has('purchase-x-visible'), true); assert.equal(rerendered.classList.values.has('purchase-x-settled'), true);
  assert.deepEqual(observers[1].observed, [stillUnseen], 'only new/unseen cards should animate');
  group = null; mutation();
  const returned = card('expense-1', 'expense-1'); group = makeGroup([returned]); mutation();
  assert.equal(returned.classList.values.has('purchase-x-settled'), true, 'leaving and returning must not replay the mark');
});
