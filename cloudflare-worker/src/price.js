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
  if (!name) name = clean(meta(html, ["og:title", "twitter:title"]) || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  return { name, price, currency, source };
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

export async function lookupPrice(rawUrl, fetchImpl = fetch) {
  let u = checkUrl(rawUrl);
  if (!u) return { error: "Send a full https:// link to a public product page." };
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetchImpl(u.toString(), {
        redirect: "manual", signal: AbortSignal.timeout(7000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; NorthstarPriceCheck/1.0)", "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }
      });
    } catch { return { error: "I couldn't open that page." }; }
    if (res.status >= 300 && res.status < 400) {
      const next = checkUrl(new URL(res.headers.get("location") || "", u).toString());
      if (!next) return { error: "That link redirected somewhere I can't open." };
      u = next; continue;
    }
    if (!res.ok) return { error: "The shop didn't let me read that page (" + res.status + ")." };
    if (!/html|xml/i.test(res.headers.get("content-type") || "")) return { error: "That link isn't a web page." };
    const found = extractProduct(await readLimited(res));
    if (!found.name && !found.price) return { error: "I couldn't find a product on that page." };
    return { ...found, host: u.hostname.replace(/^www\./, "") };
  }
  return { error: "That link redirected too many times." };
}
