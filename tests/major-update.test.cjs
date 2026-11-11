// Run with: node --test tests/major-update.test.cjs
// Keep the in-app release link and privacy wording consistent with the repo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const update = read('MAJOR-UPDATE.md');

function section(start, end) {
  const first = html.indexOf(start), last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing section: ${start}`);
  return html.slice(first, last);
}

test('the major-update overview has two sections and describes protection limits', () => {
  assert.match(update, /^# .*Major Update/m);
  assert.match(update, /^## Page 1 —/m);
  assert.match(update, /^## Page 2 —/m);
  assert.match(update, /PR #21/);
  assert.match(update, /off by default/i);
  assert.match(update, /no passphrase recovery/i);
  assert.match(update, /publish and test the updated `firestore\.rules` separately/i);
  assert.match(update, /mocked Firebase SDK/);
});

test('project notes link to the release overview', () => {
  assert.match(read('README.md'), /\]\(MAJOR-UPDATE\.md\)/);
  assert.match(read('cloudflare-worker/README.md'), /\]\(\.\.\/MAJOR-UPDATE\.md\)/);
  assert.match(read('PROJECT-HANDOFF.md'), /MAJOR-UPDATE\.md/);
  assert.ok(fs.existsSync(path.join(root, 'MAJOR-UPDATE.md')));
});

test('Settings renders the major-update link with safe external-link attributes', () => {
  const context = vm.createContext({
    data: { accounts: [], transactions: [], budgets: [], goals: [], purchases: [], settings: {} },
    user: null, cloudLoaded: false, lastSyncError: null, vault: { state: 'off' },
    pageHeading: title => `<h1>${title}</h1>`,
    renderVaultPanel: () => '',
    options: () => '',
    esc: value => String(value),
  });
  vm.runInContext(section('function renderSettings(){', '\nfunction openModal('), context);
  const markup = context.renderSettings();
  const anchor = markup.match(/<a\b[^>]*>Read update ↗<\/a>/)?.[0];
  assert.ok(anchor, 'Settings should provide an update link');
  assert.match(anchor, /href="https:\/\/github\.com\/CorbinPlayz\/personal-finance\/blob\/main\/MAJOR-UPDATE\.md"/);
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
  assert.match(anchor, /aria-label="[^"]*opens in a new tab"/);
  assert.match(markup, /Major update/);
  assert.match(markup, /Protection is off by default/);
});

test('assistant status distinguishes local answers from a provider request', () => {
  const status = { textContent: '' }, footnote = { textContent: '' };
  const context = vm.createContext({
    panel: { querySelector: selector => selector === '#nsjStatus' ? status : footnote },
    snapshot: () => ({ ok: false }),
    connReady: () => false,
    cloudVerified: false,
    conn: { provider: 'test', model: 'test-model' },
    providerLabel: () => 'Selected provider',
  });
  vm.runInContext(section('  function refreshStatus() {', '\n  function addMsg('), context);
  context.refreshStatus();
  assert.equal(footnote.textContent, 'Assistant answers run locally');
  context.connReady = () => true;
  context.refreshStatus();
  assert.match(footnote.textContent, /Cloud is on but has not yet succeeded/);
  assert.match(footnote.textContent, /key sent to provider when used/);
  context.cloudVerified = true;
  context.refreshStatus();
  assert.match(footnote.textContent, /Cloud reply verified/);
  assert.match(html, /separate from workspace protection/);
  assert.doesNotMatch(html, /nothing leaves this device|BYOK key stays in this browser/);
});

test('closing the assistant closes and disables its Connections sheet', () => {
  function element() {
    const classes = new Set(), attributes = {};
    return {
      classes, attributes, inert: false,
      classList: {
        contains: name => classes.has(name),
        toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
        remove: name => classes.delete(name),
      },
      setAttribute: (name, value) => { attributes[name] = value; },
    };
  }
  const panel = element(), sheet = element(), orb = element();
  let restored = false;
  panel.querySelector = () => sheet;
  panel.contains = () => true;
  orb.focus = () => { restored = true; };
  const context = vm.createContext({
    panel, orb, document: { activeElement: {}, querySelector: () => null, documentElement: { classList: { contains: () => true } } }, window: {},
    build: () => {}, refreshStatus: () => {}, setTimeout: () => {}, clearTimeout: () => {},
    cancelConnectionTest: () => {}, cancelCloudReply: () => {},
    workspaceBlocked: () => !!context.window.NorthstarVaultLocked || !context.document.documentElement.classList.contains('northstar-seen'),
    focusTimer: null, greeted: true,
  });
  vm.runInContext(section('  function toggle(force, restoreFocus) {', '\n  document.addEventListener('), context);
  context.toggle(true);
  assert.equal(panel.inert, false);
  assert.equal(panel.attributes['aria-hidden'], 'false');
  sheet.classes.add('open'); sheet.inert = false;
  context.toggle(false);
  assert.equal(sheet.classes.has('open'), false);
  assert.equal(sheet.inert, true);
  assert.equal(sheet.attributes['aria-hidden'], 'true');
  assert.equal(panel.inert, true);
  assert.equal(panel.attributes['aria-hidden'], 'true');
  assert.equal(orb.attributes['aria-expanded'], 'false');
  assert.equal(restored, true);
  context.document.documentElement.classList.contains = () => false;
  context.toggle(true);
  assert.equal(panel.inert, true, 'assistant must not open behind the welcome screen');
  context.document.documentElement.classList.contains = () => true;
  context.window.NorthstarVaultLocked = true;
  context.toggle(true);
  assert.equal(panel.inert, true, 'assistant must not open behind a locked vault');
});

test('the welcome dismissal is remembered and replay remains available', () => {
  function classList() {
    const classes = new Set();
    return { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) };
  }
  const screen = { classList: classList(), attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  const root = { classList: classList() }, storage = new Map(), shell = {}, dock = {};
  const scroll = { scrollTop: 420 }, entry = { focus() {} }, content = { focus() {} };
  const elements = { welcomeScreen: screen, welcomeScroll: scroll, welcomeEnter: entry, content, mobileDock: dock };
  const timers = new Map(); let nextTimer = 0;
  const context = vm.createContext({
    $: name => elements[name],
    document: { documentElement: root, activeElement: content, querySelector: () => shell },
    localStorage: { setItem: (name, value) => storage.set(name, value), removeItem: name => storage.delete(name) },
    window: { setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) },
    syncLoading: false, confirmResolver: null, showToast: () => {},
    updateWelcomeProgress: () => {},
  });
  vm.runInContext(section('function isWelcomeVisible(){', '\nfunction setCloudLoading('), context);
  vm.runInContext(section('let welcomeDismissTimer=', '\nfunction openByAction('), context);
  const flush = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  context.updateBackgroundAvailability();
  assert.equal(shell.inert, true, 'background is unavailable while the intro is open');
  assert.equal(dock.inert, true);
  context.dismissWelcome();
  assert.equal(storage.get('northstar-welcome-seen-v1'), '1');
  flush();
  assert.equal(screen.classList.contains('hidden'), true);
  assert.equal(root.classList.contains('northstar-seen'), true);
  assert.equal(screen.attrs['aria-hidden'], 'true');
  assert.equal(shell.inert, false);
  context.showWelcome();
  flush();
  assert.equal(storage.has('northstar-welcome-seen-v1'), false);
  assert.equal(screen.classList.contains('hidden'), false);
  assert.equal(root.classList.contains('northstar-seen'), false);
  assert.equal(screen.attrs['aria-hidden'], 'false');
  assert.equal(scroll.scrollTop, 0);
  assert.equal(shell.inert, true);
  assert.match(html, /\.northstar-seen #welcomeScreen\{display:none\}/);
});
