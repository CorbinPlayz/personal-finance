// Run with: node --test tests/audit-fixes.test.cjs
// Regression tests for budget rounding and the transaction amount limit. They
// run the app's real functions, extracted from index.html, without a build step.
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

function budgetContext(limit) {
  const data = { accounts: [{ id: 'a', name: 'A', balance: 0 }], transactions: [], budgets: [{ id: 'b1', category: 'Food', limit }], purchases: [], goals: [], settings: { currency: 'USD' } };
  const ctx = vm.createContext({ data, pageHeading: title => `<h>${title}</h>`, emptyState: title => title, renderBudgetGraph: () => '' });
  vm.runInContext(['const esc=', 'const money=', 'const today=', 'const monthNow=', 'const roundMoney=', 'function thisMonthTx(', 'function monthSpend(', 'function renderBudgets('].map(sourceLine).join('\n'), ctx);
  const date = vm.runInContext('today()', ctx);
  ctx.spend = (...amounts) => amounts.forEach((amount, i) => data.transactions.push({ id: 't' + i, date, type: 'Expense', category: 'Food', accountId: 'a', amount }));
  return ctx;
}

test('monthly spending is summed in whole cents, not floating-point noise', () => {
  const ctx = budgetContext(0.3); ctx.spend(0.1, 0.2);
  assert.equal(ctx.monthSpend('Food'), 0.3);
});

test('a budget that is exactly used up is not shown as over budget', () => {
  const ctx = budgetContext(0.3); ctx.spend(0.1, 0.2);
  const markup = ctx.renderBudgets();
  assert.doesNotMatch(markup, /Over budget/); assert.doesNotMatch(markup, /progress-fill over/);
  assert.match(markup, /100% used/);
});

test('a budget that is over by one cent still says so', () => {
  const ctx = budgetContext(30); ctx.spend(10.01, 20);
  const markup = ctx.renderBudgets();
  assert.match(markup, /Over budget by \$0\.01/); assert.match(markup, /progress-fill over/);
});

class FakeFormData {
  constructor(form) { this.values = form.values; }
  entries() { return Object.entries(this.values); }
  has(name) { return name in this.values; }
  getAll(name) { const v = this.values[name]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; }
}
function transactionContext() {
  const errors = [];
  const data = { accounts: [{ id: 'checking', name: 'Checking', balance: 500 }], transactions: [], purchases: [], budgets: [], goals: [], settings: { currency: 'USD' } };
  const ctx = vm.createContext({ data, FormData: FakeFormData, modalState: null, formError: x => errors.push(x), id: () => 'new-tx', today: () => '2026-11-09',
    roundMoney: n => Math.round(Number(n) * 100) / 100, maxPurchaseAllocation: () => 1000, accountName: () => 'Checking', persist: () => {}, render: () => {},
    showToast: () => {}, celebrateGoal: () => {}, money: n => '$' + n });
  vm.runInContext(section('function applyTransaction(', '\nfunction sortedTransactions(') + '\n' + section('function submitModal(', '\nasync function deleteItem('), ctx);
  ctx.errors = errors;
  ctx.save = amount => { ctx.modalState = { kind: 'transaction', id: '' };
    ctx.submitModal({ preventDefault() {}, target: { id: 'modalForm', values: { description: 'Big', amount, type: 'Income', category: 'Income', date: '2026-11-09', accountId: 'checking' } } }); };
  return ctx;
}

test('a transaction above the form limit is rejected and changes nothing', () => {
  for (const amount of ['1e300', '99999999999999999999', '1000000000.01']) {
    const ctx = transactionContext(), before = JSON.stringify(ctx.data);
    ctx.save(amount);
    assert.equal(ctx.errors.length, 1, amount); assert.match(ctx.errors[0], /1,000,000,000/);
    assert.equal(JSON.stringify(ctx.data), before, amount);
  }
});

test('a transaction at the form limit and ordinary amounts are still accepted', () => {
  for (const [amount, balance] of [['1000000000', 1000000500], ['0.01', 500.01], ['12.34', 512.34]]) {
    const ctx = transactionContext(); ctx.save(amount);
    assert.deepEqual(ctx.errors, [], amount); assert.equal(ctx.data.accounts[0].balance, balance); assert.equal(ctx.data.transactions.length, 1);
  }
});

class FakeBlob { constructor(parts, options) { this.parts = parts; this.options = options; } }
async function csvContext({ transactions, confirm = true, vaultState = 'locked' }) {
  const { transactionsToCsv } = await import('../csv-export.mjs');
  const log = { dialogs: [], toasts: [], blobs: [], downloads: [] };
  const data = { accounts: [{ id: 'chk', name: 'Checking', balance: 10 }], transactions, budgets: [], goals: [], purchases: [], settings: {} };
  const ctx = vm.createContext({ data, transactionsToCsv, vault: { state: vaultState }, today: () => '2026-11-18', Blob: class extends FakeBlob { constructor(...a) { super(...a); log.blobs.push(this); } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() {} }, setTimeout: () => 0, console,
    document: { createElement: () => ({ click() { log.downloads.push(this.download); }, remove() {} }), body: { append() {} } },
    showToast: message => log.toasts.push(message), showNorthstarDialog: async options => { log.dialogs.push(options); return confirm; } });
  vm.runInContext(section('async function exportTransactionsCsv(', '\nfunction validateImport('), ctx);
  ctx.log = log; return ctx;
}
const oneTransaction = [{ id: 't1', date: '2026-11-17', type: 'Expense', description: 'Coffee', category: 'Food', accountId: 'chk', amount: 4.5 }];

test('CSV export asks first, then downloads a readable UTF-8 file without changing the ledger', async () => {
  const ctx = await csvContext({ transactions: oneTransaction }), before = JSON.stringify(ctx.data);
  await ctx.exportTransactionsCsv();
  assert.equal(ctx.log.dialogs.length, 1); assert.match(ctx.log.dialogs[0].message, /readable/);
  assert.deepEqual(ctx.log.downloads, ['northstar-transactions-2026-11-18.csv']);
  const blob = ctx.log.blobs[0]; assert.equal(blob.parts[0], '﻿'); assert.match(blob.parts[1], /^Date,Type,Description,Category,Account,Transfer to,Amount\r\n2026-11-17,Expense,Coffee,Food,Checking,,4\.50\r\n$/);
  assert.match(blob.options.type, /^text\/csv/); assert.equal(JSON.stringify(ctx.data), before);
});

test('CSV export downloads nothing when the confirmation is cancelled', async () => {
  const ctx = await csvContext({ transactions: oneTransaction, confirm: false });
  await ctx.exportTransactionsCsv();
  assert.equal(ctx.log.dialogs.length, 1); assert.equal(ctx.log.blobs.length, 0); assert.deepEqual(ctx.log.downloads, []);
});

test('CSV export warns that the file is not encrypted in a protected workspace', async () => {
  const ctx = await csvContext({ transactions: oneTransaction, vaultState: 'unlocked' });
  await ctx.exportTransactionsCsv();
  assert.match(ctx.log.dialogs[0].detail, /passphrase-protected, but this CSV file is not encrypted/);
});

test('CSV export with no transactions says so and does not ask or download', async () => {
  const ctx = await csvContext({ transactions: [] });
  await ctx.exportTransactionsCsv();
  assert.deepEqual(ctx.log.dialogs, []); assert.equal(ctx.log.blobs.length, 0); assert.match(ctx.log.toasts[0], /no transactions/i);
});

test('Settings offers the CSV export and the app dispatches it', () => {
  assert.match(moduleScript, /data-action="export-csv"/); assert.match(moduleScript, /case'export-csv':exportTransactionsCsv\(\);break;/);
  assert.match(moduleScript, /import \{ transactionsToCsv \} from '\.\/csv-export\.mjs';/);
});
