/* Charts for the Stocks tab: the portfolio value chart (hover/tap to read, not
   zoomable) and the per-stock 5-year chart (zoom, pan, ranges). Plain SVG, no
   libraries. Every value placed in markup passes through esc(). */
import { DAY, fmtDate, fmtUsd, fmtUsdExact, viewStats, decimate, niceTicks, timeTicks, nearestIndex, zoomView, panView, rangeView, activeRange, clampView, minSpanFor } from './stock-history.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAD = { l: 10, r: 58, t: 12, b: 26 };
const f1 = n => (Math.round(n * 10) / 10).toString();
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtUsdExact(Math.abs(n));
const pctText = p => p === null || !Number.isFinite(p) ? '' : ` (${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(2)}%)`;
let uid = 0;

/* One chart as an SVG string. `line` = {t, v, idx}; `second` = optional dashed line; both use the same x/y scale. */
export function chartSvg({ id, w, h, view, y, line, second = null, markers = [], tone = 'up', step = false }) {
  const plotW = w - PAD.l - PAD.r, plotH = h - PAD.t - PAD.b, span = view[1] - view[0] || 1;
  const X = t => PAD.l + (t - view[0]) / span * plotW, Y = v => PAD.t + (1 - (v - y[0]) / (y[1] - y[0] || 1)) * plotH;
  const path = (s) => s.idx.map((i, k) => `${k ? 'L' : 'M'}${f1(X(s.t[i]))},${f1(Y(s.v[i]))}`).join('');
  const yt = niceTicks(y[0], y[1], 5).ticks.filter(v => v >= y[0] && v <= y[1]);
  const xt = timeTicks(view[0], view[1], w < 420 ? 4 : 6);
  const grid = yt.map(v => `<line class="stk-grid" x1="${PAD.l}" x2="${w - PAD.r}" y1="${f1(Y(v))}" y2="${f1(Y(v))}"/><text class="stk-ylab" x="${w - PAD.r + 6}" y="${f1(Y(v) + 4)}">${esc(fmtUsd(v))}</text>`).join('');
  const xlab = xt.map(k => { const x = X(k.t), anchor = x < PAD.l + 18 ? 'start' : x > w - PAD.r - 18 ? 'end' : 'middle'; return `<line class="stk-tick" x1="${f1(x)}" x2="${f1(x)}" y1="${h - PAD.b}" y2="${h - PAD.b + 4}"/><text class="stk-xlab" x="${f1(x)}" y="${h - 7}" text-anchor="${anchor}">${esc(k.label)}</text>`; }).join('');
  const main = path(line), last = line.idx[line.idx.length - 1], first = line.idx[0];
  const area = step ? '' : `<path class="stk-area" d="${main}L${f1(X(line.t[last]))},${PAD.t + plotH}L${f1(X(line.t[first]))},${PAD.t + plotH}Z"/>`;
  const dots = markers.filter(m => m.t >= view[0] && m.t <= view[1]).slice(0, 60).map(m => `<circle class="stk-mark" cx="${f1(X(m.t))}" cy="${f1(Y(m.v))}" r="4"><title>${esc(m.label)}</title></circle>`).join('');
  return `<svg class="stk-svg" data-tone="${tone}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><defs><clipPath id="${id}"><rect x="${PAD.l - 6}" y="${PAD.t - 4}" width="${plotW + 10}" height="${plotH + 8}"/></clipPath></defs>${grid}<line class="stk-axis" x1="${PAD.l}" x2="${w - PAD.r}" y1="${h - PAD.b}" y2="${h - PAD.b}"/>${xlab}<g clip-path="url(#${id})">${area}${second ? `<path class="stk-second" d="${path(second)}"/>` : ''}<path class="stk-line" d="${main}"/>${dots}</g><g class="stk-cursor" style="visibility:hidden"><line class="stk-cursor-line" y1="${PAD.t}" y2="${PAD.t + plotH}" x1="0" x2="0"/><circle class="stk-cursor-dot" r="4.5" cx="0" cy="0"/></g></svg>`;
}

const geometry = (plot, w, h, view) => {
  const r = plot.getBoundingClientRect(), k = r.width ? w / r.width : 1, plotW = w - PAD.l - PAD.r;
  return { tAt: clientX => view[0] + ((clientX - r.left) * k - PAD.l) / plotW * (view[1] - view[0]), plotW, k, left: r.left };
};
const moveCursor = (svg, x, y) => {
  const c = svg && svg.querySelector('.stk-cursor'); if (!c) return;
  c.style.visibility = 'visible';
  const l = c.querySelector('line'), d = c.querySelector('circle');
  l.setAttribute('x1', f1(x)); l.setAttribute('x2', f1(x)); d.setAttribute('cx', f1(x)); d.setAttribute('cy', f1(y));
};
const hideCursor = svg => { const c = svg && svg.querySelector('.stk-cursor'); if (c) c.style.visibility = 'hidden'; };

/* ---- Portfolio value chart (read-only: hover or tap to read a day) --------- */
export function portfolioChartShell() {
  return `<section class="panel stk-pf" aria-labelledby="stkPfTitle"><div class="panel-head"><div><h2 id="stkPfTitle">Portfolio value over time</h2><p>Daily closing prices of the stocks you track, from your first purchase date. The line steps up on the day you add shares.</p></div></div><div id="pfChartBody" class="stk-pf-body"><p class="stk-status">Loading your portfolio history…</p></div></section>`;
}
export function portfolioChartMessage(text, retry = false) {
  return `<p class="stk-status" role="status">${esc(text)}</p>${retry ? '<button type="button" class="stk-btn" data-action="pf-chart-retry">Try again</button>' : ''}`;
}

export function mountPortfolioChart(host, model) {
  const pts = model.points, t = pts.map(p => p.t), value = pts.map(p => p.value), cost = pts.map(p => p.cost);
  const id = 'stkpf' + (++uid), view = [t[0], t[t.length - 1]];
  const lo = Math.min(...value, ...cost), hi = Math.max(...value, ...cost), padY = (hi - lo || hi * 0.05 || 1) * 0.08, y = [Math.max(0, lo - padY), hi + padY];
  const gain = value[value.length - 1] - cost[cost.length - 1];
  const notes = [];
  if (model.undated) notes.push(`${model.undated} ${model.undated === 1 ? 'purchase has' : 'purchases have'} no date, so ${model.undated === 1 ? 'it starts' : 'they start'} today. Add the purchase date to place ${model.undated === 1 ? 'it' : 'them'} on the chart.`);
  if (model.earlier > 0) notes.push(`${model.earlier} ${model.earlier === 1 ? 'purchase was' : 'purchases were'} made before ${fmtDate(model.firstT)}. The chart shows the last 5 years, so ${model.earlier === 1 ? 'it is' : 'they are'} counted from the first day shown.`);
  if (model.missing.length) notes.push(`No price history for ${model.missing.slice(0, 6).join(', ')}${model.missing.length > 6 ? '…' : ''}; ${model.missing.length === 1 ? 'it is' : 'they are'} counted at the price you paid.`);
  host.innerHTML = `<div class="stk-readout" id="${id}-read"></div><div class="stk-plot stk-plot-static" id="${id}-plot" tabindex="0" role="img" aria-label="Portfolio value from ${esc(fmtUsd(value[0]))} on ${esc(fmtDate(t[0]))} to ${esc(fmtUsd(value[value.length - 1]))} on ${esc(fmtDate(t[t.length - 1]))}; you put in ${esc(fmtUsd(cost[cost.length - 1]))}"></div><ul class="stk-legend"><li><i class="stk-key stk-key-line"></i>Portfolio value</li><li><i class="stk-key stk-key-dash"></i>Money you put in</li><li><i class="stk-key stk-key-dot"></i>Shares added</li></ul>${notes.map(n => `<p class="stk-note">${esc(n)}</p>`).join('')}<p class="stk-note">Tap or hover the chart to read a day. Values use daily closing prices and the shares you typed in; they are not bank or broker data.</p>`;
  const plot = host.querySelector('#' + id + '-plot'), read = host.querySelector('#' + id + '-read');
  const stepIdx = Array.from({ length: pts.length }, (_, i) => i);
  let w = 0, h = 0, svg = null;
  const buyAt = new Map(model.buys.map(b => [b.t, b.label]));
  const showLast = () => { const i = pts.length - 1; setRead(i, false); };
  function setRead(i, hover) {
    const p = pts[i], g = p.value - p.cost, pct = p.cost > 0 ? g / p.cost * 100 : null, buy = hover && buyAt.get(p.t);
    read.innerHTML = `<strong>${esc(fmtUsdExact(p.value))}</strong><span class="${g >= 0 ? 'stk-up' : 'stk-down'}">${esc(signed(g))}${esc(pctText(pct))} vs money in</span><small>${esc(hover ? '' : 'Latest · ')}${esc(fmtDate(p.t))} · put in ${esc(fmtUsdExact(p.cost))}${buy ? ' · ' + esc(buy) : ''}</small>`;
  }
  function draw() {
    const nw = Math.max(260, Math.round(plot.clientWidth) || 640); if (nw === w && svg) return;
    w = nw; h = w < 480 ? 230 : 290;
    plot.innerHTML = chartSvg({ id, w, h, view, y, line: { t, v: value, idx: stepIdx }, second: { t, v: cost, idx: stepIdx }, markers: model.buys.map(b => ({ t: b.t, v: b.value, label: b.label + ' · ' + fmtDate(b.t) })), tone: gain >= 0 ? 'up' : 'down', step: true });
    svg = plot.querySelector('svg');
  }
  const onMove = e => {
    if (!svg) return;
    const geo = geometry(plot, w, h, view); let i = nearestIndex(t, geo.tAt(e.clientX));
    while (i + 1 < t.length && t[i + 1] === t[i]) i++;
    const X = pts[i].t; const x = PAD.l + (X - view[0]) / (view[1] - view[0] || 1) * (w - PAD.l - PAD.r), yy = PAD.t + (1 - (pts[i].value - y[0]) / (y[1] - y[0] || 1)) * (h - PAD.t - PAD.b);
    moveCursor(svg, x, yy); setRead(i, true);
  };
  plot.addEventListener('pointermove', onMove);
  plot.addEventListener('pointerdown', onMove);
  plot.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hideCursor(svg); showLast(); } });
  plot.addEventListener('keydown', e => { if (e.key === 'Escape') { hideCursor(svg); showLast(); } });
  draw(); showLast();
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { if (!host.isConnected) { ro.disconnect(); return; } draw(); }); ro.observe(plot); }
  return { destroy() { if (ro) ro.disconnect(); } };
}

/* ---- Zoomable single-stock chart ------------------------------------------- */
export function mountZoomChart(host, { symbol, series, lots = [], source = '' }) {
  const id = 'stkz' + (++uid), full = [series.t[0], series.t[series.t.length - 1]];
  let view = [full[0], full[1]];
  const marks = lots.filter(l => l.buyDate).map(l => { const t = Date.parse(l.buyDate + 'T00:00:00Z'); const i = nearestIndex(series.t, t); return Number.isFinite(t) && i >= 0 && t >= full[0] ? { t, v: series.v[i], label: `Bought ${l.shares} ${symbol} at ${fmtUsdExact(l.buyPrice)} · ${fmtDate(t)}` } : null; }).filter(Boolean);
  const ranges = ['1M', '6M', '1Y', '5Y'].map(k => `<button type="button" class="stk-chip" data-z="${k}" aria-pressed="false">${k}</button>`).join('');
  host.innerHTML = `<div class="stk-readout" id="${id}-read" aria-live="off"></div><div class="stk-plot" id="${id}-plot" tabindex="0" role="group" aria-label="${esc(symbol)} price chart. Plus and minus zoom, arrow keys move, Home shows everything."></div><div class="stk-toolbar"><div class="stk-ranges" role="group" aria-label="Time range">${ranges}</div><div class="stk-zoom" role="group" aria-label="Zoom"><button type="button" class="stk-btn stk-round" data-z="out" aria-label="Zoom out">−</button><button type="button" class="stk-btn stk-round" data-z="in" aria-label="Zoom in">+</button><button type="button" class="stk-btn" data-z="reset">Reset</button></div></div><p class="stk-hint">Pinch, scroll or double-tap to zoom · drag to move${marks.length ? ' · dots are your purchases' : ''}</p><p class="stk-note">Daily closing prices${source ? ' from ' + esc(source) : ''}, adjusted for splits. Past prices do not predict future ones.</p><span class="stk-sr" id="${id}-sr" role="status" aria-live="polite"></span>`;
  const plot = host.querySelector('#' + id + '-plot'), read = host.querySelector('#' + id + '-read'), sr = host.querySelector('#' + id + '-sr');
  let w = 0, h = 0, svg = null, geo = null, st = null, y = [0, 1], raf = 0, hoverIdx = -1;

  function setRead(i, hover) {
    const price = series.v[i], base = st ? st.first : price, chg = price - base, pct = base > 0 ? chg / base * 100 : null;
    read.innerHTML = `<strong>${esc(fmtUsdExact(price))}</strong><span class="${chg >= 0 ? 'stk-up' : 'stk-down'}">${esc(signed(chg))}${esc(pctText(pct))} ${hover ? 'since ' + esc(fmtDate(series.t[st.a])) : 'in this view'}</span><small>${esc(fmtDate(series.t[i]))}${hover ? '' : ' · ' + esc(fmtDate(series.t[st.a])) + ' to ' + esc(fmtDate(series.t[st.b]))}</small>`;
  }
  function draw() {
    raf = 0;
    w = Math.max(260, Math.round(plot.clientWidth) || 640); h = w < 480 ? 250 : 320;
    st = viewStats(series, view);
    const span = st.hi - st.lo || st.hi * 0.02; y = [Math.max(0, st.lo - span * 0.1), st.hi + span * 0.1];
    const idx = decimate(series.v, st.draw0, st.draw1, Math.max(200, Math.round(w * 1.4)));
    plot.innerHTML = chartSvg({ id, w, h, view, y, line: { t: series.t, v: series.v, idx }, markers: marks, tone: st.change >= 0 ? 'up' : 'down' });
    svg = plot.querySelector('svg'); geo = geometry(plot, w, h, view); hoverIdx = -1;
    setRead(st.b, false);
    const on = activeRange(view, full);
    host.querySelectorAll('[data-z]').forEach(b => { if (b.classList.contains('stk-chip')) { const p = b.dataset.z === on; b.classList.toggle('is-on', p); b.setAttribute('aria-pressed', String(p)); } });
    const zin = host.querySelector('[data-z="in"]'), zout = host.querySelector('[data-z="out"]'), reset = host.querySelector('[data-z="reset"]');
    const sp = view[1] - view[0], fs = full[1] - full[0];
    if (zin) zin.disabled = sp <= minSpanFor(full) + 1; if (zout) zout.disabled = sp >= fs - 1; if (reset) reset.disabled = sp >= fs - 1;
    plot.setAttribute('data-zoomed', String(sp < fs - 1));
    sr.textContent = `${symbol}: ${fmtDate(series.t[st.a])} to ${fmtDate(series.t[st.b])}, from ${fmtUsdExact(st.first)} to ${fmtUsdExact(st.last)}.`;
  }
  const G = () => (geo = geometry(plot, w, h, view));
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const set = v => { view = clampView(v, full); schedule(); };
  const xOf = t => PAD.l + (t - view[0]) / (view[1] - view[0] || 1) * (w - PAD.l - PAD.r);

  function hover(clientX) {
    if (!st || !geo) return;
    G(); let i = nearestIndex(series.t, geo.tAt(clientX)); i = Math.min(st.b, Math.max(st.a, i));
    hoverIdx = i; moveCursor(svg, xOf(series.t[i]), PAD.t + (1 - (series.v[i] - y[0]) / (y[1] - y[0] || 1)) * (h - PAD.t - PAD.b)); setRead(i, true);
  }
  const clearHover = () => { if (hoverIdx >= 0 && st) { hoverIdx = -1; hideCursor(svg); setRead(st.b, false); } };

  /* Pointer handling: one pointer pans, two pinch, a quick second tap zooms in. Mouse, touch and pen all use this path. */
  const ptrs = new Map(); let drag = null, pinch = null, tap = { t: 0, x: 0 };
  const mid = () => { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
  plot.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { plot.setPointerCapture(e.pointerId); } catch { /* not capturable; moves still arrive */ }
    G(); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, view: view.slice(), moved: false };
    else if (ptrs.size === 2) { drag = null; const m = mid(); pinch = { d: m.d, span: view[1] - view[0], anchor: geo.tAt(m.x) }; }
  });
  plot.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') hover(e.clientX); return; }
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size === 2) {
      const m = mid(), span = pinch.span * pinch.d / m.d, frac = ((m.x - geo.left) * geo.k - PAD.l) / geo.plotW;
      set([pinch.anchor - frac * span, pinch.anchor + (1 - frac) * span]);
    } else if (drag && ptrs.size === 1) {
      const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true;
      if (drag.moved) { const dt = -dx * geo.k / geo.plotW * (drag.view[1] - drag.view[0]); view = panView(drag.view, full, dt); schedule(); }
      else if (e.pointerType === 'mouse') hover(e.clientX);
    }
  });
  const up = e => {
    const had = ptrs.delete(e.pointerId); if (!had) return;
    try { plot.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (pinch && ptrs.size < 2) pinch = null;
    if (ptrs.size === 1) { const [r] = ptrs.values(); drag = { x: r.x, view: view.slice(), moved: true }; return; }
    if (ptrs.size === 0 && drag && !drag.moved && e.type === 'pointerup') {
      const now = Date.now();
      if (now - tap.t < 450 && Math.abs(e.clientX - tap.x) < 30) {
        G(); tap.t = 0; const full1 = view[1] - view[0] >= full[1] - full[0] - 1, atMin = view[1] - view[0] <= minSpanFor(full) + 1;
        set(atMin ? full : zoomView(view, full, geo.tAt(e.clientX), full1 ? 0.35 : 0.5));
      } else { tap = { t: now, x: e.clientX }; if (e.pointerType !== 'mouse') hover(e.clientX); }
    }
    if (ptrs.size === 0) drag = null;
  };
  plot.addEventListener('pointerup', up); plot.addEventListener('pointercancel', up);
  plot.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) clearHover(); });

  /* Desktop: wheel / trackpad. Ctrl+wheel is a trackpad pinch; sideways scroll moves the view. */
  plot.addEventListener('wheel', e => {
    e.preventDefault(); if (!geo) return; G();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { set(panView(view, full, e.deltaX * unit * geo.k / geo.plotW * (view[1] - view[0]))); return; }
    const f = Math.exp(Math.max(-200, Math.min(200, e.deltaY * unit)) * (e.ctrlKey ? 0.01 : 0.0018));
    set(zoomView(view, full, geo.tAt(e.clientX), f));
  }, { passive: false });
  /* Safari (desktop trackpad pinch, and iOS as a safety net): stop the page zooming, use the scale ourselves. Ignored while pointer pinch is active. */
  let g0 = null;
  const stop = e => e.preventDefault();
  plot.addEventListener('gesturestart', e => { stop(e); if (ptrs.size < 2 && geo) G(); if (ptrs.size < 2 && geo) g0 = { span: view[1] - view[0], anchor: geo.tAt(e.clientX || geo.left + geo.plotW / 2) }; });
  plot.addEventListener('gesturechange', e => { stop(e); if (!g0 || ptrs.size >= 2 || !(e.scale > 0)) return; const span = g0.span / e.scale, a = (g0.anchor - view[0]) / (view[1] - view[0] || 1); set([g0.anchor - a * span, g0.anchor + (1 - a) * span]); });
  plot.addEventListener('gestureend', e => { stop(e); g0 = null; });

  plot.addEventListener('keydown', e => {
    const k = e.key, mid = (view[0] + view[1]) / 2, sp = view[1] - view[0];
    if (k === '+' || k === '=') set(zoomView(view, full, mid, 0.6));
    else if (k === '-' || k === '_') set(zoomView(view, full, mid, 1 / 0.6));
    else if (k === 'ArrowLeft') set(panView(view, full, -sp * 0.2));
    else if (k === 'ArrowRight') set(panView(view, full, sp * 0.2));
    else if (k === 'Home' || k === '0') set(full.slice());
    else return;
    e.preventDefault();
  });
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b || !host.contains(b) || b.disabled) return;
    const z = b.dataset.z, mid = (view[0] + view[1]) / 2;
    if (z === 'in') set(zoomView(view, full, mid, 0.5)); else if (z === 'out') set(zoomView(view, full, mid, 2)); else if (z === 'reset') set(full.slice()); else set(rangeView(full, z));
  });
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { if (!host.isConnected) { ro.disconnect(); return; } if (Math.round(plot.clientWidth) !== w) schedule(); }); ro.observe(plot); }
  draw();
  return { destroy() { if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); }, getView: () => view.slice(), full };
}

/* ---- Modal ------------------------------------------------------------------ */
export function openStockChart({ symbol, name = '', lots = [], load, opener = null, doc = document }) {
  const root = doc.createElement('div'); root.className = 'stk-backdrop';
  const title = 'stkTitle' + (++uid);
  root.innerHTML = `<section class="stk-dialog" role="dialog" aria-modal="true" aria-labelledby="${title}"><div class="stk-dialog-head"><div><h2 id="${title}">${esc(symbol)}</h2><p>${esc(name)} · past 5 years</p></div><button type="button" class="stk-btn stk-close" data-close aria-label="Close chart">✕</button></div><div class="stk-dialog-body"><p class="stk-status" role="status">Loading 5 years of prices…</p></div></section>`;
  const body = root.querySelector('.stk-dialog-body'), dialog = root.querySelector('.stk-dialog');
  const prevOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden';
  doc.body.appendChild(root);
  let chart = null, closed = false;
  const close = () => {
    if (closed) return; closed = true; if (chart) chart.destroy();
    doc.removeEventListener('keydown', onKey, true); root.remove(); doc.body.style.overflow = prevOverflow;
    if (opener && opener.isConnected) { try { opener.focus({ preventScroll: true }); } catch { opener.focus(); } }
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...dialog.querySelectorAll('button:not([disabled]),[tabindex="0"]')]; if (!f.length) return;
    const first = f[0], last = f[f.length - 1], at = doc.activeElement;
    if (!dialog.contains(at)) { first.focus(); e.preventDefault(); } else if (e.shiftKey && at === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && at === last) { first.focus(); e.preventDefault(); }
  };
  doc.addEventListener('keydown', onKey, true);
  root.addEventListener('click', e => { if (e.target === root || e.target.closest('[data-close]')) close(); });
  root.querySelector('[data-close]').focus();
  const run = () => {
    body.innerHTML = '<p class="stk-status" role="status">Loading 5 years of prices…</p>';
    Promise.resolve().then(load).then(res => {
      if (closed) return;
      body.innerHTML = ''; chart = mountZoomChart(body, { symbol, series: res.series, lots, source: res.source });
    }).catch(err => {
      if (closed) return;
      body.innerHTML = `<p class="stk-status stk-error" role="alert">${esc(err && err.message || 'Could not load the price history.')}</p><button type="button" class="stk-btn" data-retry>Try again</button>`;
      body.querySelector('[data-retry]').addEventListener('click', run);
    });
  };
  run();
  return { close };
}
