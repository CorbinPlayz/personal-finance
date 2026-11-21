/*
 * Recurring bills and income for Northstar.
 *
 * Pure date and money rules only. Nothing here touches the ledger, storage or
 * the page. A recurring item is a reminder with a next due date: the person
 * posts each occurrence themselves, so nothing is ever added automatically
 * (which also avoids duplicate postings when two devices share a workspace).
 *
 * Item shape: { id, description, amount, type: 'Income'|'Expense', category,
 *   accountId, frequency: 'Weekly'|'Monthly'|'Yearly', nextDate: 'YYYY-MM-DD',
 *   anchorDay } where anchorDay is the day of the month a monthly or yearly
 * item should land on, so Jan 31 -> Feb 28 -> Mar 31 and never drifts to the 28th.
 */
export const FREQUENCIES = Object.freeze(['Weekly', 'Monthly', 'Yearly']);
export const RECURRING_TYPES = Object.freeze(['Income', 'Expense']);
export const MAX_AMOUNT = 1000000000;

export function parseDate(value) {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? { y, m, d } : null;
}

export function formatDate({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(value, days) {
  const parts = parseDate(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + days));
  return formatDate({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
}

/** The occurrence after `value`, or null if the date or frequency is invalid. */
export function nextOccurrence(value, frequency, anchorDay) {
  const parts = parseDate(value);
  if (!parts || !FREQUENCIES.includes(frequency)) return null;
  if (frequency === 'Weekly') return addDays(value, 7);
  const anchor = Number.isInteger(anchorDay) && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : parts.d;
  let y = parts.y, m = parts.m;
  if (frequency === 'Monthly') { m += 1; if (m > 12) { m = 1; y += 1; } } else { y += 1; }
  return formatDate({ y, m, d: Math.min(anchor, daysInMonth(y, m)) });
}

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Keep only well-formed items, with tidy values. Invalid entries are dropped, never repaired by guessing. */
export function cleanRecurring(list) {
  const seen = new Set(), clean = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== 'object') continue;
    const amount = typeof item.amount === 'number' || (typeof item.amount === 'string' && item.amount.trim()) ? Number(item.amount) : NaN;
    const description = typeof item.description === 'string' ? item.description.trim().slice(0, 120) : '';
    const parts = parseDate(item.nextDate);
    if (typeof item.id !== 'string' || !item.id || seen.has(item.id) || !description || typeof item.accountId !== 'string' || !item.accountId) continue;
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT || money(amount) <= 0) continue;
    if (!RECURRING_TYPES.includes(item.type) || !FREQUENCIES.includes(item.frequency) || !parts) continue;
    seen.add(item.id);
    clean.push({
      id: item.id, description, amount: money(amount), type: item.type,
      category: typeof item.category === 'string' && item.category ? item.category : item.type === 'Income' ? 'Income' : 'Other',
      accountId: item.accountId, frequency: item.frequency, nextDate: item.nextDate,
      anchorDay: Number.isInteger(item.anchorDay) && item.anchorDay >= 1 && item.anchorDay <= 31 ? item.anchorDay : parts.d,
    });
  }
  return clean;
}

const byDate = (a, b) => a.nextDate.localeCompare(b.nextDate) || a.description.localeCompare(b.description) || a.id.localeCompare(b.id);

/** Items whose next date is today or earlier, oldest first. */
export function dueItems(list, today) {
  return cleanRecurring(list).filter(item => item.nextDate <= today).sort(byDate);
}

/** How many occurrences have been missed or are due, counting each period up to today. */
export function dueCount(item, today) {
  let count = 0, date = item.nextDate;
  while (date && date <= today && count < 1000) { count += 1; date = nextOccurrence(date, item.frequency, item.anchorDay); }
  return count;
}

/** Upcoming occurrences after today and within `days`, soonest first. Overdue items are reported by dueItems instead. */
export function upcomingOccurrences(list, today, days = 30) {
  const last = addDays(today, days);
  const out = [];
  if (!last) return out;
  for (const item of cleanRecurring(list)) {
    if (item.nextDate <= today) continue;
    let date = item.nextDate;
    while (date && date <= last && out.length < 500) {
      out.push({ item, date });
      date = nextOccurrence(date, item.frequency, item.anchorDay);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.item.description.localeCompare(b.item.description));
}

/** What an item amounts to in a typical month. */
export function monthlyEquivalent(item) {
  const factor = item.frequency === 'Weekly' ? 52 / 12 : item.frequency === 'Yearly' ? 1 / 12 : 1;
  return Number(item.amount) * factor;
}

export function monthlySummary(list) {
  let income = 0, expenses = 0;
  for (const item of cleanRecurring(list)) {
    if (item.type === 'Income') income += monthlyEquivalent(item); else expenses += monthlyEquivalent(item);
  }
  return { income: money(income), expenses: money(expenses), net: money(income - expenses) };
}

/** Post the current occurrence: the transaction to record (without an id) and the item moved to its next date. */
export function postOccurrence(item, today) {
  if (!item || typeof item.nextDate !== 'string' || item.nextDate > today) throw new Error('This item is not due yet.');
  const next = nextOccurrence(item.nextDate, item.frequency, item.anchorDay);
  if (!next) throw new Error('This recurring item has an invalid date.');
  const transaction = { description: item.description, amount: item.amount, type: item.type, category: item.category, date: item.nextDate, accountId: item.accountId };
  return { transaction, item: { ...item, nextDate: next } };
}

/** Move to the next date without recording anything. */
export function skipOccurrence(item) {
  const next = item ? nextOccurrence(item.nextDate, item.frequency, item.anchorDay) : null;
  if (!next) throw new Error('This recurring item has an invalid date.');
  return { ...item, nextDate: next };
}
