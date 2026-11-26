import test from 'node:test';
import assert from 'node:assert/strict';
import { speakText, cleanVoice, DAILY_CHAR_BUDGET, MAX_CHARS, USER_DAILY_RENDERS } from '../cloudflare-worker/src/tts.js';

function env() {
  const store = new Map(); let calls = 0;
  return {
    calls: () => calls, store,
    VOICE: { get: async (k, t) => { const v = store.get(k); return v === undefined ? null : (t === 'arrayBuffer' ? v : String(v)); }, put: async (k, v) => { store.set(k, v); } },
    AI: { run: async () => { calls++; return new Response(new Uint8Array(500).fill(7)); } }
  };
}
const NOW = new Date('2026-11-26T12:00:00Z');

test('renders a line once, then serves the saved copy for free', async () => {
  const e = env();
  const a = await speakText(e, 'u1', 'Welcome to Northstar.', 'luna', NOW);
  assert.equal(a.cached, false); assert.equal(a.audio.byteLength, 500);
  const b = await speakText(e, 'u2', '  Welcome   to Northstar. ', 'luna', NOW);
  assert.equal(b.cached, true); assert.equal(e.calls(), 1);
});
test('a different voice is a different saved line', async () => {
  const e = env();
  await speakText(e, 'u1', 'Hello there.', 'luna', NOW); await speakText(e, 'u1', 'Hello there.', 'orion', NOW);
  assert.equal(e.calls(), 2);
});
test('unknown voices fall back to the default; empty and long text are refused', async () => {
  assert.equal(cleanVoice('darth'), 'luna');
  const e = env();
  assert.equal((await speakText(e, 'u', '   ', 'luna', NOW)).code, 'empty');
  assert.equal((await speakText(e, 'u', 'x'.repeat(MAX_CHARS + 1), 'luna', NOW)).code, 'too-long');
  assert.equal(e.calls(), 0);
});
test('the daily character budget stops new lines but saved lines still play', async () => {
  const e = env();
  await speakText(e, 'u', 'Saved line.', 'luna', NOW);
  e.store.set('budget:2026-11-26', String(DAILY_CHAR_BUDGET));
  const blocked = await speakText(e, 'u', 'A brand new line.', 'luna', NOW);
  assert.equal(blocked.code, 'budget'); assert.equal(blocked.status, 429);
  assert.equal((await speakText(e, 'u', 'Saved line.', 'luna', NOW)).cached, true);
});
test('one person cannot render unlimited new lines in a day', async () => {
  const e = env();
  e.store.set('user:2026-11-26:u', String(USER_DAILY_RENDERS));
  assert.equal((await speakText(e, 'u', 'Another new line.', 'luna', NOW)).code, 'user-limit');
});
test('missing storage and model failures give plain errors and save nothing', async () => {
  assert.equal((await speakText({ AI: {} }, 'u', 'Hi.', 'luna', NOW)).code, 'no-storage');
  const e = env(); e.AI.run = async () => { throw new Error('boom'); };
  assert.equal((await speakText(e, 'u', 'Hi.', 'luna', NOW)).code, 'model');
  assert.equal(e.store.size, 0);
});
