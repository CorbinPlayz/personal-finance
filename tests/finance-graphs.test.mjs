// Run with: node --test tests/finance-graphs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { graphAmount, graphMonthFromDate, graphMonths, monthlyGraph, categoryGraph, transactionGraph, goalScenarioGraph } from '../finance-graphs.mjs';

const record = (type, amount, date, extras = {}) => ({ type, amount, date, accountId: 'spending', ...extras });

test('validates calendar dates and rolls month windows across years without guessing', () => {
  assert.equal(graphMonthFromDate('2024-02-29'), '2024-02');
  assert.equal(graphMonthFromDate('2025-02-29'), null);
  assert.equal(graphMonthFromDate('2026-02-31'), null);
  assert.equal(graphMonthFromDate('2026-11'), null);
  assert.equal(graphMonthFromDate(20261109), null);
  assert.deepEqual(graphMonths('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(graphMonths('2026-13', 6), []);
  assert.deepEqual(graphMonths('2026-11', 25), []);
});

test('global monthly activity counts income and expenses once and excludes transfers', () => {
  const entries = [record('Income', 100.25, '2026-10-02'), record('Income', 25.5, '2026-10-09'),
    record('Expense', 20.75, '2026-11-03'), record('Transfer', 200, '2026-11-05', { toAccountId: 'savings' }),
    record('Expense', 5, '2026-02-31'), record('Income', -10, '2026-11-06'), record('Expense', 99, '2025-01-01')];
  const before = JSON.stringify(entries), graph = monthlyGraph(entries, '2026-11', 3);
  assert.deepEqual(graph.rows, [
    { month: '2026-09', incoming: 0, outgoing: 0, count: 0 },
    { month: '2026-10', incoming: 125.75, outgoing: 0, count: 2 },
    { month: '2026-11', incoming: 0, outgoing: 20.75, count: 1 },
  ]);
  assert.equal(graph.excluded, 2);
  assert.equal(graph.hasRecords, true);
  assert.equal(JSON.stringify(entries), before, 'charting must not change records');
});

test('account charts keep accounts separate and include both sides of a valid transfer', () => {
  const entries = [record('Income', 80.10, '2026-11-01'), record('Expense', 15.25, '2026-11-03'),
    record('Transfer', 20, '2026-11-04', { toAccountId: 'savings' }),
    record('Income', 600, '2026-11-05', { accountId: 'savings' }),
    record('Transfer', 9, '2026-11-06', { toAccountId: 'spending' })];
  assert.deepEqual(monthlyGraph(entries, '2026-11', 1, 'spending').rows[0],
    { month: '2026-11', incoming: 80.10, outgoing: 35.25, count: 3 });
  assert.deepEqual(monthlyGraph(entries, '2026-11', 1, 'savings').rows[0],
    { month: '2026-11', incoming: 620, outgoing: 0, count: 2 });
  assert.equal(monthlyGraph(entries, '2026-11', 1, 'other').hasRecords, false);
  assert.equal(monthlyGraph(entries, '2026-11', 1, 'spending').excluded, 1, 'a transfer to the same account is not a valid flow');
});

test('incomplete transfers do not invent account inflows or outflows', () => {
  const entries = [record('Transfer', 40, '2026-11-02'),
    record('Transfer', 60, '2026-11-03', { accountId: '', toAccountId: 'savings' }),
    record('Transfer', 70, '2026-10-03', { toAccountId: '' }),
    record('Transfer', 10, '2026-11-04', { toAccountId: 'savings' })];
  const spending = monthlyGraph(entries, '2026-11', 1, 'spending');
  const savings = monthlyGraph(entries, '2026-11', 1, 'savings');
  assert.deepEqual(spending.rows[0], { month: '2026-11', incoming: 0, outgoing: 10, count: 1 });
  assert.equal(spending.excluded, 1, 'an invalid transfer outside the window is not counted');
  assert.deepEqual(savings.rows[0], { month: '2026-11', incoming: 10, outgoing: 0, count: 1 });
  assert.equal(savings.excluded, 1);
  assert.equal(monthlyGraph(entries, '2026-11', 1).excluded, 0, 'global activity ignores all transfers');
});

test('amount validation rejects missing, negative, nonnumeric and unsupported values', () => {
  for (const value of [null, undefined, '', '   ', 'no', -1, Infinity, '999999999999999']) assert.equal(graphAmount(value), null);
  assert.equal(graphAmount(0), 0);
  assert.equal(graphAmount('2.345'), 2.35);
  assert.equal(graphAmount('9.99'), 9.99);
});

test('expense categories use actual valid amounts and preserve arbitrary category names as data', () => {
  const entries = [record('Expense', 12.35, '2026-11-01', { category: 'Food' }),
    record('Expense', 5.4, '2026-11-02', { category: 'Food' }),
    record('Expense', 3.25, '2026-11-03', { category: '<script>' }),
    record('Expense', 4, '2026-11-04', { category: '' }),
    record('Income', 99, '2026-11-04', { category: 'Food' }),
    record('Expense', 15, '2026-10-04', { category: 'Food' }),
    record('Expense', 5, '2026-02-31', { category: 'Food' })];
  const result = categoryGraph(entries, '2026-11');
  assert.deepEqual(result.items, [{ category: 'Food', amount: 17.75 }, { category: 'Uncategorized', amount: 4 }, { category: '<script>', amount: 3.25 }]);
  assert.equal(result.total, 25); assert.equal(result.count, 4); assert.equal(result.excluded, 1);
});

test('transaction mix counts only matching records and does not mislabel transfers as income or expense', () => {
  const result = transactionGraph([record('Income', 30, ''), record('Expense', 2.35, ''),
    record('Transfer', 20, ''), record('Expense', 'bad', ''), record('Unknown', 500, '')]);
  assert.deepEqual(result.groups, [{ type: 'Income', amount: 30, count: 1 }, { type: 'Expense', amount: 2.35, count: 1 }, { type: 'Transfer', amount: 20, count: 1 }]);
  assert.equal(result.total, 52.35); assert.equal(result.excluded, 1);
});

test('what-if goals calculate explicitly entered monthly amounts without saving or assuming interest', () => {
  const goal = { name: 'Trip', saved: 100.25, target: 1000 }, before = JSON.stringify(goal);
  const result = goalScenarioGraph(goal, ['25.50', '40']);
  assert.deepEqual(result.scenarios[0], { label: 'A', monthly: 25.5, points: [{ months: 0, amount: 100.25 }, { months: 3, amount: 176.75 }, { months: 6, amount: 253.25 }, { months: 12, amount: 406.25 }] });
  assert.equal(result.scenarios[1].points[3].amount, 580.25);
  assert.equal(result.target, 1000); assert.equal(JSON.stringify(goal), before);
  assert.equal(goalScenarioGraph(goal, ['', '']).scenarios.length, 0);
  assert.equal(goalScenarioGraph(goal, ['0', '']).scenarios[0].points[3].amount, 100.25);
  assert.match(goalScenarioGraph(goal, ['-1', '']).error, /non-negative/i);
  assert.match(goalScenarioGraph(goal, ['999999999999999', '']).error, /valid/i);
  assert.match(goalScenarioGraph({ target: 0, saved: 0 }, ['2', '']).error, /positive target/i);
});
