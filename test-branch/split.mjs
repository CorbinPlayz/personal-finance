/* Money split: cut incoming money into percent pieces across chosen accounts.
   Pure functions only. Amounts are handled in whole cents so the pieces always
   add up to exactly the original amount. */

export const SPLIT_MAX_PARTS = 12;

const hundredths = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) : null;
};

/* Returns '' when the split can be used, otherwise a plain-language reason. */
export function validateSplit(parts, accountIds) {
  if (!Array.isArray(parts) || parts.length < 2) return 'Pick at least two accounts for a split.';
  if (parts.length > SPLIT_MAX_PARTS) return `Use ${SPLIT_MAX_PARTS} accounts or fewer.`;
  const known = new Set(accountIds || []), seen = new Set();
  let total = 0;
  for (const part of parts) {
    if (!part || !known.has(part.accountId)) return 'One of the split accounts no longer exists.';
    if (seen.has(part.accountId)) return 'Each account can only appear once.';
    seen.add(part.accountId);
    const h = hundredths(part.percent);
    if (h === null) return 'Each percent must be more than 0 and at most 100.';
    total += h;
  }
  if (total !== 10000) return `The percents add up to ${total / 100}%, not 100%.`;
  return '';
}

export function cleanSplit(raw) {
  const parts = Array.isArray(raw?.parts) ? raw.parts
    .filter(p => p && typeof p.accountId === 'string' && hundredths(p.percent) !== null)
    .slice(0, SPLIT_MAX_PARTS)
    .map(p => ({ accountId: p.accountId, percent: hundredths(p.percent) / 100 })) : [];
  return { enabled: raw?.enabled === true, parts };
}

/* The parts to use right now, or null when splitting is off or not valid. */
export function activeSplit(split, accountIds) {
  const clean = cleanSplit(split);
  return clean.enabled && !validateSplit(clean.parts, accountIds) ? clean.parts : null;
}

/* Largest-remainder rounding: pieces are dollars and sum to exactly `amount`. */
export function splitAmount(amount, parts) {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || !Array.isArray(parts) || !parts.length) return [];
  const weights = parts.map(p => hundredths(p.percent));
  if (weights.some(w => w === null)) return [];
  const exact = weights.map(w => cents * w / 10000);
  const floors = exact.map(Math.floor);
  let left = cents - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) floors[order[i].index]++;
  return floors.map(c => c / 100);
}
