const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const span=html.slice(html.indexOf('function renderTransactions('),html.indexOf('\nfunction renderAccountBalanceBreakdown('));
test('transaction totals cover the filtered list and exclude transfers',()=>{
  assert.match(span,/listIncome=roundMoney\(list\.filter\(t=>t\.type==='Income'\)/);
  assert.match(span,/listExpense=roundMoney\(list\.filter\(t=>t\.type==='Expense'\)/);
  assert.match(span,/data-tx-totals/);
  assert.match(span,/transfers excluded/);
});
