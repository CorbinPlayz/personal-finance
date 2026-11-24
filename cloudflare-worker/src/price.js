/* Reads a product name and price from a public web page. No AI is used, so it
   costs no AI quota. Only https pages on public host names are fetched. */
const MAX_BYTES = 600000;
const MAX_REDIRECTS = 3;

export function checkUrl(text) {
  let u;
  try { u = new URL(String(text || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (u.port && u.port !== "443") return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid)$/.test(h)) return null;
  return u;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(t) {
  return String(t || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function parsePrice(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 && value < 1e7 ? Math.round(value * 100) / 100 : null;
  let t = String(value ?? "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(t)) return null;
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma >= 0) {
    t = /,\d{1,2}$/.test(t) && t.split(",").length === 2 ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  return parsePrice(Number(t));
}

function walk(node, out, depth = 0) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, out, depth + 1)); return; }
  if (typeof node !== "object") return;
  const type = [].concat(node["@type"] || []).join(" ");
  if (/\bProduct\b/i.test(type) || /\bIndividualProduct\b/i.test(type)) out.push(node);
  for (const k of Object.keys(node)) if (k === "@graph" || k === "mainEntity" || k === "itemListElement" || k === "item") walk(node[k], out, depth + 1);
}

function offerPrice(offers) {
  for (const o of [].concat(offers || [])) {
    if (!o || typeof o !== "object") continue;
    const spec = [].concat(o.priceSpecification || [])[0] || {};
    const p = parsePrice(o.price ?? o.lowPrice ?? spec.price);
    if (p) return { price: p, currency: String(o.priceCurrency || spec.priceCurrency || "").slice(0, 3).toUpperCase() };
    if (o.offers) { const inner = offerPrice(o.offers); if (inner) return inner; }
  }
  return null;
}

function meta(html, names) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!key || !names.includes(key.toLowerCase())) continue;
    const val = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (val) return decodeEntities(val);
  }
  return "";
}

const clean = t => decodeEntities(t).replace(/\s+/g, " ").trim().slice(0, 120);

/* Last resort for marketing pages: the first "From $1,099" / "Starting at $99" in the visible text.
   Monthly instalment prices ("$45.79/mo") are skipped. The caller labels the result a guess. */
export function textPrice(html) {
  const text = decodeEntities(String(html || "").replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  for (const m of text.matchAll(/\b(?:from|starting at|starts at|only|purchase price of|priced at|price of|price:)\s*(?:US)?\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?/gi)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 24).toLowerCase();
    if (/^\s*(?:\/|per\s)?\s*(?:mo\b|month)/.test(after)) continue;
    const p = parsePrice(m[1] + (m[2] || ""));
    if (p) return p;
  }
  return null;
}

/* "$45.79/mo. for 24 mo." or "24 monthly payments of $45.79" on the page. */
export function textFinance(html) {
  const text = decodeEntities(String(html || "").replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  let m = text.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?\s*(?:\/|per\s)\s*(?:mo\b|month)\.?[^$]{0,40}?\b(\d{1,3})\s*(?:mo\b|months?)/i);
  let monthly = m && parsePrice(m[1] + (m[2] || "")), months = m && Number(m[3]);
  if (!monthly) {
    m = text.match(/\b(\d{1,3})\s*(?:monthly\s+)?(?:payments?|instal+ments?)\s+of\s+\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?/i);
    monthly = m && parsePrice(m[2] + (m[3] || "")); months = m && Number(m[1]);
  }
  return monthly && months >= 2 && months <= 120 ? { monthly, months } : null;
}

/* When no price is certain: the dollar amounts on the page with a few words of context, so the user can pick. */
export function textAmounts(html, limit = 5) {
  const text = decodeEntities(String(html || "").replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const out = [], seen = new Set();
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?/g)) {
    const p = parsePrice(m[1] + (m[2] || ""));
    if (!p || p < 1 || seen.has(p)) continue;
    const around = text.slice(Math.max(0, m.index - 60), m.index).toLowerCase();
    if (/trade[- ]?in|autopay|credit|plan of|rebate|gift card|off\b|save up to|per line/.test(around)) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 10).toLowerCase();
    if (/^\s*(?:\/|per\s)?\s*(?:mo\b|month)/.test(after)) continue;
    seen.add(p);
    out.push({ price: p, context: text.slice(Math.max(0, m.index - 28), m.index + m[0].length + 14).trim() });
    if (out.length >= limit) break;
  }
  return out;
}

export function extractProduct(html) {
  html = String(html || "");
  let name = "", price = null, currency = "", source = "";
  for (const m of html.matchAll(/<script\b[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const products = []; walk(data, products);
    for (const p of products) {
      const o = offerPrice(p.offers);
      if (!name && p.name) name = clean(p.name);
      if (o && !price) { price = o.price; currency = o.currency; source = "page data"; if (name) break; }
    }
    if (price && name) break;
  }
  if (!price) {
    const p = parsePrice(meta(html, ["product:price:amount", "og:price:amount", "twitter:data1", "price", "itemprop:price"]));
    if (p) { price = p; currency = meta(html, ["product:price:currency", "og:price:currency", "pricecurrency"]).slice(0, 3).toUpperCase(); source = "page tags"; }
  }
  if (!price) {
    const m = html.match(/itemprop\s*=\s*["']price["'][^>]*?content\s*=\s*["']([^"']+)["']/i) || html.match(/content\s*=\s*["']([^"']+)["'][^>]*?itemprop\s*=\s*["']price["']/i);
    const p = m && parsePrice(m[1]);
    if (p) { price = p; source = "page tags"; }
  }
  let guess = false;
  if (!price) {
    const g = textPrice(html);
    if (g) { price = g; source = "page text"; guess = true; }
  }
  if (!name) name = clean(meta(html, ["og:title", "twitter:title"]) || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const finance = textFinance(html);
  const out = { name, price, currency, source, guess, finance };
  if (!price) out.amounts = textAmounts(html);
  return out;
}

async function readLimited(res) {
  const reader = res.body && res.body.getReader();
  if (!reader) return "";
  const dec = new TextDecoder(); let out = "", total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length; out += dec.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch {}
  return out;
}

const fail = (code, error, host) => ({ error, code, ...(host ? { host } : {}) });

export async function lookupPrice(rawUrl, fetchImpl = fetch) {
  let u = checkUrl(rawUrl);
  if (!u) return fail("bad-link", "Send a full https:// link to a public product page.");
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = u.hostname.replace(/^www\./, "");
    let res;
    try {
      res = await fetchImpl(u.toString(), {
        redirect: "manual", signal: AbortSignal.timeout(7000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; NorthstarPriceCheck/1.0)", "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }
      });
    } catch (e) {
      return e && e.name === "TimeoutError"
        ? fail("timeout", "I couldn't open that page: " + host + " took too long (over 7 seconds).", host)
        : fail("open-failed", "I couldn't open that page: " + host + " refused or dropped the connection.", host);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = checkUrl(new URL(res.headers.get("location") || "", u).toString());
      if (!next) return fail("redirect-unsafe", "That link redirected somewhere I can't open.", host);
      u = next; continue;
    }
    if (!res.ok) {
      const why = res.status === 403 || res.status === 429 || res.status === 503 ? " The shop is blocking automatic readers." : "";
      return fail("blocked", "The shop didn't let me read that page (" + res.status + ", " + host + ")." + why, host);
    }
    if (!/html|xml/i.test(res.headers.get("content-type") || "")) return fail("not-html", "That link isn't a web page (" + host + ").", host);
    const found = extractProduct(await readLimited(res));
    if (!found.name && !found.price) return fail("no-product", "I couldn't find a product on that page (" + host + "). It may load its price with JavaScript, which I can't run.", host);
    return { ...found, host };
  }
  return fail("redirect-loop", "That link redirected too many times.");
}

const SKIP_HOSTS = /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|wikipedia\.org|reddit\.com|youtube\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|pinterest\.com|quora\.com|ign\.com|gamespot\.com)$/i;

export function parseSearchResults(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/class="result__a"[^>]*href="([^"]+)"/gi)) {
    let href = decodeEntities(m[1]);
    if (href.startsWith("//")) href = "https:" + href;
    try {
      const u = new URL(href);
      if (/duckduckgo\.com$/.test(u.hostname) && u.searchParams.get("uddg")) href = u.searchParams.get("uddg");
    } catch { continue; }
    const u = checkUrl(href);
    if (!u || SKIP_HOSTS.test(u.hostname) || out.includes(u.toString())) continue;
    out.push(u.toString());
  }
  return out;
}

const BOT_WALL = /anomaly|captcha|unusual traffic|are you a (?:human|robot)|challenge-form/i;

export async function searchPrice(query, fetchImpl = fetch) {
  const q = String(query || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (q.length < 3) return fail("bad-query", "Tell me what you want to buy.");
  let html = "";
  try {
    const res = await fetchImpl("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q + " buy price"), {
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; NorthstarPriceCheck/1.0)", "accept": "text/html", "accept-language": "en-US,en;q=0.9" }
    });
    if (res.status === 202 || res.status === 403 || res.status === 429) return fail("search-blocked", "The search engine blocked the Worker (" + res.status + "), probably as a bot.");
    if (!res.ok) return fail("search-down", "The web search didn't answer (" + res.status + ").");
    html = await readLimited(res);
  } catch (e) {
    return e && e.name === "TimeoutError"
      ? fail("search-timeout", "The web search took too long (over 6 seconds).")
      : fail("search-down", "The web search didn't answer.");
  }
  const links = parseSearchResults(html).slice(0, 4);
  if (!links.length) {
    return BOT_WALL.test(html)
      ? fail("search-blocked", "The search engine showed a bot check instead of results.")
      : fail("search-empty", "The web search worked but gave no shop links I could read.");
  }
  const results = await Promise.all(links.map(l => lookupPrice(l, fetchImpl).catch(() => fail("open-failed", "error", new URL(l).hostname.replace(/^www\./, "")))));
  const hit = results.find(r => r && r.price);
  if (hit) return { ...hit, viaSearch: true };
  const tried = results.map((r, i) => ({ host: r.host || new URL(links[i]).hostname.replace(/^www\./, ""), code: r.code || "no-price" }));
  const label = { blocked: "blocked", timeout: "too slow", "open-failed": "wouldn't open", "no-product": "no product found", "not-html": "not a page", "no-price": "no price" };
  const list = tried.map(t => t.host + " (" + (label[t.code] || t.code) + ")").join(", ");
  return { ...fail("no-price", "I opened " + tried.length + " shop" + (tried.length === 1 ? "" : "s") + " but none showed a price I could read: " + list + "."), tried };
}
