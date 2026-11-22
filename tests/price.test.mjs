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
