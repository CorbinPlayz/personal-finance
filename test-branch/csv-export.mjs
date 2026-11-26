/*
 * Read-only CSV export for Northstar's recorded transactions.
 * It reads the ledger entries it is given and never changes them. The result is
 * plain, readable text, so the caller must warn before downloading it.
 */
export const CSV_COLUMNS = Object.freeze(['Date', 'Type', 'Description', 'Category', 'Account', 'Transfer to', 'Amount']);

// A spreadsheet may run a cell that starts with one of these as a formula.
// Prefix an apostrophe, the usual guard, so typed or imported text stays text.
const FORMULA_START = /^[=+\-@\t\r]/;

function text(value) {
  if (value === null || value === undefined) return '';
  const result = String(value);
  return FORMULA_START.test(result) ? "'" + result : result;
}

function cell(value) {
  return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

// Amounts are written as recorded, to two decimals. A missing or non-numeric
// amount is left blank rather than written as 0 or NaN.
function amount(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '';
}

export function transactionsToCsv(transactions, accounts) {
  const names = new Map();
  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (account && typeof account === 'object' && typeof account.name === 'string') names.set(account.id, account.name);
  }
  const accountLabel = id => (id === null || id === undefined || id === '' ? '' : names.get(id) ?? 'Unknown account');
  const rows = (Array.isArray(transactions) ? transactions : [])
    .filter(tx => tx && typeof tx === 'object')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  const lines = [CSV_COLUMNS.join(',')];
  for (const tx of rows) {
    lines.push([
      text(tx.date), text(tx.type), text(tx.description), text(tx.category),
      text(accountLabel(tx.accountId)), text(tx.type === 'Transfer' ? accountLabel(tx.toAccountId) : ''),
      amount(tx.amount),
    ].map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
