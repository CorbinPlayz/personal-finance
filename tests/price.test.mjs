import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, parsePrice, extractProduct, lookupPrice } from '../cloudflare-worker/src/price.js';

test('only public https links are accepted', () => {
  assert.ok(checkUrl('https://www.shop.com/p/1'));
  for (const bad of ['http://shop.com', 'https://127.0.0.1/x', 'https://localhost/x', 'https://10.0.0.1', 'https://a.internal/x', 'https://user:pw@shop.com', 'https://shop.com:8080', 'ftp://shop.com', 'nonsense', 'https://[::1]/']) assert.equal(checkUrl(bad), null, bad);
});
test('prices parse in common formats', () => {
  assert.equal(parsePrice('$1,299.99'), 1299.99);
  assert.equal(parsePrice('1.299,99 €'), 1299.99);
  assert.equal(parsePrice('19,99'), 19.99);
  assert.equal(parsePrice('1,299'), 1299);
  assert.equal(parsePrice(0), null);
  assert.equal(parsePrice('free'), null);
});
test('reads JSON-LD product, including graphs and offer lists', () => {
  const html = `<html><script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Grand &amp; Theft Auto VI","offers":[{"@type":"Offer","price":"69.99","priceCurrency":"USD"}]}]}</script></html>`;
  const r = extractProduct(html);
  assert.deepEqual([r.name, r.price, r.currency], ['Grand & Theft Auto VI', 69.99, 'USD']);
});
test('falls back to meta tags and title', () => {
  const r = extractProduct('<title>Lamp | Shop</title><meta property="og:title" content="Desk Lamp"><meta property="product:price:amount" content="24.50"><meta property="product:price:currency" content="usd">');
  assert.deepEqual([r.name, r.price, r.currency], ['Desk Lamp', 24.5, 'USD']);
  assert.equal(extractProduct('<title>Hello</title>').price, null);
});
test('lookup follows safe redirects only and reports problems plainly', async () => {
  const page = '<script type="application/ld+json">{"@type":"Product","name":"Mug","offers":{"price":9}}</script>';
  const mk = (status, headers, body) => new Response(body || '', { status, headers });
  let calls = [];
  const ok = await lookupPrice('https://a.com/x', async u => { calls.push(u); return calls.length === 1 ? mk(302, { location: 'https://b.com/y' }) : mk(200, { 'content-type': 'text/html' }, page); });
  assert.deepEqual([ok.name, ok.price, ok.host], ['Mug', 9, 'b.com']);
  const evil = await lookupPrice('https://a.com/x', async () => mk(302, { location: 'https://127.0.0.1/admin' }));
  assert.match(evil.error, /redirected somewhere/);
  assert.match((await lookupPrice('http://a.com', async () => mk(200))).error, /https/);
  assert.match((await lookupPrice('https://a.com', async () => mk(403))).error, /403/);
});

import { parseSearchResults, searchPrice } from '../cloudflare-worker/src/price.js';
test('search results are decoded, filtered and used to find a price', async () => {
  const ddg = '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.shop.com%2Fgta6&amp;rut=1">GTA</a><a class="result__a" href="https://en.wikipedia.org/wiki/GTA">w</a><a class="result__a" href="https://127.0.0.1/x">bad</a><a class="result__a" href="https://store.other.com/gta">o</a>';
  assert.deepEqual(parseSearchResults(ddg), ['https://www.shop.com/gta6', 'https://store.other.com/gta']);
  const page = '<script type="application/ld+json">{"@type":"Product","name":"GTA VI Standard","offers":{"price":"69.99","priceCurrency":"USD"}}</script>';
  const f = async u => u.includes('duckduckgo') ? new Response(ddg, { status: 200 }) : u.includes('shop.com') ? new Response('<title>none</title>', { status: 200, headers: { 'content-type': 'text/html' } }) : new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
  const r = await searchPrice('gta 6 standard edition', f);
  assert.deepEqual([r.name, r.price, r.host, r.viaSearch], ['GTA VI Standard', 69.99, 'store.other.com', true]);
  assert.match((await searchPrice('x', f)).error, /what you want/);
  assert.match((await searchPrice('gta 6', async () => new Response('', { status: 503 }))).error, /503/);
});

import { textPrice } from '../cloudflare-worker/src/price.js';
test('marketing pages: reads a From price, skips monthly instalments', () => {
  assert.equal(textPrice('<p>iPhone 18 Pro</p><p>From $45.79/mo. for 24 mo. or $1099</p><p>From $1,099</p>'), 1099);
  assert.equal(textPrice('<script>From $5</script><p>Starting at $99.00</p>'), 99);
  assert.equal(textPrice('<p>From $20 per month</p>'), null);
  assert.equal(extractProduct('<title>Phone</title><p>From $1,099</p>').guess, true);
  assert.equal(extractProduct('<script type="application/ld+json">{"@type":"Product","name":"A","offers":{"price":5}}</script>').guess, false);
});

import { textFinance } from '../cloudflare-worker/src/price.js';
test('finds monthly payment plans on a page', () => {
  assert.deepEqual(textFinance('<p>From $45.79/mo. for 24 mo. or $1099</p>'), { monthly: 45.79, months: 24 });
  assert.deepEqual(textFinance('<p>Pay in 12 monthly payments of $89.99</p>'), { monthly: 89.99, months: 12 });
  assert.equal(textFinance('<p>From $1,099</p>'), null);
  const r = extractProduct('<title>Phone</title><p>From $1,099 or $45.79/mo. for 24 mo.</p>');
  assert.deepEqual([r.price, r.finance.monthly, r.finance.months], [1099, 45.79, 24]);
});

import { textAmounts } from '../cloudflare-worker/src/price.js';
test('lists dollar amounts with context when no price is clear', () => {
  const a = textAmounts('<p>iPhone 18 Pro <b>From $1,099</b></p><p>$45.79/mo.</p><p>Trade in up to $630</p><p>From $1,099 again</p>');
  assert.deepEqual(a.map(x => x.price), [1099]);
  assert.match(a[0].context, /From \$1,099/);
});

test('Apple-style footnote price is found, trade-in amounts are skipped', () => {
  const html = '<p>For an iPhone 18 Pro 256GB with a purchase price of $1,199 (excluding taxes and any trade-in credit), the typical monthly</p><p>trade-in of $900 or $350</p>';
  assert.equal(textPrice(html), 1199);
  assert.deepEqual(textAmounts(html).map(a => a.price), [1199]);
});
