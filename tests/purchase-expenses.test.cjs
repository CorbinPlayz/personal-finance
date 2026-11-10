// Run with: node --test tests/purchase-expenses.test.cjs
// Exercise the real rendering functions inside the static HTML without a build step.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleScript, 'the app module must exist');

function sourceLine(prefix) {
  const line = moduleScript.split('\n').find(value => value.startsWith(prefix));
  assert.ok(line, `missing app helper: ${prefix}`);
  return line;
}

const start = moduleScript.indexOf('function sortPurchaseItems(');
const end = moduleScript.indexOf('function getGuideProfile()', start);
assert.ok(start >= 0 && end > start, 'purchase renderers must exist');
const purchaseRenderers = moduleScript.slice(start, end);
const helpers = [
  'const esc=',
  'const money=',
  'const fmtDate=',
  'function accountName(',
  'function sortedTransactions('
].map(sourceLine).join('\n');

function makeData(overrides = {}) {
  return {
    accounts: [{ id: 'checking', name: 'Everyday checking', balance: 500 }],
    transactions: [], purchases: [], budgets: [], goals: [],
    settings: { currency: 'USD' },
    ...overrides
  };
}
function expense(id, date, overrides = {}) {
  return { id, date, type: 'Expense', description: id, amount: 12.34,
    category: 'Food', accountId: 'checking', ...overrides };
}
function render(data) {
  const context = vm.createContext({
    data, purchaseDetailId: null,
    ICON: { arrowUp: '<svg aria-hidden="true"></svg>' },
    getReminders: () => [],
    pageHeading: (title, action) => `<header>${title}${action}</header>`,
    emptyState: title => `<div class="empty-state">${title}</div>`,
    renderPurchaseCard: () => '<div>Purchase detail</div>'
  });
  vm.runInContext(`${helpers}\n${purchaseRenderers}`, context);
  return context.renderPurchases();
}
function expenseRows(markup) {
  return [...markup.matchAll(/<li class="purchase-expense-row" data-transaction-id="([^"]*)">([\s\S]*?)<\/li>/g)]
    .map(match => ({ id: match[1], html: match[2] }));
}

test('shows every expense, newest first, without income or transfers', () => {
  const data = makeData({ transactions: [
    expense('old', '2025-01-03'),
    { ...expense('income', '2026-11-09'), type: 'Income' },
    expense('same-a', '2026-11-08'),
    { ...expense('transfer', '2026-11-10'), type: 'Transfer' },
    expense('same-b', '2026-11-08', { amount: 79.5, category: 'Shopping' })
  ] });
  const before = JSON.stringify(data);
  const markup = render(data);
  const rows = expenseRows(markup);
  assert.deepEqual(rows.map(row => row.id), ['same-b', 'same-a', 'old']);
  assert.match(rows[0].html, /−\$79\.50/);
  assert.match(rows[0].html, /Shopping/);
  assert.match(rows[0].html, /Everyday checking/);
  assert.match(rows[0].html, /Nov 8, 2026/);
  assert.match(markup, /3 recorded expenses · Newest first/);
  assert.doesNotMatch(markup, /data-transaction-id="(?:income|transfer)"/);
  assert.equal(JSON.stringify(data), before, 'rendering must never change the ledger');
});

test('shows history even without purchase plans and provides a real empty state', () => {
  const empty = render(makeData({ transactions: [{ ...expense('income', '2026-11-09'), type: 'Income' }] }));
  assert.match(empty, /Nothing on the list yet/);
  assert.match(empty, /No expenses yet/);
  assert.match(empty, /0 recorded expenses/);
  assert.equal(expenseRows(empty).length, 0);

  const single = render(makeData({ transactions: [expense('one', '2026-11-08')] }));
  assert.equal(expenseRows(single).length, 1);
  assert.match(single, /1 recorded expense · Newest first/);
  assert.match(single, /1 expense<\/span>/);
});

test('includes linked expenses once and keeps them separate from plan totals', () => {
  const data = makeData({
    purchases: [
      { id: 'active', name: 'Monitor', price: 300, saved: 50, status: 'Saving', priority: 'High', date: '2027-01-01' },
      { id: 'plan-a', name: 'Keyboard', price: 75, saved: 75, status: 'Purchased', priority: 'Medium', date: '2026-11-08', transactionId: 'linked-a' },
      { id: 'plan-b', name: 'Mouse', price: 40, saved: 40, status: 'Purchased', priority: 'Medium', date: '2026-11-07' }
    ],
    transactions: [expense('linked-a', '2026-11-08'), expense('linked-b', '2026-11-07', { purchaseId: 'plan-b' }), expense('unlinked', '2026-11-06')]
  });
  const markup = render(data);
  const rows = expenseRows(markup);
  assert.deepEqual(rows.map(row => row.id), ['linked-a', 'linked-b', 'unlinked']);
  assert.match(rows[0].html, /Linked plan/);
  assert.match(rows[1].html, /Linked plan/);
  assert.doesNotMatch(rows[2].html, /Linked plan/);
  assert.match(markup, /PLANNED PURCHASE VALUE<\/span><strong>\$300\.00/);
  assert.match(markup, /ALREADY SET ASIDE<\/span><strong>\$50\.00/);
  assert.match(markup, /it isn't an extra charge/);
});

test('escapes transaction content and handles missing account or date', () => {
  const payload = '<img src=x onerror="alert(1)">';
  const markup = render(makeData({ transactions: [expense('one', '', {
    description: payload, category: payload, accountId: 'missing'
  })] }));
  const row = expenseRows(markup)[0].html;
  assert.doesNotMatch(row, /<img/);
  assert.match(row, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(row, /Unknown account/);
  assert.match(row, /No date/);
});

test('does not truncate a long expense history', () => {
  const transactions = Array.from({ length: 250 }, (_, i) =>
    expense(`expense-${String(i).padStart(3, '0')}`, `2026-11-${String(i % 28 + 1).padStart(2, '0')}`));
  const rows = expenseRows(render(makeData({ transactions })));
  assert.equal(rows.length, 250);
  assert.equal(new Set(rows.map(row => row.id)).size, 250);
});
