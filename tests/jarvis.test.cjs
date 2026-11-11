// Run with: node --test tests/jarvis.test.cjs
// Exercise the actual local Jarvis rules and draft routing without external packages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let runtime = html.match(/<script id="jarvis-runtime">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime, 'Jarvis runtime exists');
// Capture form requests in Node; the browser suite separately verifies real forms.
const first = runtime.indexOf('  function openActionDraft(');
const last = runtime.indexOf('\n  var pendingAction = null;', first);
assert.ok(first >= 0 && last > first, 'draft bridge exists');
runtime = runtime.slice(0, first) + '  function openActionDraft(action, values, itemId) { return window.captureDraft(action, values, itemId); }\n' + runtime.slice(last);

class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [2026, 10, 9, 12])); }
  static now() { return new Date(2026, 10, 9, 12).getTime(); }
}
function fixture() {
  return {
    version: 1,
    accounts: [
      { id: 'checking', name: 'Everyday Checking', type: 'Checking', balance: 1000.99, minimumBalance: 200 },
      { id: 'savings', name: 'Savings', type: 'Savings', balance: 9000.45, minimumBalance: 500, protectFromSpending: true },
    ],
    transactions: [
      { id: 'x', type: 'Expense', amount: 15.99, category: 'Food', description: 'Food Lion groceries', date: '2026-11-03', accountId: 'checking' },
      { id: 'y', type: 'Expense', amount: 30.25, category: 'Shopping', description: 'Food Lion supplies', date: '2026-11-04', accountId: 'checking' },
      { id: 'z', type: 'Expense', amount: 100.25, category: 'Food', description: 'Groceries', date: '2026-10-03', accountId: 'checking' },
      { id: 'pay', type: 'Income', amount: 500.75, category: 'Income', description: 'Pay', date: '2026-10-05', accountId: 'checking' },
    ],
    budgets: [{ id: 'food-budget', category: 'Food', limit: 200 }],
    goals: [{ id: 'goal', name: 'Emergency Fund', target: 1000, saved: 20.5 }],
    purchases: [{ id: 'plan', name: 'Computer', status: 'Planning', accountId: 'checking', price: 900, saved: 300, priority: 'High' }],
    settings: { currency: 'USD' },
  };
}
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function harness(data = fixture(), stores = {}) {
  let seen = true, shellInert = false, currentData = data, drafts = [];
  const local = stores.local || memoryStorage(), session = stores.session || memoryStorage();
  const document = { readyState: 'loading', addEventListener() {}, querySelector: () => ({ inert: shellInert }),
    documentElement: { classList: { contains: name => name === 'northstar-seen' ? seen : false } } };
  const window = { matchMedia: () => ({ matches: true }), NorthstarVaultLocked: false,
    NorthstarLedger: () => JSON.parse(JSON.stringify(currentData)),
    captureDraft(action, values, itemId) { drafts.push({ action, values: JSON.parse(JSON.stringify(values)), itemId }); return true; } };
  const context = vm.createContext({ window, document, localStorage: local, sessionStorage: session,
    navigator: {}, location: { origin: 'https://example.test' }, console, Intl, Date: FixedDate,
    AbortController, setTimeout, clearTimeout, fetch: () => { throw new Error('No real network in tests'); } });
  vm.runInContext(runtime, context);
  return { api: window.NorthstarJarvis, window, data, get drafts() { return drafts; },
    clearDrafts() { drafts = []; }, setSeen(value) { seen = value; }, setInert(value) { shellInert = value; },
    setData(value) { currentData = value; } };
}

test('uses cents, account minimums and active allocations without merging accounts or promising safety', () => {
  const h = harness();
  const answer = h.api.reply('Can I afford $900 from Everyday Checking?');
  assert.match(answer, /\$900\.00 exceeds the \$500\.99 remaining in Everyday Checking/);
  assert.match(answer, /\$200\.00 minimum and \$300\.00.*allocations/);
  assert.match(answer, /not a bank-verified balance.*future bills or savings goals/);
  assert.doesNotMatch(answer, /\$10,001\.44/);
  assert.match(h.api.reply('Can I afford $-50 from Everyday Checking?'), /non-negative/i);
  assert.match(h.api.reply('How much can I safely spend per day?'), /need income recorded/i);
  const overAllocated = fixture(); overAllocated.accounts[0].balance = 450;
  const shortfall = harness(overAllocated).api.reply('Can I afford $1 from Everyday Checking?');
  assert.match(shortfall, /\$0\.00 remaining/);
  assert.match(shortfall, /\$50\.00 below the minimum plus allocations/);
  const brief = h.api.brief(h.api.snapshot());
  assert.equal(brief.accounts.trackedTotal, 10001.44);
  assert.match(brief.accounts.note, /not spendable cash/);
  assert.equal('available' in brief.accounts, false);
  assert.equal('recentTransactions' in brief, false);
  assert.ok(!JSON.stringify(brief).includes('Food Lion groceries'));
});

test('handles monthly and account follow-ups without losing their subject', () => {
  const h = harness();
  const overall = h.api.reply('How much did I spend this month?');
  assert.match(overall, /\$54\.01 less/);
  assert.doesNotMatch(overall, /-\$54\.01 less/, 'a decrease must not be described with a double negative');
  assert.match(h.api.reply('How much did I spend on food this month?'), /\$15\.99 on Food this month/);
  assert.match(h.api.reply('last month?'), /\$100\.25 on Food last month/);
  assert.match(h.api.reply('How much did I earn last month?'), /\$500\.75.*last month/);
  assert.match(h.api.reply('How much did I spend in January 2024?'), /january 2024/i);
  assert.match(h.api.reply('How much did I spend on dining this month?'), /Food.*includes other Food entries/i);
  assert.match(h.api.reply('Can I afford $300?'), /Which account would fund/);
  assert.match(h.api.reply('checking'), /\$300\.00 fits within the \$500\.99 remaining in Everyday Checking/);
  assert.match(h.api.reply('Can I afford it from savings?'), /What amount/);
  assert.match(h.api.reply('$450'), /\$450\.00 fits within the \$8,500\.45 remaining in Savings/);
});

test('daily estimates do not turn a recorded shortfall into a false zero calculation', () => {
  const data = fixture();
  data.transactions.push({ id: 'pay-now', type: 'Income', amount: 10, category: 'Income', date: '2026-11-05', accountId: 'checking' });
  const h = harness(data);
  const answer = h.api.reply('How much can I spend per day?');
  assert.match(answer, /expenses exceed recorded income by \$36\.24/i);
  assert.match(answer, /no positive amount left/i);
  assert.match(answer, /not a safe-spending guarantee/i);
  assert.match(h.api.reply('What should I do next?'), /income recorded so far|future bills/i);
  assert.equal(h.api.draftMoneyAction('What is my balance at $20?'), null, 'a question is not a balance edit');
  assert.equal(h.drafts.length, 0);
});

test('a merchant name containing a category is matched as a description, not a whole category', () => {
  const h = harness();
  const answer = h.api.reply('How much did I spend at Food Lion this month?');
  assert.match(answer, /\$46\.24.*2 expenses.*Food Lion.*description/i);
  assert.doesNotMatch(answer, /\$15\.99 on Food/);
  assert.match(h.api.reply('what about last month?'), /No expense descriptions containing.*Food Lion.*last month/i);
});

test('drafts concrete amounts, dates and account directions without changing records', () => {
  const h = harness(), before = JSON.stringify(h.data);
  assert.match(h.api.draftMoneyAction('I spent $24.35 at Safeway yesterday from Everyday Checking'), /review every field/i);
  assert.equal(h.drafts[0].action, 'add-transaction');
  assert.deepEqual(h.drafts[0].values, { description: 'Safeway', amount: '24.35', type: 'Expense', category: 'Other', accountId: 'checking', date: '2026-11-08' });
  h.clearDrafts();
  assert.match(h.api.draftMoneyAction('transfer $100 from Everyday Checking to Savings'), /does not move money/i);
  assert.equal(h.drafts[0].values.accountId, 'checking');
  assert.equal(h.drafts[0].values.toAccountId, 'savings');
  h.clearDrafts();
  h.api.draftMoneyAction('transfer $100');
  assert.equal(h.drafts[0].values.accountId, '');
  assert.equal(h.drafts[0].values.toAccountId, '');
  assert.equal(JSON.stringify(h.data), before, 'drafting must not mutate financial data');
});

test('asks for ambiguous or missing details rather than guessing or losing numeric names', () => {
  const h = harness();
  assert.match(h.api.draftMoneyAction('I bought PlayStation 5'), /What amount/);
  assert.match(h.api.draftMoneyAction('$499.99'), /drafted an expense/i);
  assert.equal(h.drafts[0].values.amount, '499.99');
  assert.match(h.drafts[0].values.description, /PlayStation 5/i);
  h.clearDrafts();
  assert.match(h.api.draftMoneyAction('I spent $20 and $30'), /more than one amount/i);
  assert.match(h.api.draftMoneyAction('I spent -$20'), /positive amount/i);
  assert.equal(h.drafts.length, 0);
  assert.match(h.api.draftMoneyAction('set my balance to -$42.10'), /Which account/i);
  assert.match(h.api.draftMoneyAction('Everyday Checking'), /review/i);
  assert.equal(h.drafts[0].values.balance, '-42.10');
  assert.equal(h.drafts[0].itemId, 'checking');
});

test('drafts budgets, goal contributions, goals and plans through reviewable forms', () => {
  const h = harness(), before = JSON.stringify(h.data);
  h.api.draftMoneyAction('set a food budget');
  h.api.draftMoneyAction('$250.50');
  assert.equal(h.drafts[0].action, 'edit-budget');
  assert.equal(h.drafts[0].itemId, 'food-budget');
  assert.equal(h.drafts[0].values.limit, '250.50');
  h.clearDrafts();
  h.api.draftMoneyAction('add $10.25 to Emergency Fund');
  assert.equal(h.drafts[0].action, 'edit-goal');
  assert.equal(h.drafts[0].values.saved, '30.75');
  h.clearDrafts();
  assert.match(h.api.draftMoneyAction('create a savings goal for $1,000'), /What should I call/);
  h.api.draftMoneyAction('Trip');
  assert.equal(h.drafts[0].action, 'add-goal');
  assert.equal(h.drafts[0].values.name, 'Trip');
  h.clearDrafts();
  assert.match(h.api.draftMoneyAction('plan a purchase for $450'), /What should I call/);
  h.api.draftMoneyAction('Desk');
  assert.equal(h.drafts[0].action, 'add-purchase');
  assert.equal(h.drafts[0].values.name, 'Desk');
  assert.equal(h.drafts[0].values.price, '450.00');
  assert.equal(JSON.stringify(h.data), before);
});

test('duplicates and unavailable workspaces cannot silently select or open a draft', () => {
  const data = fixture();
  data.accounts.push({ id: 'other-checking', name: 'Second Checking', type: 'Checking', balance: 50 });
  data.goals.push({ id: 'duplicate', name: 'Emergency Fund', target: 500, saved: 0 });
  const h = harness(data);
  assert.match(h.api.reply('Can I afford $20 from checking?'), /Which account/);
  h.api.draftMoneyAction('I spent $20 from checking');
  assert.equal(h.drafts[0].values.accountId, '', 'ambiguous account stays unselected');
  h.clearDrafts();
  assert.match(h.api.draftMoneyAction('add $10 to Emergency Fund'), /More than one goal/i);
  assert.equal(h.drafts.length, 0);
  h.setInert(true);
  assert.match(h.api.draftMoneyAction('I spent $20'), /finish loading/i);
  assert.equal(h.drafts.length, 0);
  h.setInert(false); h.window.NorthstarVaultLocked = true;
  assert.match(h.api.reply('what is my balance?'), /cannot read/i);
  assert.match(h.api.draftMoneyAction('I spent $20'), /Unlock/i);
  assert.equal(h.drafts.length, 0);
  h.window.NorthstarVaultLocked = false; h.setSeen(false);
  assert.match(h.api.draftMoneyAction('I spent $20'), /Unlock or finish loading/i);
});

test('connection storage handles failed access and conflicting copies without silently enabling cloud', () => {
  const key = 'northstar-jarvis-conn-v1';
  const session = memoryStorage({ [key]: JSON.stringify({ key: 'session-only', enabled: true, remember: false }) });
  const local = memoryStorage();
  const getLocal = local.getItem;
  local.getItem = name => { if (name === key) throw new Error('blocked'); return getLocal(name); };
  const blocked = harness(fixture(), { local, session });
  assert.equal(blocked.api.conn().key, 'session-only', 'session is still read when local storage is blocked');
  assert.equal(blocked.api.conn().enabled, false, 'unreadable copies do not re-enable cloud');

  const first = memoryStorage({ [key]: JSON.stringify({ key: 'old-key', enabled: true, remember: true }) });
  const second = memoryStorage({ [key]: JSON.stringify({ key: 'new-key', enabled: false, remember: false }) });
  const conflict = harness(fixture(), { local: first, session: second });
  assert.equal(conflict.api.conn().enabled, false, 'conflicting copies must not reactivate the old connection');
  conflict.api.setConn({ key: 'replacement', remember: false, enabled: false });
  assert.equal(first.getItem(key), null);
  assert.equal(JSON.parse(second.getItem(key)).key, 'replacement');
  conflict.api.clearConn();
  assert.equal(JSON.parse(second.getItem(key)).key, '');
  assert.equal(conflict.api.conn().enabled, false);
});
