// Run with: node --test tests/welcome.test.cjs
// Dependency-free regression checks for the optional welcome screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(start, end) {
  const first = html.indexOf(start), last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing section: ${start}`);
  return html.slice(first, last);
}
function classList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    contains: name => classes.has(name),
  };
}
function welcomeHarness({ storageFails = false, reduced = false } = {}) {
  const timers = new Map(), storage = new Map(), notices = [];
  let timerId = 0, focus = null;
  const motionListeners = new Set();
  const motion = { matches: reduced, addEventListener(type, listener) { if (type === 'change') motionListeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'change') motionListeners.delete(listener); } };
  const root = { classList: classList() };
  const screen = { classList: classList(), attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  const scroll = { scrollTop: 350 }, shell = {}, dock = {};
  const entry = { isConnected: true, focus() { focus = 'entry'; } };
  const content = { isConnected: true, focus() { focus = 'content'; } };
  const trigger = { isConnected: true, focus() { focus = 'trigger'; } };
  const elements = { welcomeScreen: screen, welcomeScroll: scroll, welcomeEnter: entry, content, mobileDock: dock };
  const context = vm.createContext({
    $: name => elements[name],
    document: { documentElement: root, activeElement: content, querySelector: () => shell },
    localStorage: {
      setItem(name, value) { if (storageFails) throw new Error('blocked'); storage.set(name, value); },
      removeItem(name) { if (storageFails) throw new Error('blocked'); storage.delete(name); },
    },
    window: {
      NorthstarVaultLocked: false,
      matchMedia: () => motion,
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    syncLoading: false, confirmResolver: null,
    updateWelcomeProgress() {}, showToast: text => notices.push(text),
  });
  vm.runInContext(section('function isWelcomeVisible(){', '\nfunction setCloudLoading('), context);
  vm.runInContext(section('let welcomeDismissTimer=', '\nfunction openByAction('), context);
  return {
    context, root, screen, scroll, shell, dock, entry, content, trigger, storage, timers, notices, motionListeners,
    get focus() { return focus; },
    setReduced(matches) { motion.matches = matches; for (const listener of [...motionListeners]) listener({ matches }); },
    flush() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
  };
}

test('the direct entry is outside the labelled native scroller and the journey stays optional', () => {
  const intro = section('<section class="welcome-screen"', '\n<div class="app-shell">');
  assert.match(intro, /role="dialog" aria-modal="true"/);
  assert.match(intro, /id="welcomeEnter" type="button" data-action="dismiss-welcome">Enter Northstar/);
  assert.match(intro, /class="ns-garage" aria-hidden="true"/, 'the shutter is decorative');
  assert.ok(intro.indexOf('id="welcomeEnter"') < intro.indexOf('id="welcomeScroll"'));
  assert.match(intro, /id="welcomeScroll" role="region" aria-label="Northstar introduction" tabindex="0"/);
  assert.match(intro, /id="welcomeContinue" type="button" data-action="welcome-scroll"/);
  assert.match(intro, /data-action="dismiss-welcome">Set my course/);
  const css = section('<style id="welcome-access">', '</style>');
  assert.match(css, /#welcomeScreen\{[^}]*flex-direction:column[^}]*overflow:hidden/);
  assert.match(css, /#welcomeScroll\{[^}]*min-height:0[^}]*overflow-y:auto[^}]*-webkit-overflow-scrolling:touch/);
  assert.match(css, /touch-action:pan-y pinch-zoom/);
  assert.match(css, /prefers-reduced-motion/);
  const motionCss = section('<style id="welcome-garage-motion">', '</style>');
  assert.match(motionCss, /@keyframes nsGarageLift/);
  assert.match(motionCss, /prefers-reduced-motion:reduce/);
  assert.match(motionCss, /\.ns-garage\{display:none/);
});

test('journey progress and the explore action use the intro scroller, not the page', () => {
  const bar = { style: {} };
  const scroll = {
    scrollTop: 100, scrollHeight: 1100, clientHeight: 100,
    getBoundingClientRect: () => ({ top: 60 }),
    scrollTo(options) { this.options = options; },
  };
  const journey = { getBoundingClientRect: () => ({ top: 480 }) };
  let immediate = true;
  const context = vm.createContext({
    $: name => ({ welcomeScroll: scroll, welcomeProgressBar: bar, welcomeJourney: journey })[name],
    window: { matchMedia: () => ({ matches: immediate }) },
  });
  vm.runInContext(section('function updateWelcomeProgress(){', '\nfunction setSync('), context);
  context.updateWelcomeProgress();
  assert.equal(bar.style.width, '10.0%');
  context.scrollWelcomeJourney();
  assert.equal(scroll.options.top, 520);
  assert.equal(scroll.options.behavior, 'auto');
  immediate = false;
  context.scrollWelcomeJourney();
  assert.equal(scroll.options.behavior, 'smooth');
  scroll.scrollTo = () => { throw new Error('unsupported options'); };
  context.scrollWelcomeJourney();
  assert.equal(scroll.scrollTop, 520, 'older browsers fall back to scrollTop');
  scroll.scrollTop = -30;
  context.updateWelcomeProgress();
  assert.equal(bar.style.width, '0.0%');
});

test('blocked welcome storage still permits entry and explains that dismissal will not persist', () => {
  const h = welcomeHarness({ storageFails: true });
  h.context.updateBackgroundAvailability();
  h.context.dismissWelcome();
  h.flush();
  assert.equal(h.screen.classList.contains('hidden'), true);
  assert.equal(h.root.classList.contains('northstar-seen'), true);
  assert.equal(h.shell.inert, false);
  assert.equal(h.focus, 'content');
  assert.match(h.notices[0], /intro may return on reload/i);
});

test('a locked vault prevents dismiss, replay, and delayed welcome focus', () => {
  const h = welcomeHarness();
  h.context.window.NorthstarVaultLocked = true;
  h.context.updateBackgroundAvailability();
  h.context.dismissWelcome();
  h.context.showWelcome(h.trigger);
  h.context.focusWelcomeEntry();
  h.flush();
  assert.equal(h.screen.classList.contains('hidden'), false);
  assert.equal(h.root.classList.contains('northstar-seen'), false);
  assert.equal(h.storage.size, 0);
  assert.equal(h.focus, null);
  assert.equal(h.shell.inert, true);
  assert.equal(h.dock.inert, true);
});

test('replay cancels an unfinished dismissal and restores focus to its trigger when closed', () => {
  const h = welcomeHarness();
  h.context.dismissWelcome();
  assert.equal(h.timers.size, 1);
  h.context.showWelcome(h.trigger);
  assert.equal(h.motionListeners.size, 0, 'replay removes the pending motion listener');
  h.setReduced(true);
  h.flush();
  assert.equal(h.screen.classList.contains('hidden'), false);
  assert.equal(h.screen.classList.contains('welcome-leaving'), false);
  assert.equal(h.storage.has('northstar-welcome-seen-v1'), false);
  assert.equal(h.scroll.scrollTop, 0);
  assert.equal(h.focus, 'entry');
  h.context.dismissWelcome();
  h.flush();
  assert.equal(h.focus, 'trigger');
});

test('reduced motion dismisses without a delay and cloud loading keeps the background inert', () => {
  const h = welcomeHarness({ reduced: true });
  h.context.syncLoading = true;
  h.context.dismissWelcome();
  assert.equal([...h.timers.values()][0].delay, 0);
  h.flush();
  assert.equal(h.screen.classList.contains('hidden'), true);
  assert.equal(h.shell.inert, true);
  assert.equal(h.dock.inert, true);
  h.context.syncLoading = false;
  h.context.updateBackgroundAvailability();
  assert.equal(h.shell.inert, false);
  assert.equal(h.dock.inert, false);
});

test('garage entrance starts once, releases the app, and honors a mid-animation reduced-motion change', () => {
  const h = welcomeHarness();
  h.context.updateBackgroundAvailability();
  h.context.dismissWelcome();
  assert.equal(h.screen.classList.contains('welcome-leaving'), true);
  assert.equal(h.shell.inert, true, 'the dashboard stays inert during the reveal');
  assert.equal([...h.timers.values()][0].delay, 1300);
  assert.equal(h.motionListeners.size, 1);
  let prevented = false;
  assert.equal(h.context.trapWelcomeTab({ key: 'Tab', preventDefault() { prevented = true; } }), true);
  assert.equal(prevented, true, 'focus cannot move among invisible intro controls while it opens');
  h.context.dismissWelcome();
  assert.equal(h.timers.size, 1, 'repeat presses cannot restart the animation');
  h.setReduced(true);
  assert.equal([...h.timers.values()][0].delay, 0, 'enabling reduced motion finishes immediately');
  h.flush();
  assert.equal(h.screen.classList.contains('hidden'), true);
  assert.equal(h.root.classList.contains('northstar-seen'), true);
  assert.equal(h.shell.inert, false);
  assert.equal(h.focus, 'content');
  assert.equal(h.motionListeners.size, 0);
});

test('keyboard focus wraps inside the intro but not across vault or confirmation dialogs', () => {
  const h = welcomeHarness();
  const first = { getClientRects: () => [1], focus() { h.context.document.activeElement = first; } };
  const last = { getClientRects: () => [1], focus() { h.context.document.activeElement = last; } };
  h.screen.querySelectorAll = () => [first, last];
  h.screen.contains = item => item === first || item === last;
  let prevented = false;
  const event = shiftKey => ({ key: 'Tab', shiftKey, preventDefault() { prevented = true; } });
  h.context.document.activeElement = first;
  assert.equal(h.context.trapWelcomeTab(event(true)), true);
  assert.equal(h.context.document.activeElement, last);
  assert.equal(prevented, true);
  assert.equal(h.context.trapWelcomeTab(event(false)), true);
  assert.equal(h.context.document.activeElement, first);
  h.context.confirmResolver = () => {};
  assert.equal(h.context.trapWelcomeTab(event(true)), false);
  h.context.confirmResolver = null;
  h.context.window.NorthstarVaultLocked = true;
  assert.equal(h.context.trapWelcomeTab(event(true)), false);
});

test('a pending cloud load permits intro actions while the vault guard still wins', () => {
  const handlers = {}, welcomeTarget = {}, confirmTarget = {}, appTarget = {}, vaultTarget = {};
  let vaultFocused = false;
  const screen = { contains: target => target === welcomeTarget };
  const confirmRoot = { contains: target => target === confirmTarget };
  const vaultRoot = { contains: target => target === vaultTarget };
  const context = vm.createContext({
    document: { addEventListener: (type, fn) => { handlers[type] = fn; } },
    window: { NorthstarVaultLocked: false },
    syncLoading: true,
    isWelcomeVisible: () => true,
    $: name => ({ welcomeScreen: screen, confirmRoot, vaultRoot, vaultUnlockPass: { focus() { vaultFocused = true; } } })[name],
  });
  vm.runInContext(section("['click','submit','input','change','keydown'].forEach", "\nwindow.addEventListener('storage'"), context);
  const dispatch = target => {
    const result = { target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    handlers.click(result);
    return result;
  };
  assert.equal(dispatch(welcomeTarget).prevented, false);
  assert.equal(dispatch(confirmTarget).prevented, false);
  assert.equal(dispatch(appTarget).prevented, true);
  context.window.NorthstarVaultLocked = true;
  assert.equal(dispatch(welcomeTarget).prevented, true);
  assert.equal(vaultFocused, true);
  assert.equal(dispatch(vaultTarget).prevented, false);
});
