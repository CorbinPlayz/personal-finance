import test from 'node:test';
import assert from 'node:assert/strict';
import { stepSpring, isSettled, squishScale, floatOffset, pickRoam, pickComment } from '../jarvis-orb.mjs';
import { buildDemoLedger } from '../demo-data.mjs';

test('squish: a press flattens the ball, the release overshoots (stretches) and then settles', () => {
  const s = { x: 0, v: 0, t: 1 };
  for (let i = 0; i < 40; i++) stepSpring(s, 1 / 60);
  assert.ok(s.x > 0.8, 'pressed in: ' + s.x);
  s.t = 0; let min = 0, steps = 0;
  while (!isSettled(s) && steps < 600) { stepSpring(s, 1 / 60); min = Math.min(min, s.x); steps++; }
  assert.ok(min < -0.05, 'it springs past normal like a ball: ' + min);
  assert.ok(steps < 150, 'and settles within ~2.5 seconds: ' + steps);
  const flat = squishScale(1), tall = squishScale(-0.4);
  assert.ok(flat.sx > 1 && flat.sy < 1 && tall.sx < 1 && tall.sy > 1);
});
test('float stays small, moves over time, and is still when motion is reduced', () => {
  const xs = []; for (let t = 0; t < 60000; t += 500) { const o = floatOffset(t); xs.push(o.x); assert.ok(Math.abs(o.x) <= 8.1 && Math.abs(o.y) <= 8.1); }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 6);
  assert.deepEqual(floatOffset(5000, true), { x: 0, y: 0 });
});
test('roaming always stays on screen, up and to the left of the corner', () => {
  for (const [w, h] of [[1280, 900], [390, 844], [320, 480]]) for (const r of [0, 0.5, 0.999]) {
    const p = pickRoam(() => r, w, h); assert.ok(p.x <= 0 && p.y <= 0 && -p.x < w - 100 && -p.y < h - 150, JSON.stringify([w, h, r, p]));
  }
});
test('comments: over-budget first, goal milestones, nothing repeated, quiet when there is nothing to say', () => {
  const now = new Date(2026, 10, 20);
  const base = { settings: { currency: 'USD' }, accounts: [], purchases: [], goals: [], budgets: [], transactions: [] };
  assert.equal(pickComment(base, now), null);
  const over = { ...base, budgets: [{ category: 'Food', limit: 100 }], transactions: [{ date: '2026-11-03', type: 'Expense', category: 'Food', amount: 160 }] };
  const a = pickComment(over, now); assert.match(a.text, /Food is \$60 over its budget/); assert.ok(a.spoken && !/\d/.test(a.spoken), 'spoken lines carry no numbers, so they can be saved and shared');
  assert.equal(pickComment(over, now, { [a.id]: now.getTime() - 1000 }), null, 'said once, not again');
  const g = { ...base, goals: [{ id: 'g1', name: 'Trip', saved: 780, target: 1000 }] };
  assert.match(pickComment(g, now).text, /Trip is 78% funded\. \$220 to go\./);
  assert.equal(pickComment(g, now, { 'goal:g1:75': now.getTime() }), null, 'a milestone already celebrated is skipped, and lower ones are not replayed');
  const low = { ...base, accounts: [{ id: 'a1', name: 'Checking', type: 'Checking', balance: 300, minimumBalance: 500 }] };
  assert.match(pickComment(low, now).text, /Checking is under its \$500 minimum/);
  const ahead = { ...base, transactions: [{ date: '2026-11-01', type: 'Income', amount: 2000 }, { date: '2026-11-02', type: 'Expense', category: 'Food', amount: 500 }] };
  assert.match(pickComment(ahead, now).text, /\$1,500 ahead this month/);
});
test('the demo ledger gives Jarvis something real to say', () => {
  const c = pickComment(buildDemoLedger(new Date(2026, 10, 25)), new Date(2026, 10, 25));
  assert.ok(c && c.text.length > 10, JSON.stringify(c));
});
