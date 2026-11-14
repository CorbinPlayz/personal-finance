// Run with: node --test tests/home-shortcut.test.cjs
// Dependency-free checks for the icon-only Home navigation and its guards.
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
function harness({ page = 'Transactions', reduced = false, welcome = false, modal = null, confirm = null, locked = false, loading = false } = {}) {
  const classes = new Set(), timers = new Map(), scroll = [], dockChanges = [], focused = [];
  let nextTimer = 0, renders = 0, canceled = 0;
  const home = { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) }, offsetWidth: 50 };
  const dock = { querySelector: () => home };
  const heading = { focus: options => focused.push(options) };
  const context = vm.createContext({
    page, purchaseDetailId: 'synthetic-plan', modalState: modal, confirmResolver: confirm, syncLoading: loading,
    isWelcomeVisible: () => welcome,
    $: id => id === 'mobileDock' ? dock : id === 'content' ? { querySelector: () => heading } : null,
    setDockMore: open => dockChanges.push(open), render: () => { renders++; }, console,
    NorthstarMotion: { cancelPurchase: () => { canceled++; } },
    window: {
      NorthstarVaultLocked: locked, matchMedia: () => ({ matches: reduced }),
      scrollTo: options => scroll.push(options),
      setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
      clearTimeout: id => timers.delete(id),
    },
  });
  vm.runInContext(section('let homeShortcutHighlightTimer=null;', '\nfunction resizeDock()'), context);
  return { context, classes, timers, scroll, dockChanges, focused, heading, get renders() { return renders; }, get canceled() { return canceled; } };
}

test('only the accessible logo button owns the shortcut, not the NORTHSTAR word', () => {
  const header = section('<header class="topbar">', '</header>');
  const button = header.match(/<button\b[^>]*id="homeShortcut"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button); assert.match(button, /type="button"/); assert.match(button, /data-action="home-shortcut"/);
  assert.match(button, /aria-label="Go to Home, Overview"/); assert.match(button, /<svg\b[^>]*aria-hidden="true"/);
  assert.doesNotMatch(button, /NORTHSTAR|data-page=/);
  assert.match(header, /<\/button><b>NORTHSTAR<\/b><\/span>/);
  const css = section('<style id="glass-dock-design">', '</style>');
  assert.match(css, /\.breadcrumb-home:focus-visible/); assert.match(css, /prefers-reduced-motion:reduce/);
});

test('a different section navigates home, focuses its heading, and highlights the dock', () => {
  const h = harness(); h.context.navigateHomeShortcut();
  assert.equal(h.context.page, 'Overview'); assert.equal(h.context.purchaseDetailId, null);
  assert.equal(h.renders, 1); assert.equal(h.canceled, 1); assert.deepEqual(h.dockChanges, [false]);
  assert.equal(h.focused.length, 1); assert.equal(h.focused[0].preventScroll, true); assert.equal(h.heading.tabIndex, -1);
  assert.equal(h.scroll.length, 1); assert.equal(h.scroll[0].top, 0); assert.equal(h.scroll[0].behavior, 'smooth');
  assert.equal(h.classes.has('home-shortcut-highlight'), true); assert.equal([...h.timers.values()][0].ms, 1000);
});

test('reduced motion uses immediate navigation instead of smooth scrolling', () => {
  const h = harness({ reduced: true }); h.context.navigateHomeShortcut();
  assert.equal(h.scroll[0].behavior, 'auto'); assert.equal(h.context.page, 'Overview');
});

test('already being on Home never rerenders, scrolls, or moves focus', () => {
  const h = harness({ page: 'Overview' }); h.context.navigateHomeShortcut();
  assert.equal(h.renders, 0); assert.deepEqual(h.scroll, []); assert.deepEqual(h.focused, []);
  assert.deepEqual(h.dockChanges, [false]); assert.equal(h.classes.has('home-shortcut-highlight'), true);
});

test('forms, confirmations, welcome, cloud loading, and a locked vault all block the shortcut', () => {
  for (const options of [{ modal: { kind: 'transaction' } }, { confirm: () => {} }, { welcome: true }, { locked: true }, { loading: true }]) {
    const h = harness(options); h.context.navigateHomeShortcut();
    assert.equal(h.context.page, 'Transactions'); assert.equal(h.renders, 0); assert.deepEqual(h.scroll, []);
    assert.deepEqual(h.focused, []); assert.equal(h.classes.size, 0); assert.equal(h.timers.size, 0);
  }
});

test('repeated highlights restart their timer and another destination cancels it', () => {
  const h = harness({ page: 'Overview' }); h.context.navigateHomeShortcut();
  const first = [...h.timers.keys()][0]; h.context.navigateHomeShortcut();
  assert.equal(h.timers.size, 1); assert.equal(h.timers.has(first), false);
  const [last, timer] = [...h.timers.entries()][0]; h.timers.delete(last); timer.fn();
  assert.equal(h.classes.has('home-shortcut-highlight'), false);
  h.context.navigateHomeShortcut(); assert.equal(h.classes.has('home-shortcut-highlight'), true);
  h.context.navigate('Goals'); assert.equal(h.classes.has('home-shortcut-highlight'), false); assert.equal(h.timers.size, 0);
});
