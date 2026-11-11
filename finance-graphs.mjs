/*
 * Read-only models for Northstar's financial graphs.
 * These functions use recorded entries only; they never update the ledger.
 */
const MAX_CENTS = Number.MAX_SAFE_INTEGER;

function cents(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const result = Math.round((amount + Number.EPSILON) * 100);
  return Number.isSafeInteger(result) ? result : null;
}

function addCents(current, addition) {
  return Number.isSafeInteger(current + addition) ? current + addition : null;
}

/* Reject impossible and partial dates rather than moving them into another month. */
export function graphMonthFromDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1] ? `${match[1]}-${match[2]}` : null;
}

export function graphMonths(endMonth, count = 6) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(endMonth || ''));
  const n = Number(count);
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1 || Number(match[2]) > 12 || !Number.isInteger(n) || n < 1 || n > 24) return [];
  const end = Number(match[1]) * 12 + Number(match[2]) - 1;
  const months = [];
  for (let offset = n - 1; offset >= 0; offset--) {
    const serial = end - offset, year = Math.floor(serial / 12), month = serial % 12 + 1;
    if (year < 1 || year > 9999) return [];
    months.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

/*
 * Global charts show recorded income and expenses, not transfers or balances.
 * Account charts show that account's recorded inflows/outflows, including a
 * transfer once on each side. They are never reconstructed balance histories.
 */
export function monthlyGraph(transactions, endMonth, count = 6, accountId = null) {
  const months = graphMonths(endMonth, count);
  const buckets = months.map(month => ({ month, inCents: 0, outCents: 0, count: 0 }));
  const byMonth = new Map(buckets.map(bucket => [bucket.month, bucket]));
  let excluded = 0;
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (!tx || typeof tx !== 'object') continue;
    let direction = '';
    if (accountId === null) {
      direction = tx.type === 'Income' ? 'in' : tx.type === 'Expense' ? 'out' : '';
    } else if (tx.type === 'Income' && tx.accountId === accountId) direction = 'in';
    else if (tx.type === 'Expense' && tx.accountId === accountId) direction = 'out';
    else if (tx.type === 'Transfer' && tx.accountId !== tx.toAccountId) {
      if (tx.accountId === accountId) direction = 'out';
      else if (tx.toAccountId === accountId) direction = 'in';
    }
    if (!direction) continue;
    const month = graphMonthFromDate(tx.date);
    if (!month) { excluded++; continue; }
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    const value = cents(tx.amount);
    if (value === null) { excluded++; continue; }
    const field = direction === 'in' ? 'inCents' : 'outCents';
    const updated = addCents(bucket[field], value);
    if (updated === null) { excluded++; continue; }
    bucket[field] = updated;
    bucket.count++;
  }
  const rows = buckets.map(bucket => ({ month: bucket.month, incoming: bucket.inCents / 100, outgoing: bucket.outCents / 100, count: bucket.count }));
  return { rows, excluded, hasRecords: rows.some(row => row.count > 0) };
}

export function categoryGraph(transactions, month) {
  const values = new Map();
  let excluded = 0, total = 0, count = 0;
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (!tx || tx.type !== 'Expense') continue;
    const txMonth = graphMonthFromDate(tx.date);
    if (!txMonth) { excluded++; continue; }
    if (txMonth !== month) continue;
    const value = cents(tx.amount);
    if (value === null) { excluded++; continue; }
    const category = typeof tx.category === 'string' && tx.category.trim() ? tx.category.trim() : 'Uncategorized';
    const next = addCents(values.get(category) || 0, value), nextTotal = addCents(total, value);
    if (next === null || nextTotal === null) { excluded++; continue; }
    values.set(category, next); total = nextTotal; count++;
  }
  return {
    items: [...values.entries()].map(([category, value]) => ({ category, amount: value / 100 })).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)),
    total: total / 100, count, excluded,
  };
}

export function transactionGraph(transactions) {
  const groups = ['Income', 'Expense', 'Transfer'].map(type => ({ type, cents: 0, count: 0 }));
  let total = 0, excluded = 0;
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (!tx || typeof tx !== 'object') continue;
    const group = groups.find(item => item.type === tx.type);
    if (!group) continue;
    const value = cents(tx.amount);
    if (value === null) { excluded++; continue; }
    const next = addCents(group.cents, value), nextTotal = addCents(total, value);
    if (next === null || nextTotal === null) { excluded++; continue; }
    group.cents = next; group.count++; total = nextTotal;
  }
  return { groups: groups.map(group => ({ type: group.type, amount: group.cents / 100, count: group.count })), total: total / 100, excluded };
}

/* Explicit what-if inputs only: no saved data, interest or bank activity is assumed. */
export function goalScenarioGraph(goal, inputs) {
  const saved = cents(goal?.saved), target = cents(goal?.target);
  if (saved === null || target === null || target === 0) return { error: 'This goal needs a positive target and a non-negative saved amount.', scenarios: [] };
  const periods = [0, 3, 6, 12], scenarios = [];
  for (let index = 0; index < 2; index++) {
    const raw = inputs?.[index];
    if (raw === '' || raw === null || raw === undefined) continue;
    const contribution = cents(raw);
    if (contribution === null || contribution > Math.floor((MAX_CENTS - saved) / 12)) {
      return { error: 'Enter a valid, non-negative monthly amount.', scenarios: [] };
    }
    scenarios.push({ label: index === 0 ? 'A' : 'B', monthly: contribution / 100,
      points: periods.map(months => ({ months, amount: (saved + contribution * months) / 100 })) });
  }
  return { error: '', saved: saved / 100, target: target / 100, periods, scenarios };
}
