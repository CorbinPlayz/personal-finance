// Run with: node --test tests/recurring-app.test.cjs
// Runs the app's real recurring-item code, extracted from index.html, with a
// synthetic ledger and no browser.
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

const TODAY = '2026-11-19';
const bill = (over = {}) => ({ id: 'rent', description: 'Rent', amount: 1200, type: 'Expense', category: 'Housing', accountId: 'chk', frequency: 'Monthly', nextDate: '2026-11-01', anchorDay: 1, ...over });
const pay = (over = {}) => bill({ id: 'pay', description: 'Paycheck', amount: 3000, type: 'Income', category: 'Income', frequency: 'Weekly', nextDate: '2026-11-26', anchorDay: 26, ...over });

async function appContext(recurring = [], extra = {}) {
  const lib = await import('../recurring.mjs');
  const log = { toasts: [], saves: 0, renders: 0, errors: [] };
  const data = { accounts: [{ id: 'chk', name: 'Checking', balance: 500 }, { id: 'sav', name: 'Savings', balance: 50 }], transactions: [], budgets: [], goals: [], purchases: [], recurring, settings: { currency: 'USD' } };
  const ctx = vm.createContext({
    data, log, ...lib, FormData: class { constructor(form) { this.values = form.values; } entries() { return Object.entries(this.values); } has(n) { return n in this.values; } getAll(n) { const v = this.values[n]; return v === undefined ? [] : [v]; } },
    ICON: { arrowDown: '↓', arrowUp: '↑', target: '◎' }, modalState: null, today: () => TODAY, id: () => 'new-' + (log.saves + 1),
    persist: () => { log.saves += 1; }, render: () => { log.renders += 1; }, showToast: message => log.toasts.push(message), formError: message => log.errors.push(message),
    showNorthstarDialog: async () => true, pageHeading: title => `<h>${title}</h>`, console,
    ...extra,
  });
  vm.runInContext([sourceLine('const esc='), sourceLine('const money='), sourceLine('const fmtDate='), sourceLine('const roundMoney='), sourceLine('function accountName('), sourceLine('function emptyState('),
    section('function applyTransaction(', '\nfunction sortedTransactions('),
    section('function renderRecurringBanner(', '\nfunction renderGoals('),
    section('function submitModal(', '\nasync function deleteItem('),
    section('async function deleteItem(', '\nfunction trapDialogFocus(')].join('\n'), ctx);
  return ctx;
}
const snapshot = ctx => JSON.stringify(ctx.data);
const submit = (ctx, values, id = '') => { ctx.modalState = { kind: 'recurring', id }; ctx.submitModal({ preventDefault() {}, target: { id: 'modalForm', values } }); };
const form = (over = {}) => ({ description: 'Gym', amount: '25', type: 'Expense', category: 'Health', accountId: 'chk', frequency: 'Monthly', nextDate: '2026-12-05', ...over });

test('the panel offers Post and Skip only on due items, with a monthly summary', async () => {
  const ctx = await appContext([bill(), pay()]);
  const markup = ctx.renderRecurringPanel();
  assert.match(markup, /data-action="post-recurring" data-id="rent"/); assert.match(markup, /data-action="skip-recurring" data-id="rent"/);
  assert.doesNotMatch(markup, /data-action="post-recurring" data-id="pay"/); assert.doesNotMatch(markup, /data-action="skip-recurring" data-id="pay"/);
  assert.match(markup, /Overdue/); assert.match(markup, /Next Nov 26, 2026/);
  assert.match(markup, /Typical month<\/b> \+\$13,000\.00 in · −\$1,200\.00 out · net \+\$11,800\.00/);
  assert.match(markup, /Next 30 days<\/b> 4 scheduled · −\$0\.00 bills · \+\$12,000\.00 income/);
  assert.match(markup, /data-action="edit-recurring" data-id="pay"/); assert.match(markup, /data-section="recurring" data-id="pay"/);
});

test('a due weekly income item reports how many periods are due', async () => {
  const ctx = await appContext([pay({ nextDate: '2026-11-05' })]);
  assert.match(ctx.renderRecurringPanel(), /3 due · since Nov 5, 2026/);
  assert.match((await appContext([bill({ nextDate: TODAY })])).renderRecurringPanel(), /Due today/);
});

test('an empty panel explains itself and offers to add one', async () => {
  const markup = (await appContext([])).renderRecurringPanel();
  assert.match(markup, /No recurring items yet/); assert.match(markup, /data-action="add-recurring"/); assert.doesNotMatch(markup, /recurring-summary/);
});

test('descriptions are escaped and a missing account is labelled', async () => {
  const payload = '<img src=x onerror="alert(1)">';
  const markup = (await appContext([bill({ description: payload, accountId: 'gone' })])).renderRecurringPanel();
  assert.doesNotMatch(markup, /<img/); assert.match(markup, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/); assert.match(markup, /Unknown account/);
});

test('the Overview banner counts due items and is silent otherwise', async () => {
  assert.equal((await appContext([pay()])).renderRecurringBanner(), '');
  assert.match((await appContext([bill()])).renderRecurringBanner(), /1 recurring item is due/);
  assert.match((await appContext([bill(), bill({ id: 'b', nextDate: TODAY })])).renderRecurringBanner(), /2 recurring items are due/);
});

test('Post records the occurrence on its due date, updates the balance and moves to the next date', async () => {
  const ctx = await appContext([bill({ nextDate: '2026-10-31', anchorDay: 31 })]);
  ctx.postRecurring('rent');
  assert.equal(ctx.data.transactions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.data.transactions[0])), { id: 'new-1', description: 'Rent', amount: 1200, type: 'Expense', category: 'Housing', date: '2026-10-31', accountId: 'chk' });
  assert.equal(ctx.data.accounts[0].balance, -700); assert.equal(ctx.data.recurring[0].nextDate, '2026-11-30');
  assert.equal(ctx.log.saves, 1); assert.match(ctx.log.toasts[0], /Posted Rent/);
});

test('posting income adds to the balance', async () => {
  const ctx = await appContext([pay({ nextDate: TODAY })]);
  ctx.postRecurring('pay');
  assert.equal(ctx.data.accounts[0].balance, 3500); assert.equal(ctx.data.recurring[0].nextDate, '2026-11-26');
});

test('posting twice does not double-post: the second tap is refused', async () => {
  const ctx = await appContext([bill({ nextDate: TODAY })]);
  ctx.postRecurring('rent');
  const after = snapshot(ctx);
  ctx.postRecurring('rent');
  assert.equal(snapshot(ctx), after); assert.equal(ctx.log.saves, 1); assert.match(ctx.log.toasts.at(-1), /not due yet/);
});

test('catching up on missed periods posts them one at a time, oldest first', async () => {
  const ctx = await appContext([bill({ nextDate: '2026-09-01' })]);
  ctx.postRecurring('rent'); ctx.postRecurring('rent'); ctx.postRecurring('rent');
  assert.deepEqual(Array.from(ctx.data.transactions, t => t.date).sort(), ['2026-09-01', '2026-10-01', '2026-11-01']);
  assert.equal(ctx.data.recurring[0].nextDate, '2026-12-01'); ctx.postRecurring('rent');
  assert.equal(ctx.data.transactions.length, 3);
});

test('Post changes nothing when the account was removed or the item is unknown', async () => {
  const ctx = await appContext([bill({ accountId: 'gone' })]), before = snapshot(ctx);
  ctx.postRecurring('rent'); ctx.postRecurring('nope');
  assert.equal(snapshot(ctx), before); assert.equal(ctx.log.saves, 0); assert.match(ctx.log.toasts[0], /account for this item no longer exists/); assert.match(ctx.log.toasts[1], /could not be found/);
});

test('Skip moves to the next date and records nothing', async () => {
  const ctx = await appContext([bill()]);
  ctx.skipRecurring('rent');
  assert.equal(ctx.data.recurring[0].nextDate, '2026-12-01'); assert.equal(ctx.data.transactions.length, 0); assert.equal(ctx.data.accounts[0].balance, 500);
  ctx.skipRecurring('rent');
  assert.equal(ctx.data.recurring[0].nextDate, '2026-12-01'); assert.match(ctx.log.toasts.at(-1), /not due yet/); assert.equal(ctx.log.saves, 1);
});

test('the form saves a new recurring item with a tidy amount and its anchor day', async () => {
  const ctx = await appContext([]);
  submit(ctx, form({ description: '  Gym  ', amount: '24.999', nextDate: '2026-01-31' }));
  assert.deepEqual(ctx.log.errors, []); assert.equal(ctx.data.recurring.length, 1);
  const saved = JSON.parse(JSON.stringify(ctx.data.recurring[0]));
  assert.deepEqual(saved, { id: 'new-1', description: 'Gym', amount: 25, type: 'Expense', category: 'Health', accountId: 'chk', frequency: 'Monthly', nextDate: '2026-01-31', anchorDay: 31 });
  assert.match(ctx.log.toasts[0], /Recurring item saved/); assert.equal(ctx.data.transactions.length, 0); assert.equal(ctx.data.accounts[0].balance, 500);
});

test('the form rejects bad input and changes nothing', async () => {
  const bad = [[{ description: '  ' }, /Enter a description/], [{ amount: '0' }, /positive amount/], [{ amount: 'abc' }, /positive amount/], [{ nextDate: '2026-02-30' }, /valid next due date/], [{ nextDate: '' }, /valid next due date/],
    [{ frequency: 'Daily' }, /how often it repeats/], [{ type: 'Transfer' }, /type/], [{ accountId: '' }, /account/], [{ accountId: 'gone' }, /valid account/], [{ amount: '1e300' }, /1,000,000,000/], [{ amount: '1000000000.01' }, /1,000,000,000/]];
  for (const [over, pattern] of bad) {
    const ctx = await appContext([]), before = snapshot(ctx);
    submit(ctx, form(over));
    assert.equal(ctx.log.errors.length, 1, JSON.stringify(over)); assert.match(ctx.log.errors[0], pattern, JSON.stringify(over));
    assert.equal(snapshot(ctx), before, JSON.stringify(over)); assert.equal(ctx.log.saves, 0);
  }
  const ok = await appContext([]); submit(ok, form({ amount: '1000000000' })); assert.deepEqual(ok.log.errors, []); assert.equal(ok.data.recurring[0].amount, 1000000000);
});

test('editing keeps the original anchor day unless the date or frequency changes', async () => {
  const keep = await appContext([bill({ id: 'r', nextDate: '2026-02-28', anchorDay: 31 })]);
  submit(keep, form({ description: 'Rent v2', nextDate: '2026-02-28' }), 'r');
  assert.equal(keep.data.recurring[0].anchorDay, 31); assert.equal(keep.data.recurring[0].description, 'Rent v2'); assert.equal(keep.data.recurring.length, 1);
  const moved = await appContext([bill({ id: 'r', nextDate: '2026-02-28', anchorDay: 31 })]);
  submit(moved, form({ nextDate: '2026-03-15' }), 'r');
  assert.equal(moved.data.recurring[0].anchorDay, 15);
  const changed = await appContext([bill({ id: 'r', nextDate: '2026-02-28', anchorDay: 31 })]);
  submit(changed, form({ nextDate: '2026-02-28', frequency: 'Yearly' }), 'r');
  assert.equal(changed.data.recurring[0].anchorDay, 28);
});

test('editing a record that no longer exists is refused', async () => {
  const ctx = await appContext([]), before = snapshot(ctx);
  submit(ctx, form(), 'ghost');
  assert.match(ctx.log.errors[0], /no longer exists/); assert.equal(snapshot(ctx), before);
});

test('an account used by a recurring item cannot be deleted', async () => {
  const ctx = await appContext([bill()]), before = snapshot(ctx);
  await ctx.deleteItem('accounts', 'chk');
  assert.equal(snapshot(ctx), before); assert.match(ctx.log.toasts[0], /recurring items/);
  await ctx.deleteItem('accounts', 'sav');
  assert.deepEqual(Array.from(ctx.data.accounts, a => a.id), ['chk']);
});

test('deleting a recurring item removes only that item', async () => {
  const ctx = await appContext([bill(), pay()]);
  await ctx.deleteItem('recurring', 'rent');
  assert.deepEqual(Array.from(ctx.data.recurring, r => r.id), ['pay']); assert.equal(ctx.data.accounts[0].balance, 500);
});

test('loading and importing keep valid recurring items and drop malformed ones', async () => {
  const lib = await import('../recurring.mjs');
  const ctx = vm.createContext({ cleanRecurring: lib.cleanRecurring, cleanSplit: raw => ({ enabled: false, parts: [] }), blankData: () => ({ recurring: [], settings: { profile: {} } }) });
  vm.runInContext(section('function normalizeData(input){', 'function migrateSimpleTransactions('), ctx);
  const result = ctx.normalizeData({ accounts: [], transactions: [], budgets: [], goals: [], purchases: [], recurring: [bill(), { id: 'bad', amount: -1 }, null, 'x'] });
  assert.deepEqual(Array.from(result.recurring, r => r.id), ['rent']);
  assert.deepEqual(ctx.normalizeData({ accounts: [] }).recurring, []);
  assert.deepEqual(ctx.normalizeData({ accounts: [], recurring: 'nope' }).recurring, []);
});

test('the app is wired up: imports, Transactions panel, Overview banner, actions and a blank workspace', () => {
  assert.match(moduleScript, /from '\.\/recurring\.mjs';/);
  assert.match(section('function renderTransactions(', '\nfunction renderAccountBalanceBreakdown('), /\$\{renderRecurringPanel\(\)\}/);
  assert.match(section('function renderOverview(', '\nfunction renderTransactions('), /\$\{renderRecurringBanner\(\)\}/);
  for (const action of ['add-recurring', 'edit-recurring', 'post-recurring', 'skip-recurring']) assert.ok(moduleScript.includes(`case'${action}':`), action);
  assert.match(sourceLine('const blankData='), /recurring:\[\]/);
});
