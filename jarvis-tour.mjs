/* Jarvis guided tours: about 30 seconds each, auto-playing (no clicking through).
   Jarvis glides to parts of the screen and a caption explains each one.
   One intro tour after sign-in, then one short tour the first time each section opens.
   "Seen" is remembered per person (uid) per tour; raising TOUR_VERSION shows every tour to everybody again. */
export const TOUR_VERSION = 'v1';
export const TOUR_TOTAL_MS = 30000;

const PAGE = ['#content > section:nth-of-type(1)', '#content > *:nth-child(1)', '#content'];
const nth = n => ['#content > *:nth-child(' + n + ')', '#content > section:nth-of-type(' + n + ')', '#content'];
const ORB = ['.nsj-orb'];
const TOP = ['.top-actions', '.topbar'];
const NAV = ['#mobileDock', '.breadcrumb', '.topbar'];
const SOUND = ['.nsx-sound', '[aria-label*="sound" i]', '.top-actions'];

export const TOURS = {
  Intro: { title: 'Welcome to Northstar', steps: [
    { targets: ['.topbar'], text: "Hi, I'm Jarvis. Over the next 30 seconds I'll show you around. You don't need to click anything.", weight: 5 },
    { targets: PAGE, text: 'This is Overview: your balances, spending and goals in one calm picture.', weight: 5 },
    { targets: NAV, text: 'Move between sections here: activity, accounts, budgets, goals, plans and stocks.', weight: 5 },
    { targets: SOUND, text: 'Sounds are on so you get a little feedback. Tap this any time to mute them.', weight: 4 },
    { targets: ORB, text: "That's me. Ask me about your accounts, goals or stocks and I'll answer from your own data.", weight: 6 },
    { targets: TOP, text: 'Your sign-in and settings live up here. Each section gets its own short tour the first time you open it.', weight: 5 },
  ] },
  Overview: { title: 'Overview', steps: [
    { targets: PAGE, text: 'Overview is your home base. It always shows where you stand right now.', weight: 5 },
    { targets: nth(2), text: 'The big numbers up top are your totals. They update the moment you add anything.', weight: 5 },
    { targets: nth(3), text: 'Charts show how money moves over time, so trends stand out.', weight: 5 },
    { targets: nth(4), text: 'Below that you will find upcoming bills, goals and reminders.', weight: 5 },
    { targets: ORB, text: 'Not sure what a number means? Ask me and I will explain it.', weight: 5 },
    { targets: NAV, text: 'Use the menu to jump anywhere. Every section has a tour like this one.', weight: 5 },
  ] },
  Transactions: { title: 'Transactions', steps: [
    { targets: PAGE, text: 'Transactions is every dollar in, out and between your accounts.', weight: 5 },
    { targets: nth(2), text: 'Add a transaction here. You can even split income across several accounts.', weight: 6 },
    { targets: nth(3), text: 'Search and filter to find any entry fast.', weight: 5 },
    { targets: nth(4), text: 'Tap a row to edit or delete it. Deletes can be undone for a moment.', weight: 5 },
    { targets: ORB, text: 'Ask me things like "how much did I spend on food this month?"', weight: 5 },
    { targets: NAV, text: 'Every change here updates your balances and charts straight away.', weight: 4 },
  ] },
  Accounts: { title: 'Accounts', steps: [
    { targets: PAGE, text: 'Accounts holds the places your money lives: checking, savings, cash and more.', weight: 6 },
    { targets: nth(2), text: 'Add an account and give it a starting balance.', weight: 5 },
    { targets: nth(3), text: 'Each card shows the balance and recent movement.', weight: 5 },
    { targets: nth(4), text: 'Transfers between accounts keep your total correct.', weight: 5 },
    { targets: ORB, text: 'I can compare your accounts or tell you where most of your money sits.', weight: 5 },
    { targets: NAV, text: 'Head to Transactions to record what moves between them.', weight: 4 },
  ] },
  Budgets: { title: 'Budgets', steps: [
    { targets: PAGE, text: 'Budgets give every spending category a monthly limit.', weight: 5 },
    { targets: nth(2), text: 'Set a limit for each category you care about.', weight: 5 },
    { targets: nth(3), text: 'Bars fill as you spend, so you see trouble before it lands.', weight: 6 },
    { targets: nth(4), text: 'Anything over its limit is flagged so you can adjust.', weight: 5 },
    { targets: ORB, text: 'Ask me which category is running hottest this month.', weight: 5 },
    { targets: NAV, text: 'Budgets read your Transactions automatically.', weight: 4 },
  ] },
  Goals: { title: 'Goals', steps: [
    { targets: PAGE, text: 'Goals give your savings a destination and a date.', weight: 5 },
    { targets: nth(2), text: 'Create a goal with a target amount and a finish date.', weight: 5 },
    { targets: nth(3), text: 'The chart shows your pace and when you will actually arrive.', weight: 6 },
    { targets: nth(4), text: 'Hit a milestone and Northstar celebrates with you.', weight: 5 },
    { targets: ORB, text: 'I can tell you how much to set aside each month to stay on track.', weight: 5 },
    { targets: NAV, text: 'Contributions you record show up here on their own.', weight: 4 },
  ] },
  Purchases: { title: 'Plan', steps: [
    { targets: PAGE, text: 'Plan is for things you want to buy, with the cost and date.', weight: 5 },
    { targets: nth(2), text: 'Add a purchase or paste a shop link and I will try to read the price.', weight: 6 },
    { targets: nth(3), text: 'See what is coming up and whether you can afford it.', weight: 5 },
    { targets: nth(4), text: 'Mark an item bought and it moves to your completed list.', weight: 5 },
    { targets: ORB, text: 'Say "buy" and a product name and I will go looking for a price.', weight: 5 },
    { targets: NAV, text: 'Reminders for due purchases appear on the Plan icon.', weight: 4 },
  ] },
  Stocks: { title: 'Stocks', steps: [
    { targets: PAGE, text: 'Stocks is your watchlist and your portfolio.', weight: 5 },
    { targets: nth(2), text: 'The big chart is your total portfolio value. It steps up when you add shares.', weight: 6 },
    { targets: nth(3), text: 'Add tickers to watch. Prices refresh on their own.', weight: 5 },
    { targets: nth(4), text: 'Tap any stock for five years of history, then pinch or scroll to zoom in.', weight: 6 },
    { targets: ORB, text: 'Ask me how your portfolio is doing and I will read it for you.', weight: 4 },
    { targets: NAV, text: 'Nothing here moves real money. It is for tracking only.', weight: 4 },
  ] },
  Guide: { title: 'Guide', steps: [
    { targets: PAGE, text: 'Your Guide stores your planning profile: income, bills and goals.', weight: 6 },
    { targets: nth(2), text: 'Fill in what you know. I use it to give better advice.', weight: 6 },
    { targets: nth(3), text: 'Notes here are only for you.', weight: 5 },
    { targets: nth(4), text: 'Update it whenever your life changes.', weight: 5 },
    { targets: ORB, text: 'Ask me for a plan and I will start from this profile.', weight: 5 },
    { targets: NAV, text: 'Changes save automatically.', weight: 3 },
  ] },
  Settings: { title: 'Settings', steps: [
    { targets: PAGE, text: 'Settings is where your data and preferences live.', weight: 5 },
    { targets: nth(2), text: 'Export your data or back it up whenever you like.', weight: 5 },
    { targets: nth(3), text: 'Choose your currency, and turn sounds and celebrations on or off.', weight: 6 },
    { targets: nth(4), text: 'You can replay the welcome or any tour from here.', weight: 5 },
    { targets: ORB, text: 'Jarvis settings are in my panel, under the gear.', weight: 5 },
    { targets: TOP, text: 'Sign out from the top bar. Your data stays safe in your account.', weight: 4 },
  ] },
};

export const tourKeyFor = page => (page === 'Northstar Guide' ? 'Guide' : page);

/* Weights become whole milliseconds that add up to exactly `total`. */
export function planDurations(steps, total = TOUR_TOTAL_MS) {
  const sum = steps.reduce((s, x) => s + (x.weight || 1), 0) || 1;
  const out = steps.map(x => Math.floor(((x.weight || 1) / sum) * total));
  out[out.length - 1] += total - out.reduce((s, n) => s + n, 0);
  return out;
}

export const seenKey = (uid, key) => `northstar-tour-${TOUR_VERSION}:${uid || 'anon'}:${key}`;
export function hasSeen(storage, uid, key) { try { return storage.getItem(seenKey(uid, key)) === '1'; } catch (e) { return false; } }
export function markSeen(storage, uid, key) { try { storage.setItem(seenKey(uid, key), '1'); } catch (e) { /* private mode: it may repeat */ } }

/* Where Jarvis and the caption go. All pure so it can be tested. rect may be null (centre of screen). */
export function placeGuide(rect, vw, vh, card = { w: 300, h: 130 }, orb = 46) {
  const pad = 12, clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const cw = Math.min(card.w, vw - pad * 2), ch = card.h;
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { orb: { x: vw / 2 - orb / 2, y: vh / 2 - ch / 2 - orb - 8 }, card: { x: (vw - cw) / 2, y: vh / 2 - ch / 2, w: cw }, ring: null };
  }
  const below = vh - rect.bottom, above = rect.top;
  let cy = below >= ch + orb + pad * 2 ? rect.bottom + pad + 4 : above >= ch + pad * 2 ? rect.top - ch - pad - 4 : vh - ch - pad;
  if (cy + ch > vh - pad) cy = vh - ch - pad;
  const cx = clamp(rect.left + rect.width / 2 - cw / 2, pad, vw - cw - pad);
  const ox = clamp(rect.left + Math.min(rect.width, 80) / 2 - orb / 2, pad, vw - orb - pad);
  const oy = clamp(cy < rect.top ? cy + ch + 4 : cy - orb - 4, pad, vh - orb - pad);
  const ring = { x: Math.max(4, rect.left - 6), y: Math.max(4, rect.top - 6), w: Math.min(vw - 8, rect.width + 12), h: Math.min(vh - 8, rect.height + 12) };
  return { orb: { x: ox, y: oy }, card: { x: cx, y: cy, w: cw }, ring };
}

const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
export function resolveTarget(doc, targets) {
  for (const sel of targets || []) { let el = null; try { el = doc.querySelector(sel); } catch (e) { el = null; } if (visible(el)) return el; }
  return null;
}

/* The runtime. `env` supplies page/user/gate checks so this file never reaches into the app by itself. */
export function createTour(env) {
  const { doc = document, win = window, storage = win.localStorage, sound = () => win.NorthstarSound, total = TOUR_TOTAL_MS } = env;
  let root = null, timer = 0, running = null, startedAt = 0;
  const reduce = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const say = fn => { try { const s = sound(); s && s[fn] && s[fn](); } catch (e) { /* sound is a bonus */ } };

  function build() {
    root = doc.createElement('div');
    root.className = 'nstour'; root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Jarvis tour');
    root.innerHTML = '<div class="nstour-ring"></div><div class="nstour-orb" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3.4 13.6 8.6 18.8 10.2 13.6 11.8 12 17 10.4 11.8 5.2 10.2 10.4 8.6z"/></svg></div>' +
      '<div class="nstour-card"><div class="nstour-head"><strong>Jarvis</strong><span class="nstour-title"></span><button type="button" class="nstour-skip">Skip tour</button></div><p class="nstour-text" aria-live="polite"></p><div class="nstour-bar" aria-hidden="true"><i></i></div></div>';
    doc.body.appendChild(root);
    root.querySelector('.nstour-skip').addEventListener('click', () => stop('skipped'));
  }
  function place(step) {
    const el = resolveTarget(doc, step.targets);
    if (el && el.scrollIntoView) { const r0 = el.getBoundingClientRect(); if (r0.top < 56 || r0.bottom > win.innerHeight - 8) el.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); }
    const card = root.querySelector('.nstour-card'), h = card.offsetHeight || 130;
    const p = placeGuide(el ? el.getBoundingClientRect() : null, win.innerWidth, win.innerHeight, { w: 320, h }, 46);
    root.querySelector('.nstour-orb').style.transform = `translate(${Math.round(p.orb.x)}px,${Math.round(p.orb.y)}px)`;
    card.style.transform = `translate(${Math.round(p.card.x)}px,${Math.round(p.card.y)}px)`; card.style.width = Math.round(p.card.w) + 'px';
    const ring = root.querySelector('.nstour-ring');
    if (p.ring) { ring.style.opacity = '1'; ring.style.transform = `translate(${Math.round(p.ring.x)}px,${Math.round(p.ring.y)}px)`; ring.style.width = Math.round(p.ring.w) + 'px'; ring.style.height = Math.round(p.ring.h) + 'px'; } else ring.style.opacity = '0';
    return p;
  }
  function stop(why) {
    win.clearTimeout(timer); timer = 0;
    doc.removeEventListener('keydown', onKey, true); win.removeEventListener('resize', onResize);
    if (root) { root.remove(); root = null; }
    const was = running; running = null;
    if (was && why === 'done') say('success');
    return was;
  }
  const onKey = e => { if (e.key === 'Escape' && running) { e.preventDefault(); e.stopPropagation(); stop('skipped'); } };
  const onResize = () => { if (running) place(running.steps[running.index]); };

  function start(key, uid) {
    const tour = TOURS[key]; if (!tour) return false;
    stop('replaced'); markSeen(storage, uid, key);
    const durations = planDurations(tour.steps, total);
    running = { key, uid, steps: tour.steps, durations, index: -1 };
    build(); startedAt = Date.now();
    root.querySelector('.nstour-title').textContent = tour.title;
    const bar = root.querySelector('.nstour-bar i');
    bar.style.transition = 'none'; bar.style.width = '0%';
    void bar.offsetWidth; bar.style.transition = `width ${total}ms linear`; bar.style.width = '100%';
    doc.addEventListener('keydown', onKey, true); win.addEventListener('resize', onResize);
    const next = () => {
      if (!running) return;
      if (env.shouldStop && env.shouldStop(running.key)) { stop('interrupted'); return; }
      running.index++;
      if (running.index >= running.steps.length) { stop('done'); return; }
      const step = running.steps[running.index];
      root.querySelector('.nstour-text').textContent = step.text;
      place(step); say(running.index === 0 ? 'tap' : 'whoosh');
      timer = win.setTimeout(next, running.durations[running.index]);
    };
    next();
    return true;
  }
  return {
    start, stop: () => stop('stopped'),
    isRunning: () => !!running, current: () => running && { key: running.key, index: running.index, steps: running.steps.length },
    hasSeen: (uid, key) => hasSeen(storage, uid, key),
    /* Called when the person changes section or signs in. Intro first, then section tours. */
    maybeStart(page, uid) {
      if (running || !uid) return false;
      const key = tourKeyFor(page);
      if (!hasSeen(storage, uid, 'Intro') && page === 'Overview') { markSeen(storage, uid, 'Overview'); return start('Intro', uid); }
      if (TOURS[key] && !hasSeen(storage, uid, key)) return start(key, uid);
      return false;
    },
  };
}
