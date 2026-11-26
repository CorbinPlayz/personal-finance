import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice, JARVIS_VOICE, LAUNCH_VOICE } from '../jarvis-voice.mjs';

function rig(over = {}) {
  const played = [], browser = [], calls = [];
  const audio = { pause() {}, removeAttribute() {}, play() { played.push(audio.src); return Promise.resolve(); } };
  const env = {
    url: 'https://w.example/', getToken: async () => 'tok', browserSpeak: (t, r) => browser.push([t, r]), browserCancel() {},
    makeAudio: () => audio, makeUrl: () => 'blob:line' + calls.length,
    fetch: async (u, o) => { calls.push(JSON.parse(o.body)); return over.res ? over.res() : { ok: true, blob: async () => new Blob(['x']) }; },
    ...over.env,
  };
  return { v: createVoice(env), played, browser, calls };
}

test('Jarvis always uses his one voice; the launch moment can ask for the calm female one', async () => {
  const r = rig();
  assert.equal(await r.v.speak('Hello there'), 'voice');
  assert.equal(await r.v.speak('Hello there'), 'voice');
  assert.equal(r.calls.length, 1); assert.deepEqual(r.calls[0], { mode: 'tts', text: 'Hello there', voice: JARVIS_VOICE });
  await r.v.speak('Find your Northstar.', { voice: LAUNCH_VOICE });
  assert.equal(r.calls[1].voice, LAUNCH_VOICE); assert.equal(r.played.length, 3); assert.equal(r.browser.length, 0);
});
test('falls back to the device voice when the Worker refuses, and says why', async () => {
  const r = rig({ res: () => ({ ok: false, status: 429, json: async () => ({ error: 'allowance used' }) }) });
  assert.equal(await r.v.speak('Hi'), 'browser'); assert.equal(r.browser.length, 1);
  assert.equal(r.v.lastError(), 'allowance used');
});
test('falls back when the network fails and when playback is blocked', async () => {
  assert.equal(await rig({ env: { fetch: async () => { throw new Error('offline'); } } }).v.speak('Hi'), 'browser');
  const audio = { pause() {}, removeAttribute() {}, play: () => Promise.reject(new Error('NotAllowed')) };
  assert.equal(await rig({ env: { makeAudio: () => audio } }).v.speak('Hi'), 'browser');
});
test('muted stays silent and cancel drops a late line', async () => {
  assert.equal(await rig({ env: { isMuted: () => true } }).v.speak('Hi'), 'muted');
  const s = rig(); const p = s.v.speak('Slow line'); s.v.stop();
  assert.equal(await p, 'cancelled'); assert.equal(s.played.length, 0);
});
test('prefetch warms every line once', async () => {
  const r = rig(); r.v.prefetch(['One.', 'Two.', 'One.']); await new Promise(res => setTimeout(res, 20));
  assert.equal(r.calls.length, 2);
});
