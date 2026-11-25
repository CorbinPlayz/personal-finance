import test from 'node:test';
import assert from 'node:assert/strict';
import { TOURS, TOUR_TOTAL_MS, planDurations, placeGuide, hasSeen, markSeen, seenKey, tourKeyFor, createTour, TOUR_VERSION } from '../jarvis-tour.mjs';

const PAGES = ['Overview', 'Transactions', 'Accounts', 'Budgets', 'Goals', 'Purchases', 'Stocks', 'Guide', 'Settings'];
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('every section and the intro have a tour of about 30 seconds', () => {
  for (const key of ['Intro', ...PAGES]) {
    assert.ok(TOURS[key], key);
    const ms = planDurations(TOURS[key].steps);
    assert.equal(ms.reduce((a, b) => a + b, 0), TOUR_TOTAL_MS, key);
    assert.ok(ms.every(n => n >= 2500), key + ' no step is a flash');
    assert.ok(TOURS[key].steps.length >= 5 && TOURS[key].steps.length <= 8, key);
  }
});
test('the Northstar Guide page uses the Guide tour', () => { assert.equal(tourKeyFor('Northstar Guide'), 'Guide'); assert.equal(tourKeyFor('Goals'), 'Goals'); });
test('seen state is per person and per tour, and a new version shows everyone again', () => {
  const s = memory();
  assert.equal(hasSeen(s, 'a', 'Goals'), false);
  markSeen(s, 'a', 'Goals');
  assert.equal(hasSeen(s, 'a', 'Goals'), true);
  assert.equal(hasSeen(s, 'b', 'Goals'), false);
  assert.equal(hasSeen(s, 'a', 'Stocks'), false);
  assert.match(seenKey('a', 'Goals'), new RegExp('northstar-tour-' + TOUR_VERSION));
  assert.equal(hasSeen({ getItem() { throw new Error('blocked'); } }, 'a', 'x'), false);
});
test('captions and Jarvis always stay on screen', () => {
  const rects = [null, { left: 10, top: 10, right: 300, bottom: 80, width: 290, height: 70 }, { left: 20, top: 700, right: 380, bottom: 844, width: 360, height: 144 }, { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 }];
  for (const [vw, vh] of [[390, 844], [1280, 900]]) for (const r of rects) {
    const p = placeGuide(r, vw, vh, { w: 320, h: 140 }, 46);
    assert.ok(p.card.x >= 0 && p.card.x + p.card.w <= vw, 'card x'); assert.ok(p.card.y >= 0 && p.card.y + 140 <= vh, 'card y');
    assert.ok(p.orb.x >= 0 && p.orb.x + 46 <= vw && p.orb.y >= 0 && p.orb.y + 46 <= vh, 'orb');
  }
});
test('the first visit plays Intro once, then each section once, and nothing without a person', () => {
  const store = memory(), played = [];
  const node = () => ({ style: {}, offsetWidth: 0, offsetHeight: 100, setAttribute() {}, addEventListener() {}, set textContent(v) {}, querySelector: node });
  const doc = { createElement: () => ({ ...node(), remove() {}, innerHTML: '' }), body: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, querySelector: () => null };
  const win = { innerWidth: 390, innerHeight: 844, setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }), localStorage: store };
  const t = createTour({ doc, win, storage: store, sound: () => ({ tap() { played.push('tap'); }, whoosh() {}, success() {} }) });
  assert.equal(t.maybeStart('Overview', ''), false);
  assert.equal(t.maybeStart('Overview', 'u1'), true);
  assert.equal(t.current().key, 'Intro');
  t.stop();
  assert.equal(t.maybeStart('Overview', 'u1'), false, 'Overview is counted as seen after the intro');
  assert.equal(t.maybeStart('Goals', 'u1'), true); assert.equal(t.current().key, 'Goals'); t.stop();
  assert.equal(t.maybeStart('Goals', 'u1'), false);
  assert.equal(t.maybeStart('Goals', 'u2'), true, 'another person sees it too');
  assert.ok(played.includes('tap'));
});
