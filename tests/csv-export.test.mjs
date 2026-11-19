// Run with: node --test tests/csv-export.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { transactionsToCsv, CSV_COLUMNS } from '../csv-export.mjs';

const accounts = [{ id: 'chk', name: 'Everyday checking' }, { id: 'sav', name: 'Savings' }];
const HEADER = 'Date,Type,Description,Category,Account,Transfer to,Amount';

test('writes a header, CRLF line endings and newest-first rows with account names', () => {
  const csv = transactionsToCsv([
    { id: 'a', date: '2026-11-01', type: 'Expense', description: 'Coffee', category: 'Food', accountId: 'chk', amount: 4.5 },
    { id: 'b', date: '2026-11-09', type: 'Income', description: 'Paycheck', category: 'Income', accountId: 'chk', amount: '1200' },
    { id: 'c', date: '2026-11-05', type: 'Transfer', description: 'To savings', category: 'Other', accountId: 'chk', toAccountId: 'sav', amount: 50 },
  ], accounts);
  assert.equal(CSV_COLUMNS.join(','), HEADER);
  assert.equal(csv, [HEADER,
    '2026-11-09,Income,Paycheck,Income,Everyday checking,,1200.00',
    '2026-11-05,Transfer,To savings,Other,Everyday checking,Savings,50.00',
    '2026-11-01,Expense,Coffee,Food,Everyday checking,,4.50', ''].join('\r\n'));
});

test('quotes commas, quotes and line breaks', () => {
  const csv = transactionsToCsv([{ id: 'a', date: '2026-11-01', type: 'Expense', description: 'Lunch, "big" one\nline two', category: 'Food', accountId: 'chk', amount: 12 }], accounts);
  assert.equal(csv.split('\r\n')[1], '2026-11-01,Expense,"Lunch, ""big"" one\nline two",Food,Everyday checking,,12.00');
});

test('neutralizes text a spreadsheet could run as a formula, and leaves normal text alone', () => {
  const row = description => transactionsToCsv([{ id: 'a', date: '2026-11-01', type: 'Expense', description, category: 'Food', accountId: 'chk', amount: 1 }], accounts).split('\r\n')[1].split(',')[2];
  for (const bad of ['=SUM(A1:A9)', '+1', '-1 refund', '@cmd', '\tx', '\rx']) assert.ok(row(bad).replace(/^"/, '').startsWith("'"), JSON.stringify(bad));
  for (const fine of ['Groceries', 'Rent 2026-11', "'quoted", 'a=b']) assert.equal(row(fine), fine);
});

test('applies the formula guard to category and account names too', () => {
  const csv = transactionsToCsv([{ id: 'a', date: '2026-11-01', type: 'Transfer', description: 'x', category: '=evil()', accountId: 'bad', toAccountId: 'bad2', amount: 1 }],
    [{ id: 'bad', name: '@name' }, { id: 'bad2', name: '+name' }]);
  assert.equal(csv.split('\r\n')[1], "2026-11-01,Transfer,x,'=evil(),'@name,'+name,1.00");
});

test('handles unknown accounts, missing or invalid amounts, and junk entries', () => {
  const csv = transactionsToCsv([null, 'x', 7, { id: 'a', date: '2026-11-01', type: 'Expense', description: 'Gone', category: 'Food', accountId: 'deleted' },
    { id: 'b', date: '2026-11-02', type: 'Expense', description: 'Bad', category: 'Food', accountId: 'chk', amount: 'abc' },
    { id: 'c', date: '2026-11-03', type: 'Expense', description: 'Null', category: 'Food', accountId: 'chk', amount: null },
    { id: 'd', date: '2026-11-04', type: 'Expense', description: 'NoAccount', category: 'Food', amount: 2 }], accounts);
  assert.deepEqual(csv.split('\r\n'), [HEADER,
    '2026-11-04,Expense,NoAccount,Food,,,2.00',
    '2026-11-03,Expense,Null,Food,Everyday checking,,',
    '2026-11-02,Expense,Bad,Food,Everyday checking,,',
    '2026-11-01,Expense,Gone,Food,Unknown account,,', '']);
});

test('only transfers list a destination account', () => {
  const csv = transactionsToCsv([{ id: 'a', date: '2026-11-01', type: 'Expense', description: 'x', category: 'Food', accountId: 'chk', toAccountId: 'sav', amount: 1 }], accounts);
  assert.equal(csv.split('\r\n')[1], '2026-11-01,Expense,x,Food,Everyday checking,,1.00');
});

test('returns only the header for empty or malformed input and never changes its input', () => {
  assert.equal(transactionsToCsv(undefined, undefined), HEADER + '\r\n');
  assert.equal(transactionsToCsv('nope', { not: 'an array' }), HEADER + '\r\n');
  const input = [{ id: 'a', date: '2026-11-01', type: 'Expense', description: 'A', category: 'Food', accountId: 'chk', amount: 1 },
    { id: 'b', date: '2026-11-09', type: 'Expense', description: 'B', category: 'Food', accountId: 'chk', amount: 2 }];
  const before = JSON.stringify(input), accountsBefore = JSON.stringify(accounts);
  transactionsToCsv(input, accounts);
  assert.equal(JSON.stringify(input), before); assert.equal(JSON.stringify(accounts), accountsBefore);
  assert.deepEqual(input.map(tx => tx.id), ['a', 'b']);
});
