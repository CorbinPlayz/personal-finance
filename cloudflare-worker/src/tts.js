/* Jarvis's voice. Aura-1 (Workers AI) turns text into speech. Every line is saved in
   KV under a hash of voice + text, so the first person to play a line pays for it once
   and everyone after that gets the saved copy for free. Daily limits keep the free
   Workers AI allowance from running out. */
export const VOICES = ["angus", "asteria", "arcas", "orion", "orpheus", "athena", "luna", "zeus", "perseus", "helios", "hera", "stella"];
export const DEFAULT_VOICE = "luna";
export const MAX_CHARS = 420;
export const DAILY_CHAR_BUDGET = 4000;
export const USER_DAILY_RENDERS = 30;
const MODEL = "@cf/deepgram/aura-1";

export function cleanVoice(v) {
  const s = String(v || "").toLowerCase();
  return VOICES.includes(s) ? s : DEFAULT_VOICE;
}

export function cleanText(t) {
  return String(t || "").replace(/\s+/g, " ").trim();
}

async function keyFor(voice, text) {
  const data = new TextEncoder().encode(voice + "\n" + text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return "v1:" + voice + ":" + [...new Uint8Array(hash)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}

const day = (now) => now.toISOString().slice(0, 10);

/* Returns { audio: ArrayBuffer, cached } or { error, status, code }. */
export async function speakText(env, uid, rawText, rawVoice, now = new Date()) {
  const text = cleanText(rawText), voice = cleanVoice(rawVoice);
  if (!text) return { error: "Send the words Jarvis should say.", status: 400, code: "empty" };
  if (text.length > MAX_CHARS) return { error: "That is too long for one voice line (" + MAX_CHARS + " characters at most).", status: 400, code: "too-long" };
  if (!env || !env.VOICE) return { error: "Jarvis's voice storage isn't set up on the Worker yet.", status: 503, code: "no-storage" };

  const key = await keyFor(voice, text);
  const saved = await env.VOICE.get(key, "arrayBuffer");
  if (saved && saved.byteLength > 200) return { audio: saved, cached: true, voice };

  const d = day(now), budgetKey = "budget:" + d, userKey = "user:" + d + ":" + uid;
  const spent = Number(await env.VOICE.get(budgetKey)) || 0, mine = Number(await env.VOICE.get(userKey)) || 0;
  if (spent + text.length > DAILY_CHAR_BUDGET) return { error: "Jarvis has used today's free voice allowance. New lines can be spoken tomorrow; saved lines still play.", status: 429, code: "budget" };
  if (mine >= USER_DAILY_RENDERS) return { error: "You've made a lot of new voice lines today. Try again tomorrow.", status: 429, code: "user-limit" };
  if (!env.AI) return { error: "Workers AI isn't connected.", status: 503, code: "no-ai" };

  let audio;
  try {
    const res = await env.AI.run(MODEL, { text, speaker: voice, encoding: "mp3" }, { returnRawResponse: true });
    audio = await (res instanceof Response ? res.arrayBuffer() : new Response(res).arrayBuffer());
  } catch (e) {
    return { error: "The voice model is unavailable right now. Please try again in a moment.", status: 502, code: "model" };
  }
  if (!audio || audio.byteLength < 200) return { error: "The voice model returned no audio.", status: 502, code: "empty-audio" };

  await env.VOICE.put(key, audio);
  await env.VOICE.put(budgetKey, String(spent + text.length), { expirationTtl: 172800 });
  await env.VOICE.put(userKey, String(mine + 1), { expirationTtl: 172800 });
  return { audio, cached: false, voice };
}
