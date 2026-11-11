// Run with: node --test tests/financial-graphs-view.test.mjs
// These render the real presentation module with synthetic records and no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderCashFlowGraph, renderCategoryGraph, renderTransactionGraph, renderAccountGraph,
  renderBudgetGraph, renderGoalGraph, renderPurchaseGraph, renderScenarioPanel, renderScenarioResult } from '../financial-graphs-view.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = value => format.format(value);
const tx = (type, amount, date, extras = {}) => ({ id: `${type}-${date}`, type, amount, date, accountId: 'checking', category: 'Food', ...extras });
const ledger = [tx('Income', 1200, '2026-10-01'), tx('Income', 200, '2026-11-01', { accountId: 'savings' }),
  tx('Expense', 50.25, '2026-11-02'), tx('Expense', 25, '2026-11-03', { category: 'Bills' }),
  tx('Transfer', 400, '2026-11-04', { toAccountId: 'savings' }),
  tx('Expense', 700, '2026-11-31'), tx('Expense', -1, '2026-11-06')];

test('the six-month activity chart uses exact recorded entries and excludes transfers', () => {
  const before = JSON.stringify(ledger), html = renderCashFlowGraph(ledger, '2026-11', money, esc);
  assert.match(html, /Jun 2026 – Nov 2026/);
  assert.match(html, /Income \$1,400\.00/);
  assert.match(html, /Spending \$75\.25/);
  assert.match(html, /Transfers are excluded; this is not a balance history/);
  assert.match(html, /2 entries could not be graphed/);
  assert.match(html, /View exact monthly amounts/);
  assert.match(html, /<th scope="row">Nov 2026<\/th><td>\$200\.00<\/td><td>\$75\.25/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.equal(JSON.stringify(ledger), before);
  assert.match(renderCashFlowGraph([], '2026-11', money, esc), /Your timeline starts here/);
});

test('unsafe aggregate totals defer to exact monthly values rather than overflow', () => {
  const html = renderCashFlowGraph([tx('Income', 70000000000000, '2026-10-01'), tx('Income', 70000000000000, '2026-11-01')], '2026-11', money, esc);
  assert.match(html, /Income · see monthly values/);
  assert.match(html, /\$70,000,000,000,000\.00/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('category charts escape arbitrary names and retain exact amounts for grouped categories', () => {
  const names = ['Food', 'Bills', 'Rent', 'Health', 'Books', 'Travel', '<img src=x onerror="alert(1)">', 'Other'];
  const records = names.map((category, index) => tx('Expense', 10 + index, '2026-11-01', { category }));
  const before = JSON.stringify(records), html = renderCategoryGraph(records, '2026-11', money, esc);
  assert.match(html, /Other 3 categories/);
  assert.match(html, /View all categories/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Total recorded spending: \$108\.00/);
  assert.equal(JSON.stringify(records), before);
  assert.match(renderCategoryGraph([], '2026-11', money, esc), /No spending recorded yet/);
});

test('transaction mix labels transfers separately and reports invalid amounts', () => {
  const html = renderTransactionGraph([tx('Income', 40, ''), tx('Expense', 10, ''), tx('Transfer', 25, ''), tx('Expense', 'bad', '')], money, esc);
  assert.match(html, /Income · 1/); assert.match(html, /Spending · 1/); assert.match(html, /Transfers · 1/);
  assert.match(html, /\$40\.00/); assert.match(html, /\$10\.00/); assert.match(html, /\$25\.00/);
  assert.match(html, /transfers are counted once and are not income or spending/);
  assert.match(html, /1 entry could not be graphed/);
  assert.match(renderTransactionGraph([], money, esc), /No matching amounts to chart/);
});

test('account views keep transfers on the correct side, disclose incomplete entries, and escape names', () => {
  const entries = [...ledger, tx('Transfer', 5, '2026-11-10')];
  const checking = renderAccountGraph({ id: 'checking', name: 'Checking "<one>"' }, entries, '2026-11', money, esc);
  const savings = renderAccountGraph({ id: 'savings', name: 'Savings' }, entries, '2026-11', money, esc);
  assert.match(checking, /not balance history/);
  assert.match(checking, /View exact monthly amounts for Checking &quot;&lt;one&gt;&quot;/);
  assert.match(checking, /Nov 2026<\/th><td>\$0\.00<\/td><td>\$475\.25/);
  assert.match(savings, /Nov 2026<\/th><td>\$600\.00<\/td><td>\$0\.00/);
  assert.match(checking, /3 entries could not be graphed/);
  assert.doesNotMatch(checking, /<one>/);
  assert.match(renderAccountGraph({ id: 'empty', name: 'Empty' }, [], '2026-11', money, esc), /No recorded inflows or outflows/);
});

test('budget charts use validated dated spending and show real over-limit percentages', () => {
  const budgets = [{ id: '1', category: 'Food', limit: 25 }, { id: '2', category: 'Bills', limit: 0 }];
  const before = JSON.stringify({ budgets, ledger });
  const html = renderBudgetGraph(budgets, ledger, '2026-11', money, esc);
  assert.match(html, /\$50\.25 \/ \$25\.00/); assert.match(html, /201% used · over the limit/);
  assert.match(html, /class="ns-list-fill is-over" style="width:100%"/);
  assert.match(html, /No positive limit/); assert.match(html, /2 entries could not be graphed/);
  assert.doesNotMatch(html, /\$750\.25/);
  assert.equal(JSON.stringify({ budgets, ledger }), before);
  assert.equal(renderBudgetGraph([], ledger, '2026-11', money, esc), '');
});

test('goal and purchase percentages disclose the uncapped amount and never guess missing values', () => {
  const goals = [{ name: '<Trip>', saved: 150, target: 100 }, { name: 'Missing', saved: null, target: 100 }];
  const goalHtml = renderGoalGraph(goals, money, esc);
  assert.match(goalHtml, /&lt;Trip&gt;/); assert.doesNotMatch(goalHtml, /<Trip>/);
  assert.match(goalHtml, /\$150\.00 of \$100\.00 · 150%/);
  assert.match(goalHtml, /Rings cap at 100%/); assert.match(goalHtml, /Add a valid target and saved amount/);
  const purchases = [{ id: 'open', name: 'Chair', price: 100, saved: 120, status: 'Saving', priority: 'High' },
    { id: 'linked', name: 'Linked item', price: 50, saved: 10, status: 'Planning' },
    { id: 'later', name: 'Later', price: 10, saved: 0, status: 'Postponed' },
    { id: 'missing', name: 'Missing amount', price: 10, saved: '', status: 'Ready' }];
  const before = JSON.stringify(purchases);
  const crossRealmSet = vm.runInNewContext("new Set(['linked'])");
  const purchaseHtml = renderPurchaseGraph(purchases, crossRealmSet, money, esc);
  assert.match(purchaseHtml, /120% set aside · \$0\.00 remaining/);
  assert.match(purchaseHtml, /No progress can be calculated/);
  assert.doesNotMatch(purchaseHtml, /Linked item|>Later</);
  assert.match(purchaseHtml, /Bars cap at 100%/);
  assert.equal(JSON.stringify(purchases), before);
});

test('scenario controls and output are explicit, escaped, and do not change goals', () => {
  const goal = { id: 'id"<x>', name: '<Trip>', saved: 100.25, target: 1000 }, before = JSON.stringify(goal);
  const panel = renderScenarioPanel([goal], esc);
  assert.match(panel, /value="id&quot;&lt;x&gt;"/); assert.match(panel, /&lt;Trip&gt;/);
  assert.match(panel, /Inputs are not saved/); assert.match(panel, /no interest or fees/);
  const html = renderScenarioResult(goal, ['25.50', '40'], money, esc);
  assert.match(html, /Scenario A · \$25\.50 \/ month/);
  assert.match(html, /After 12 months, A: <strong>\$406\.25/);
  assert.match(html, /After 12 months, B: <strong>\$580\.25/);
  assert.match(html, /Goal target: <strong>\$1,000\.00/);
  assert.match(html, /<th scope="row">3 months<\/th><td>\$176\.75<\/td><td>\$220\.25/);
  assert.match(renderScenarioResult(goal, ['', ''], money, esc), /Enter a monthly amount/);
  assert.match(renderScenarioResult(goal, ['-1', ''], money, esc), /non-negative/);
  assert.equal(JSON.stringify(goal), before);
});
