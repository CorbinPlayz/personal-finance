/* Jarvis's realistic voice. Asks the Worker for a spoken line (Aura-1), keeps it in memory,
   and plays it through one persistent audio element so phones allow it after a first tap.
   Anything that goes wrong falls back to the browser's own voice, so Jarvis never goes silent. */
/* One voice for Jarvis, chosen once for the whole app: calm, British, natural. The welcome
   moment uses a calm female voice. Both come from Aura-1 and are saved after the first play. */
export const JARVIS_VOICE = 'helios';
export const LAUNCH_VOICE = 'athena';
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';


export function createVoice(env) {
  const { url, getToken, browserSpeak, browserCancel, isMuted } = env;
  const fetchImpl = env.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const makeAudio = env.makeAudio || (() => new Audio());
  const makeUrl = env.makeUrl || (blob => URL.createObjectURL(blob));
  const cache = new Map();            // "voice|text" -> Promise<objectURL | null>
  let audio = null, seq = 0, lastError = '';

  const el = () => audio || (audio = makeAudio());

  /* Call from a tap: unlocks audio on iPhone and Chrome so later lines may play on their own. */
  function prime() {
    try { const a = el(); a.src = SILENT_WAV; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  function fetchLine(text, id) {
    const key = id + '|' + text;
    if (cache.has(key)) return cache.get(key);
    const job = (async () => {
      if (!fetchImpl) return null;
      const token = await getToken();
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ mode: 'tts', text, voice: id }),
      });
      if (!res.ok) {
        let msg = 'Voice unavailable (' + res.status + ')';
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* not JSON */ }
        lastError = msg; return null;
      }
      lastError = '';
      return makeUrl(await res.blob());
    })().catch(e => { lastError = (e && e.message) || 'Voice unavailable'; return null; });
    cache.set(key, job);
    job.then(u => { if (!u) cache.delete(key); });
    return job;
  }

  function stop() { seq++; try { if (audio) { audio.pause(); audio.removeAttribute && audio.removeAttribute('src'); } } catch (e) { /* ignore */ } }

  /* Says the line. Resolves 'voice' when the realistic voice played, 'browser' when the fallback did. */
  async function speak(text, opts = {}) {
    const line = String(text || '').trim();
    if (!line || (isMuted && isMuted())) return 'muted';
    const mine = ++seq;
    try { browserCancel && browserCancel(); } catch (e) { /* ignore */ }
    {
      const src = await fetchLine(line, opts.voice || JARVIS_VOICE);
      if (mine !== seq) return 'cancelled';
      if (src) {
        try {
          const a = el(); a.src = src; a.playbackRate = Math.max(0.85, Math.min(1.35, opts.rate || 1)); a.volume = 1;
          const p = a.play(); if (p && p.then) await p;
          return 'voice';
        } catch (e) { lastError = 'The browser blocked the voice until you tap the page.'; }
      }
      if (mine !== seq) return 'cancelled';
    }
    try { browserSpeak && browserSpeak(line, opts.rate); } catch (e) { /* ignore */ }
    return 'browser';
  }

  /* Warm the saved copies of upcoming lines so each one starts instantly. */
  function prefetch(lines, voice) { for (const t of lines || []) { const s = String(t || '').trim(); if (s) fetchLine(s, voice || JARVIS_VOICE); } }

  return {
    speak, stop, prime, prefetch,
    lastError: () => lastError,
  };
}
