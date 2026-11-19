// Run with: node --test tests/recurring.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDate, addDays, nextOccurrence, cleanRecurring, dueItems, dueCount, upcomingOccurrences,
  monthlyEquivalent, monthlySummary, postOccurrence, skipOccurrence,
} from '../recurring.mjs';

const item = (over = {}) => ({ id: 'r1', description: 'Rent', amount: 1200, type: 'Expense', category: 'Housing', accountId: 'chk', frequency: 'Monthly', nextDate: '2026-11-01', anchorDay: 1, ...over });

test('parseDate accepts only real calendar dates', () => {
  assert.deepEqual(parseDate('2028-02-29'), { y: 2028, m: 2, d: 29 });
  for (const bad of ['2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '', null, undefined, 20261101, '2026-11-01T00:00']) assert.equal(parseDate(bad), null, String(bad));
});

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(addDays('2028-02-25', 7), '2028-03-03');
  assert.equal(addDays('nope', 7), null);
});

test('weekly items move seven days', () => {
  assert.equal(nextOccurrence('2026-11-19', 'Weekly'), '2026-11-26');
});

test('monthly items keep their day, clamping short months without drifting', () => {
  let date = '2026-01-31';
  const seen = [];
  for (let i = 0; i < 4; i++) { date = nextOccurrence(date, 'Monthly', 31); seen.push(date); }
  assert.deepEqual(seen, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(nextOccurrence('2026-12-15', 'Monthly', 15), '2027-01-15');
  assert.equal(nextOccurrence('2028-01-31', 'Monthly', 31), '2028-02-29');
});

test('without an anchor the date itself is used', () => {
  assert.equal(nextOccurrence('2026-03-30', 'Monthly'), '2026-04-30');
});

test('yearly items survive leap days', () => {
  assert.equal(nextOccurrence('2028-02-29', 'Yearly', 29), '2029-02-28');
  assert.equal(nextOccurrence('2029-02-28', 'Yearly', 29), '2030-02-28');
  assert.equal(nextOccurrence('2031-02-28', 'Yearly', 29), '2032-02-29');
});

test('invalid dates or frequencies have no next occurrence', () => {
  assert.equal(nextOccurrence('2026-02-30', 'Monthly'), null);
  assert.equal(nextOccurrence('2026-02-01', 'Daily'), null);
});

test('cleanRecurring keeps good items, tidies them and drops bad ones', () => {
  const good = item({ description: '  Rent  ', amount: '1200.005' });
  const kept = cleanRecurring([good, item({ id: 'r1' }), item({ id: 'r2', description: '   ' }), item({ id: 'r3', amount: 0 }), item({ id: 'r4', amount: -5 }),
    item({ id: 'r5', amount: 'abc' }), item({ id: 'r6', amount: 2e9 }), item({ id: 'r7', type: 'Transfer' }), item({ id: 'r8', frequency: 'Daily' }),
    item({ id: 'r9', nextDate: '2026-02-30' }), item({ id: '' }), item({ id: 'r10', accountId: '' }), null, 'x', 5, item({ id: 'r11', amount: '' }), item({ id: 'r12', amount: 0.004 })]);
  assert.deepEqual(kept.map(i => i.id), ['r1']);
  assert.equal(kept[0].description, 'Rent'); assert.equal(kept[0].amount, 1200.01);
});

test('cleanRecurring fills a missing category and anchor, and ignores non-arrays', () => {
  const [income] = cleanRecurring([item({ id: 'p', type: 'Income', category: undefined, anchorDay: undefined, nextDate: '2026-11-15' })]);
  assert.equal(income.category, 'Income'); assert.equal(income.anchorDay, 15);
  assert.equal(cleanRecurring([item({ category: '' , type: 'Expense' })])[0].category, 'Other');
  assert.deepEqual(cleanRecurring(undefined), []); assert.deepEqual(cleanRecurring({}), []);
});

test('dueItems returns items due today or earlier, oldest first', () => {
  const list = [item({ id: 'a', nextDate: '2026-11-19' }), item({ id: 'b', nextDate: '2026-11-01' }), item({ id: 'c', nextDate: '2026-11-20' })];
  assert.deepEqual(dueItems(list, '2026-11-19').map(i => i.id), ['b', 'a']);
  assert.deepEqual(dueItems(list, '2026-10-31'), []);
});

test('dueCount counts every missed period up to today', () => {
  assert.equal(dueCount(item({ nextDate: '2026-09-01' }), '2026-11-19'), 3);
  assert.equal(dueCount(item({ nextDate: '2026-11-19', frequency: 'Weekly' }), '2026-11-19'), 1);
  assert.equal(dueCount(item({ nextDate: '2026-12-01' }), '2026-11-19'), 0);
});

test('upcomingOccurrences lists future dates in the window, repeating weekly items', () => {
  const list = [item({ id: 'rent', nextDate: '2026-12-01' }), item({ id: 'gym', description: 'Gym', frequency: 'Weekly', nextDate: '2026-11-21', anchorDay: 21 }), item({ id: 'old', nextDate: '2026-11-01' })];
  const rows = upcomingOccurrences(list, '2026-11-19', 14);
  assert.deepEqual(rows.map(r => `${r.date} ${r.item.id}`), ['2026-11-21 gym', '2026-11-28 gym', '2026-12-01 rent']);
  assert.deepEqual(upcomingOccurrences(list, '2026-11-19', 0), []);
  assert.deepEqual(upcomingOccurrences(list, 'bad', 14), []);
});

test('monthly equivalents and summary', () => {
  assert.equal(monthlyEquivalent(item({ frequency: 'Yearly', amount: 120 })), 10);
  assert.ok(Math.abs(monthlyEquivalent(item({ frequency: 'Weekly', amount: 12 })) - 52) < 1e-9);
  const summary = monthlySummary([item({ amount: 1200 }), item({ id: 'p', type: 'Income', amount: 3000 }), item({ id: 'y', frequency: 'Yearly', amount: 120 }), item({ id: 'bad', amount: -1 })]);
  assert.deepEqual(summary, { income: 3000, expenses: 1210, net: 1790 });
  assert.deepEqual(monthlySummary([]), { income: 0, expenses: 0, net: 0 });
});

test('postOccurrence records the due date and advances, without changing its input', () => {
  const source = item({ nextDate: '2026-10-31', anchorDay: 31 }), before = JSON.stringify(source);
  const result = postOccurrence(source, '2026-11-19');
  assert.deepEqual(result.transaction, { description: 'Rent', amount: 1200, type: 'Expense', category: 'Housing', date: '2026-10-31', accountId: 'chk' });
  assert.equal(result.item.nextDate, '2026-11-30');
  assert.equal(JSON.stringify(source), before);
});

test('postOccurrence refuses an item that is not due or has a bad date', () => {
  assert.throws(() => postOccurrence(item({ nextDate: '2026-11-20' }), '2026-11-19'), /not due yet/);
  assert.throws(() => postOccurrence(item({ nextDate: '2026-02-30' }), '2026-11-19'), /invalid date/);
  assert.throws(() => postOccurrence(null, '2026-11-19'), /not due yet/);
});

test('skipOccurrence advances without recording anything', () => {
  assert.equal(skipOccurrence(item({ nextDate: '2026-11-01' })).nextDate, '2026-12-01');
  assert.throws(() => skipOccurrence(item({ nextDate: 'bad' })), /invalid date/);
  assert.throws(() => skipOccurrence(null), /invalid date/);
});
