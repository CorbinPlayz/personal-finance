/* Realistic fake ledger for the test branch preview. Deterministic (same seed = same data),
   relative to "today" so charts always look current. Never used on the real site. */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const r2 = n => Math.round(n * 100) / 100;

const SHOPS = {
  Food: ['Trader Joe\'s', 'Whole Foods', 'Chipotle', 'Starbucks', 'DoorDash', 'Local bakery', 'Sushi Nori', 'Shake Shack'],
  Transport: ['Shell gas', 'Uber', 'Metro card', 'Parking garage', 'Lyft'],
  Shopping: ['Amazon', 'Target', 'Nike', 'Apple Store', 'IKEA', 'Zara'],
  Entertainment: ['Netflix', 'Spotify', 'Cinema', 'Concert tickets', 'Steam', 'Bowling night'],
  Bills: ['Electric company', 'Internet', 'Phone plan', 'Water'],
  Health: ['Pharmacy', 'Gym membership', 'Dentist', 'Vitamins'],
  Education: ['Udemy course', 'Textbooks', 'Coursera'],
};
const RANGE = { Food: [6, 58], Transport: [5, 62], Shopping: [14, 160], Entertainment: [9, 70], Bills: [30, 120], Health: [12, 90], Education: [15, 120] };

export function buildDemoLedger(now = new Date()) {
  const rand = rng(20261125), pick = a => a[Math.floor(rand() * a.length)];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = addDays(today, -400);
  const accounts = [
    { id: 'acc-checking', name: 'Everyday Checking', type: 'Checking', balance: 0, minimumBalance: 500 },
    { id: 'acc-savings', name: 'High-Yield Savings', type: 'Savings', balance: 0, minimumBalance: 1000 },
    { id: 'acc-cash', name: 'Cash Wallet', type: 'Cash', balance: 0 },
    { id: 'acc-card', name: 'Rewards Credit Card', type: 'Credit', balance: 0 },
  ];
  const bal = { 'acc-checking': 3200, 'acc-savings': 8500, 'acc-cash': 120, 'acc-card': 0 };
  const txs = []; let n = 0;
  const add = (date, type, amount, accountId, category, description, extra = {}) => {
    amount = r2(amount); if (amount <= 0) return;
    txs.push({ id: 'tx' + (++n).toString(36) + Math.floor(rand() * 1e5).toString(36), date: iso(date), type, amount, accountId, category, description, ...extra });
    if (type === 'Income') bal[accountId] += amount; else if (type === 'Expense') bal[accountId] -= amount;
    else { bal[accountId] -= amount; bal[extra.toAccountId] += amount; }
  };
  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    const dom = d.getDate(), dow = d.getDay();
    if (dom === 1 || dom === 15) add(d, 'Income', 2650 + (dom === 15 ? 40 : 0), 'acc-checking', 'Income', 'Paycheck — Brightline Studio');
    if (dom === 1) add(d, 'Expense', 1480, 'acc-checking', 'Housing', 'Rent');
    if (dom === 2 || dom === 17) add(d, 'Transfer', 160, 'acc-checking', 'Other', 'ATM cash withdrawal', { toAccountId: 'acc-cash' });
    if (dom === 3) add(d, 'Transfer', 600, 'acc-checking', 'Other', 'Monthly savings transfer', { toAccountId: 'acc-savings' });
    if (dom === 5) add(d, 'Expense', 14.99, 'acc-card', 'Entertainment', 'Netflix');
    if (dom === 6) add(d, 'Expense', 10.99, 'acc-card', 'Entertainment', 'Spotify');
    if (dom === 8) add(d, 'Expense', 85.4 + rand() * 40, 'acc-checking', 'Bills', 'Electric company');
    if (dom === 10) add(d, 'Expense', 65, 'acc-checking', 'Bills', 'Internet');
    if (dom === 12) add(d, 'Expense', 45, 'acc-checking', 'Bills', 'Phone plan');
    if (dom === 20) add(d, 'Expense', 39.99, 'acc-card', 'Health', 'Gym membership');
    if (dom === 28 && rand() < 0.6) add(d, 'Income', 120 + rand() * 260, 'acc-savings', 'Income', 'Freelance design payment');
    if (dom === 30) add(d, 'Income', 18 + rand() * 9, 'acc-savings', 'Income', 'Savings interest');
    if (dow === 6 && rand() < 0.9) add(d, 'Expense', 70 + rand() * 60, 'acc-card', 'Food', pick(['Trader Joe\'s', 'Whole Foods']));
    const extras = rand() < 0.55 ? 1 + (rand() < 0.3 ? 1 : 0) : 0;
    for (let i = 0; i < extras; i++) {
      const cat = pick(['Food', 'Food', 'Food', 'Transport', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Education', 'Bills']);
      const [lo, hi] = RANGE[cat], big = cat === 'Shopping' && rand() < 0.08;
      add(d, 'Expense', big ? 180 + rand() * 340 : lo + rand() * (hi - lo), pick(['acc-card', 'acc-card', 'acc-checking', 'acc-checking', 'acc-cash']), cat, pick(SHOPS[cat]));
    }
    if (dom === 25) { const owed = Math.max(0, -bal['acc-card']); if (owed > 50) add(d, 'Transfer', Math.min(owed, 900), 'acc-checking', 'Bills', 'Credit card payment', { toAccountId: 'acc-card' }); }
  }
  accounts.forEach(a => { a.balance = r2(bal[a.id]); });
  const day = n => iso(addDays(today, n));
  const nextOn = (dom) => { let d = new Date(today.getFullYear(), today.getMonth(), dom); if (d <= today) d = new Date(today.getFullYear(), today.getMonth() + 1, dom); return iso(d); };
  return {
    version: 1, accounts, transactions: txs,
    budgets: [['Food', 650], ['Transport', 260], ['Shopping', 380], ['Entertainment', 180], ['Bills', 460], ['Health', 160], ['Education', 160]].map(([category, limit], i) => ({ id: 'bud' + i, category, limit })),
    goals: [
      { id: 'goal-ef', name: 'Emergency fund', saved: 6200, target: 10000, dueDate: day(220) },
      { id: 'goal-trip', name: 'Tokyo trip', saved: 1850, target: 3500, dueDate: day(150) },
      { id: 'goal-car', name: 'Car down payment', saved: 2400, target: 8000, dueDate: day(400) },
      { id: 'goal-laptop', name: 'New laptop', saved: 1180, target: 1600, dueDate: day(60) },
    ],
    purchases: [
      { id: 'pur1', name: 'Standing desk', price: 420, saved: 260, status: 'Saving', priority: 'High', date: day(18), category: 'Shopping', accountId: 'acc-checking', reminderDays: [3, 0] },
      { id: 'pur2', name: 'Noise-cancelling headphones', price: 349, saved: 349, status: 'Ready', priority: 'Medium', date: day(5), category: 'Shopping', accountId: 'acc-savings', reminderDays: [1, 0] },
      { id: 'pur3', name: 'Winter jacket', price: 210, saved: 40, status: 'Planning', priority: 'Low', date: day(40), category: 'Shopping', accountId: 'acc-checking' },
      { id: 'pur4', name: 'Concert tickets', price: 180, saved: 180, status: 'Purchased', priority: 'Medium', date: day(-20), category: 'Entertainment', accountId: 'acc-card' },
    ],
    recurring: [
      { id: 'rec1', description: 'Paycheck — Brightline Studio', amount: 2650, type: 'Income', category: 'Income', accountId: 'acc-checking', frequency: 'Monthly', nextDate: nextOn(1), anchorDay: 1 },
      { id: 'rec2', description: 'Rent', amount: 1480, type: 'Expense', category: 'Housing', accountId: 'acc-checking', frequency: 'Monthly', nextDate: nextOn(1), anchorDay: 1 },
      { id: 'rec3', description: 'Netflix', amount: 14.99, type: 'Expense', category: 'Entertainment', accountId: 'acc-card', frequency: 'Monthly', nextDate: nextOn(5), anchorDay: 5 },
      { id: 'rec4', description: 'Gym membership', amount: 39.99, type: 'Expense', category: 'Health', accountId: 'acc-card', frequency: 'Monthly', nextDate: nextOn(20), anchorDay: 20 },
    ],
    /* Two lots are older than five years on purpose: the 1.0 stock charts must handle them. */
    holdings: [
      { id: 'h1', symbol: 'AAPL', shares: 12, buyPrice: 58.4, buyDate: iso(new Date(today.getFullYear() - 7, 2, 11)) },
      { id: 'h2', symbol: 'MSFT', shares: 6, buyPrice: 142.1, buyDate: iso(new Date(today.getFullYear() - 6, 8, 3)) },
      { id: 'h3', symbol: 'NVDA', shares: 8, buyPrice: 38.9, buyDate: iso(new Date(today.getFullYear() - 3, 4, 20)) },
      { id: 'h4', symbol: 'VOO', shares: 5, buyPrice: 390.5, buyDate: iso(new Date(today.getFullYear() - 2, 0, 9)) },
      { id: 'h5', symbol: 'AAPL', shares: 4, buyPrice: 171.2, buyDate: iso(new Date(today.getFullYear() - 1, 5, 14)) },
    ],
    portfolioHistory: [],
    settings: { currency: 'USD', goalSounds: true, stockWatchlist: ['AAPL', 'MSFT', 'NVDA', 'VOO', 'AMZN', 'GOOGL', 'TSLA'], profile: { monthlyIncome: '5300', essentialBills: '2100', cushion: '1000', payFrequency: 'biweekly', payDay: '1', goalFocus: 'Emergency fund first, then the Tokyo trip', notes: 'Demo data for the test branch.' }, guideMemory: null },
  };
}
