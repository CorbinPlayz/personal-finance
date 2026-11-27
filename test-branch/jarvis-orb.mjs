/* Jarvis's living orb: it floats and drifts, squishes like a ball when touched, comments on how
   your money is going, and pops up when you finish a goal. Everything here is plain logic plus one
   small attach() that moves the existing orb button. Quiet mode turns the comments and speech off. */
export const QUIET_KEY = 'northstar-orb-quiet-v1';
export const SEEN_KEY = 'northstar-orb-seen-v1';

/* ---- squish: a spring, so a press flattens the ball and the release wobbles back ---- */
export function stepSpring(s, dt) {
  const k = 260, c = 9, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < n; i++) { const a = -k * (s.x - s.t) - c * s.v; s.v += a * h; s.x += s.v * h; }
  return s;
}
export const isSettled = s => Math.abs(s.x - s.t) < 0.002 && Math.abs(s.v) < 0.01;
/* p > 0 is squashed (wide and flat), p < 0 is stretched (tall and thin); volume stays about the same. */
export const squishScale = p => ({ sx: 1 + 0.24 * p, sy: 1 - 0.3 * p });

/* ---- float: a slow drift so the orb always feels alive ---- */
export function floatOffset(t, reduce = false) {
  if (reduce) return { x: 0, y: 0 };
  return { x: 5 * Math.sin(t / 2300) + 3 * Math.sin(t / 970), y: 6 * Math.sin(t / 1700) + 2 * Math.cos(t / 1130) };
}
/* Where the orb wanders to now and then: always left/up of its corner, so it stays on screen. */
export function pickRoam(rand, vw, vh) {
  const maxX = Math.min(130, Math.max(0, vw - 120)), maxY = Math.min(90, Math.max(0, vh - 220));
  return { x: -Math.round(rand() * maxX), y: -Math.round(rand() * maxY) };
}

/* ---- what Jarvis says about how things are going ---- */
const monthOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const DAY = 86400000;
export function pickComment(ledger, now, seen = {}) {
  if (!ledger) return null;
  const cur = (ledger.settings && ledger.settings.currency) || 'USD';
  const fmt = n => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch (e) { return '$' + Math.round(n); } };
  const month = monthOf(now), fresh = (id, days) => !(seen[id] && now.getTime() - seen[id] < days * DAY);
  const tx = (ledger.transactions || []).filter(t => String(t.date || '').startsWith(month));
  const spent = {}, income = tx.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0);
  let spending = 0;
  for (const t of tx) if (t.type === 'Expense') { spent[t.category] = (spent[t.category] || 0) + Number(t.amount || 0); spending += Number(t.amount || 0); }

  const over = (ledger.budgets || []).filter(b => b.limit > 0 && (spent[b.category] || 0) > b.limit).sort((a, b) => (spent[b.category] / b.limit) - (spent[a.category] / a.limit));
  for (const b of over) {
    const id = 'over:' + b.category + ':' + month;
    if (fresh(id, 400)) return { id, text: b.category + ' is ' + fmt(spent[b.category] - b.limit) + ' over its budget this month.', spoken: 'One of your budgets is running over this month.', mood: 'care' };
  }
  const goals = (ledger.goals || []).filter(g => g.target > 0 && g.saved < g.target);
  for (const g of goals) {
    const pct = Math.floor((g.saved / g.target) * 100), m = [90, 75, 50, 25].find(x => pct >= x);
    if (!m) continue;
    const id = 'goal:' + g.id + ':' + m;
    if (fresh(id, 4000) && !([90, 75, 50, 25].filter(x => x > m).some(x => seen['goal:' + g.id + ':' + x]) )) return { id, text: g.name + ' is ' + pct + '% funded. ' + fmt(g.target - g.saved) + ' to go.', spoken: 'You are making real progress on a goal.', mood: 'good' };
  }
  for (const a of ledger.accounts || []) {
    if (a.minimumBalance && a.type !== 'Credit' && Number(a.balance) < a.minimumBalance) {
      const id = 'low:' + a.id + ':' + month;
      if (fresh(id, 400)) return { id, text: a.name + ' is under its ' + fmt(a.minimumBalance) + ' minimum.', spoken: 'One of your accounts is below its minimum.', mood: 'care' };
    }
  }
  for (const p of ledger.purchases || []) {
    const id = 'ready:' + p.id;
    if (p.status === 'Ready' && fresh(id, 4000)) return { id, text: p.name + ' is fully funded and ready to buy.', spoken: 'Something on your wish list is fully funded.', mood: 'good' };
  }
  if (income - spending > 0 && fresh('ahead:' + month, 7)) return { id: 'ahead:' + month, text: 'You are ' + fmt(income - spending) + ' ahead this month. Nicely done.', spoken: 'You are ahead this month. Nice work.', mood: 'good' };
  return null;
}

/* ---- the orb itself ---- */
export function createOrb(env) {
  const { doc, win, getLedger, getUid, voice, sound, isBusy, onOpen } = env;
  const storage = env.storage || win.localStorage;
  const reduce = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rd = (k, d) => { try { const v = JSON.parse(storage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const wr = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const quiet = () => rd(QUIET_KEY, false) === true;
  const seenKey = () => SEEN_KEY + ':' + (getUid() || 'anon');
  let orb = null, bubble = null, raf = 0, last = 0, t0 = 0, hideTimer = 0, lastShown = 0;
  const sq = { x: 0, v: 0, t: 0 };
  const roam = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
  let lean = { x: 0, y: 0 }, pointer = null;

  function apply(now) {
    if (!orb) return;
    const f = floatOffset(now - t0, reduce());
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
    stepSpring(sq, dt);
    roam.x += (roam.tx - roam.x) * Math.min(1, dt * 0.9); roam.y += (roam.ty - roam.y) * Math.min(1, dt * 0.9);
    const ox = f.x + roam.x + lean.x, oy = f.y + roam.y + lean.y, s = squishScale(reduce() ? sq.x * 0.3 : sq.x);
    orb.style.translate = ox.toFixed(1) + 'px ' + oy.toFixed(1) + 'px';
    orb.style.scale = s.sx.toFixed(3) + ' ' + s.sy.toFixed(3);
    if (bubble && bubble.classList.contains('show')) bubble.style.translate = ox.toFixed(1) + 'px ' + oy.toFixed(1) + 'px';
    if (now > roam.next) {
      if (!reduce() && !isBusy() && !(bubble && bubble.classList.contains('show')) && !orb.classList.contains('open')) { const p = pickRoam(Math.random, win.innerWidth, win.innerHeight); roam.tx = p.x; roam.ty = p.y; }
      roam.next = now + 22000 + Math.random() * 20000;
    }
  }
  function loop(now) { apply(now); raf = win.requestAnimationFrame(loop); }
  function start() { if (!raf && !doc.hidden) { t0 = last = win.performance.now(); roam.next = t0 + 15000; raf = win.requestAnimationFrame(loop); } }
  function halt() { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } }

  function showBubble(text, { sticky = false } = {}) {
    if (!bubble) {
      bubble = doc.createElement('div'); bubble.className = 'nsj-bubble'; bubble.setAttribute('role', 'status'); bubble.setAttribute('aria-live', 'polite');
      bubble.innerHTML = '<span class="nsj-bubble-text"></span><span class="nsj-bubble-actions"><button type="button" class="nsj-bubble-quiet">Quiet</button><button type="button" class="nsj-bubble-x" aria-label="Dismiss">×</button></span>';
      doc.body.appendChild(bubble);
      bubble.addEventListener('click', e => {
        if (e.target.closest('.nsj-bubble-x')) return hideBubble();
        if (e.target.closest('.nsj-bubble-quiet')) { setQuiet(true); return hideBubble(); }
        hideBubble(); onOpen && onOpen();
      });
    }
    bubble.querySelector('.nsj-bubble-text').textContent = text;
    bubble.classList.add('show'); lastShown = Date.now();
    win.clearTimeout(hideTimer); if (!sticky) hideTimer = win.setTimeout(hideBubble, 9000);
  }
  function hideBubble() { win.clearTimeout(hideTimer); if (bubble) { bubble.classList.remove('show'); bubble.style.translate = ''; } }

  function setQuiet(on) { wr(QUIET_KEY, !!on); if (on) { hideBubble(); try { voice && voice.stop(); } catch (e) { /* ignore */ } } }
  function remember(id) { const s = rd(seenKey(), {}); s[id] = Date.now(); wr(seenKey(), s); }
  function say(c) {
    showBubble(c.text); remember(c.id);
    try { sound && sound() && sound().whoosh && sound().whoosh(); } catch (e) { /* sound is a bonus */ }
    if (c.spoken && voice) { try { voice.speak(c.spoken); } catch (e) { /* ignore */ } }
    pop(0.55);
  }
  /* A gentle comment on how things are going. Never while quiet, busy, or too soon after the last one. */
  function maybeComment(now = new Date()) {
    if (!orb || quiet() || isBusy() || doc.hidden || Date.now() - lastShown < 150000) return null;
    const c = pickComment(getLedger(), now, rd(seenKey(), {}));
    if (c) say(c);
    return c;
  }
  /* A goal was completed: pop up and cheer, even if recently chatty, unless quiet. */
  function goalDone(goal) {
    if (!orb) return;
    pop(1.1);
    if (quiet()) return;
    showBubble((goal && goal.name ? goal.name : 'Your goal') + ' is complete. You did it.', {});
    if (voice) { try { voice.speak('You did it. Goal complete.'); } catch (e) { /* ignore */ } }
  }
  /* A squishy bounce: squash down first, then spring back past normal. */
  function pop(strength = 1) { sq.t = 0; sq.x = 0.9 * strength; sq.v = -6 * strength; }

  function attach(el) {
    orb = el; start();
    el.addEventListener('pointerdown', () => { sq.t = 0.95; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { sq.t = 0; });
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); lean = { x: Math.max(-4, Math.min(4, (e.clientX - (r.left + r.width / 2)) / 8)), y: Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) / 8)) }; });
    el.addEventListener('pointerleave', () => { lean = { x: 0, y: 0 }; });
    doc.addEventListener('visibilitychange', () => (doc.hidden ? halt() : start()));
    win.setTimeout(() => maybeComment(), 14000);
    win.setInterval(() => maybeComment(), 240000);
  }
  return { attach, goalDone, maybeComment, showBubble, hideBubble, setQuiet, quiet, pop, _state: { sq, roam } };
}
