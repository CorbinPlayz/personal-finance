// Run with: node --test tests/vault-sync.test.cjs
// These exercise the production sync/save functions against in-memory storage
// and a transaction mock. They do not replace testing deployed Firestore rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleScript);
function section(start, end) {
  const a = moduleScript.indexOf(start), b = moduleScript.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing section: ${start}`);
  return moduleScript.slice(a, b);
}
const cloudHelpers = section('function docRef(', '\nasync function onAuthChanged(');
const dataSignatureHelper = moduleScript.split('\n').find(line => line.startsWith('function dataSignature('));
assert.ok(dataSignatureHelper);
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
// Independent JSON-only model of Firestore's merge mask for the transaction mock.
function mockMerge(before, after) {
  const map = value => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!map(after)) return clone(after);
  if (!Object.keys(after).length) return {};
  const result = map(before) ? clone(before) : {};
  for (const [key, value] of Object.entries(after)) Object.defineProperty(result, key, { value: mockMerge(map(before) ? before[key] : undefined, value), enumerable: true, configurable: true, writable: true });
  return result;
}
function cloudHarness(initial) {
  let remote = clone(initial), writes = 0, fail = false, changeAccountDuringRead = false, raceRemote;
  const operations = [];
  const context = vm.createContext({
    user: { uid: 'alice' }, cloudEpoch: 1, cloudFingerprint: undefined, cloudWriteTail: Promise.resolve(),
    vault: { state: 'off' }, data: { accounts: [{ id: 'a', balance: 10 }], transactions: [], budgets: [], goals: [], purchases: [] },
    looksEncrypted: value => value?.format === 'northstar-encrypted-v1', validateEnvelope: () => true,
    flushProtectedLocal: async () => {}, normalizeData: value => value,
    fb: { db: {}, doc: (_db, ...parts) => parts, runTransaction: async (_db, callback) => {
      let pending;
      const attempt = () => callback({ get: async () => {
        if (changeAccountDuringRead) context.user = { uid: 'bob' };
        return { exists: () => remote !== null, data: () => clone(remote) };
      }, set: (_ref, value, options) => { pending = { value: clone(value), merge: options?.merge === true }; } });
      await attempt();
      if (raceRemote !== undefined) { remote = clone(raceRemote); raceRemote = undefined; pending = undefined; await attempt(); }
      if (fail) throw new Error('network failed');
      if (pending !== undefined) { remote = pending.merge ? mockMerge(remote, pending.value) : pending.value; operations.push(pending); writes++; }
    } }
  });
  vm.runInContext(dataSignatureHelper + '\n' + cloudHelpers, context);
  context.cloudFingerprint = context.cloudSignature(remote);
  return { context, operations, get remote() { return clone(remote); }, set remote(v) { remote = clone(v); },
    get writes() { return writes; }, set fail(v) { fail = v; }, set race(v) { raceRemote = clone(v); }, set changeAccountDuringRead(v) { changeAccountDuringRead = v; } };
}

test('plaintext sync uses native merge and preserves unknown fields; encrypted conversion fully replaces them', async () => {
  const h = cloudHarness({ data: { accounts: [{ id: 'old' }, { id: 'also-old' }], customNested: { note: 'keep', flag: 'old', inner: { extra: 3 } }, emptyMap: { old: 'removed' } }, oldPlaintextField: 'sensitive', updatedAt: 1 });
  h.context.data.customNested = { flag: 'new', inner: { added: 4 } };
  h.context.data.emptyMap = {};
  await h.context.writeCloudNow();
  assert.equal(h.writes, 1); assert.equal(h.operations[0].merge, true);
  assert.equal(h.remote.oldPlaintextField, 'sensitive'); assert.equal(h.remote.data.customNested.note, 'keep');
  assert.deepEqual(h.remote.data.customNested.inner, { extra: 3, added: 4 }); assert.equal(h.remote.data.customNested.flag, 'new');
  assert.deepEqual(h.remote.data.emptyMap, {}); assert.equal(h.remote.data.accounts.length, 1); assert.equal(h.remote.data.accounts[0].balance, 10);
  assert.equal(h.context.cloudSignature(h.remote), h.context.cloudFingerprint, 'the predicted merge must match the server');
  await h.context.cloudWritePayload({ format: 'northstar-encrypted-v1', ciphertext: 'opaque' });
  assert.equal(h.operations[1].merge, false);
  assert.deepEqual(h.remote, { format: 'northstar-encrypted-v1', ciphertext: 'opaque' });
});

test('merge prediction handles cross-realm maps, empty maps, arrays, and atomic SDK values', () => {
  const c = cloudHarness(null).context;
  const SDKValue = class Object { constructor(value) { this.value = value; } };
  const special = new SDKValue(1), replacement = new SDKValue(2);
  const before = { nested: { keep: { secret: true }, array: [1, 2], empty: { old: 1 }, special }, replace: special };
  const after = { nested: { array: [3], empty: {}, added: true }, replace: replacement };
  assert.equal(c.isPlainCloudMap(before), true, 'plain objects from another realm are maps');
  assert.equal(c.isPlainCloudMap(Object.create(null)), true);
  assert.equal(c.isPlainCloudMap(special), false, 'a class named Object is still not a map');
  const merged = c.mergePlainCloudValue(before, after);
  assert.equal(merged.nested.keep.secret, true); assert.deepEqual(merged.nested.array, [3]);
  assert.equal(Object.keys(merged.nested.empty).length, 0); assert.equal(merged.nested.special, special); assert.equal(merged.replace, replacement);
  assert.deepEqual(before.nested.array, [1, 2], 'prediction never mutates the server snapshot');
  const clean = c.removeUndefinedValues({ special, array: [undefined, special], omitted: undefined });
  assert.equal(clean.special, special); assert.equal(clean.array[0], null); assert.equal(clean.array[1], special); assert.equal('omitted' in clean, false);
  const dangerous = JSON.parse('{"__proto__":{"safe":true}}');
  const result = c.mergePlainCloudValue({}, dangerous);
  assert.equal(Object.hasOwn(result, '__proto__'), true); assert.equal(result.__proto__.safe, true); assert.equal({}.safe, undefined);
});

test('cloud fingerprints distinguish supported Firestore types and fail closed for ambiguous values', () => {
  const c = cloudHarness(null).context;
  class Timestamp { constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; } }
  class GeoPoint { constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; } }
  class Bytes { constructor(bytes) { this.bytes = bytes; } toBase64() { return this.bytes; } }
  class DocumentReference { constructor(path, database = '(default)') { this.path = path; this.firestore = { _databaseId: { projectId: 'demo', database } }; this.circular = this; } }
  class VectorValue { constructor(values) { this.values = values; } toArray() { return this.values; } }
  Object.assign(c.fb, { Timestamp, GeoPoint, Bytes, DocumentReference, VectorValue });
  const value = { timestamp: new Timestamp(12, 3), location: new GeoPoint(1, 2), bytes: new Bytes('AQID'), ref: new DocumentReference('a/b'), vector: new VectorValue([1, 2]) };
  assert.equal(c.cloudSignature(value), c.cloudSignature({ vector: new VectorValue([1, 2]), ref: new DocumentReference('a/b'), bytes: new Bytes('AQID'), location: new GeoPoint(1, 2), timestamp: new Timestamp(12, 3) }));
  assert.notEqual(c.cloudSignature(value), c.cloudSignature({ ...value, ref: new DocumentReference('a/other') }));
  assert.notEqual(c.cloudSignature(value), c.cloudSignature({ ...value, ref: new DocumentReference('a/b', 'other-db') }));
  assert.notEqual(c.cloudSignature(value), c.cloudSignature({ ...value, timestamp: new Timestamp(12, 4) }));
  assert.notEqual(c.cloudSignature({ n: NaN }), c.cloudSignature({ n: null }));
  assert.notEqual(c.cloudSignature({ n: -0 }), c.cloudSignature({ n: 0 }));
  assert.notEqual(c.cloudSignature({ n: Infinity }), c.cloudSignature({ n: -Infinity }));
  assert.notEqual(c.cloudSignature(JSON.parse('{"__proto__":{"x":1}}')), c.cloudSignature({}));
  assert.equal(c.cloudSignature(new Date(-1)), c.cloudSignature(new Timestamp(-1, 999000000)));
  assert.equal(c.dataSignature({ ref: value.ref, missing: undefined }), c.dataSignature({ ref: new DocumentReference('a/b') }), 'dataset comparison supports SDK references and omits undefined fields');
  assert.throws(() => c.cloudSignature({ unknown: new (class Unsupported {})() }), /unsupported/i);
  assert.throws(() => c.cloudSignature({ tooLarge: Number.MAX_SAFE_INTEGER + 1 }), /cannot compare safely/i);
  const circular = {}; circular.self = circular;
  assert.throws(() => c.cloudSignature(circular), /circular/i);
});

test('a changed cloud document is not overwritten; write errors leave it intact', async () => {
  const h = cloudHarness({ data: { accounts: [{ id: 'original' }] }, updatedAt: 1 });
  h.remote = { data: { accounts: [{ id: 'other-device' }] }, updatedAt: 2 };
  await assert.rejects(h.context.writeCloudNow(), /changed on another device/i);
  assert.equal(h.writes, 0); assert.equal(h.remote.data.accounts[0].id, 'other-device');
  h.context.cloudFingerprint = h.context.cloudSignature(h.remote); h.fail = true;
  await assert.rejects(h.context.writeCloudNow(), /network failed/);
  assert.equal(h.writes, 0); assert.equal(h.remote.data.accounts[0].id, 'other-device');
});

test('unsupported outgoing values are rejected before the server document is touched', async () => {
  const original = { data: { accounts: [{ id: 'original' }] }, updatedAt: 1 };
  const h = cloudHarness(original); h.context.data.unknown = new (class Unsupported {})();
  await assert.rejects(h.context.writeCloudNow(), /unsupported/i);
  assert.equal(h.writes, 0); assert.deepEqual(h.remote, original);
});

test('a Firestore retry notices another device changed the document during the first attempt', async () => {
  const h = cloudHarness({ data: { accounts: [{ id: 'original' }] }, updatedAt: 1 });
  h.race = { data: { accounts: [{ id: 'other-device' }] }, updatedAt: 2 };
  await assert.rejects(h.context.writeCloudNow(), /changed on another device/i);
  assert.equal(h.writes, 0); assert.equal(h.remote.data.accounts[0].id, 'other-device');
});

test('a plaintext client cannot knowingly overwrite an encrypted cloud document', async () => {
  const protectedDoc = { format: 'northstar-encrypted-v1', ciphertext: 'opaque' };
  const h = cloudHarness(protectedDoc);
  await assert.rejects(h.context.writeCloudNow(), /encrypted/i);
  assert.deepEqual(h.remote, protectedDoc); assert.equal(h.writes, 0);
});

test('queued cloud snapshots serialize in order and account switching aborts a write', async () => {
  const h = cloudHarness(null);
  h.context.data.accounts[0].balance = 11; const first = h.context.writeCloudNow();
  h.context.data.accounts[0].balance = 12; const second = h.context.writeCloudNow();
  await Promise.all([first, second]); assert.equal(h.remote.data.accounts[0].balance, 12); assert.equal(h.writes, 2);
  h.changeAccountDuringRead = true;
  await assert.rejects(h.context.writeCloudNow(), /account changed/i);
  assert.equal(h.writes, 2); assert.equal(h.remote.data.accounts[0].balance, 12);
});

const localHelpers = section('function vaultKey(', '\nfunction captureMatchingPlainCopies(');
function localHarness() {
  const store = new Map(), marker = JSON.stringify({ uid: 'alice', phase: 'active' });
  const initial = JSON.stringify({ revision: 'original', ciphertext: 'opaque' });
  store.set('northstar-vault-active-v1', marker); store.set('northstar-vault-v1:alice', initial);
  let failWrites = false, cloudQueued = 0, counter = 0;
  const context = vm.createContext({
    VAULT_MARKER: 'northstar-vault-active-v1',
    localStorage: { getItem: key => store.has(key) ? store.get(key) : null, setItem: (key, value) => { if (failWrites) throw new Error('quota'); store.set(key, value); } },
    navigator: { locks: { request: async (_key, callback) => callback() } },
    vault: { state: 'unlocked', uid: 'alice', key: {}, kdf: {}, localRaw: initial, session: 1, editSeq: 0, savedSeq: 0, error: null },
    data: { label: 'first' }, user: { uid: 'alice' }, cloudLoaded: true, lastSyncError: null, page: 'Overview', vaultWriteTail: Promise.resolve(),
    readVaultMarker: () => JSON.parse(store.get('northstar-vault-active-v1') || 'null'),
    encryptLedger: async snapshot => ({ revision: String(++counter), ciphertext: `sealed-${snapshot.label}` }),
    queueCloudSave: () => cloudQueued++, setSync: () => {}, showToast: () => {}, render: () => {}, validateEnvelope: () => true
  });
  vm.runInContext(localHelpers, context);
  return { context, store, initial, set failWrites(v) { failWrites = v; }, get cloudQueued() { return cloudQueued; } };
}

test('rapid protected edits serialize and only the newest device copy queues cloud sync', async () => {
  const h = localHarness();
  h.context.queueProtectedLocalSave(); h.context.data = { label: 'second' }; h.context.queueProtectedLocalSave();
  await h.context.vaultWriteTail;
  assert.equal(JSON.parse(h.store.get('northstar-vault-v1:alice')).ciphertext, 'sealed-second');
  assert.equal(h.context.vault.savedSeq, 2); assert.equal(h.context.vault.editSeq, 2); assert.equal(h.cloudQueued, 1);
});

test('a changed protected device copy or storage failure stops saving and cloud sync', async () => {
  const changed = localHarness(); changed.store.set('northstar-vault-v1:alice', '{"revision":"other-tab"}');
  changed.context.queueProtectedLocalSave(); await changed.context.vaultWriteTail;
  assert.equal(changed.store.get('northstar-vault-v1:alice'), '{"revision":"other-tab"}');
  assert.ok(changed.context.vault.error); assert.equal(changed.context.cloudLoaded, false); assert.equal(changed.cloudQueued, 0);
  const quota = localHarness(); quota.failWrites = true; quota.context.queueProtectedLocalSave(); await quota.context.vaultWriteTail;
  assert.equal(quota.store.get('northstar-vault-v1:alice'), quota.initial); assert.ok(quota.context.vault.error);
  assert.equal(quota.context.vault.savedSeq, 0); assert.equal(quota.context.cloudLoaded, false); assert.equal(quota.cloudQueued, 0);
});

test('locking flushes pending protected changes before reload and clears the saving status', async () => {
  let flushed = false, wrote = false, reloaded = false, status = 'Saving…';
  const context = vm.createContext({
    vault: { state: 'unlocked' }, user: { uid: 'alice' }, cloudLoaded: true, lastSyncError: null, saveTimer: 1,
    setCloudLoading: () => {}, flushProtectedLocal: async () => { flushed = true; }, clearTimeout: () => {},
    writeCloudNow: async () => { assert.equal(flushed, true); wrote = true; },
    setSync: value => { status = value; }, showToast: () => {}, showNorthstarDialog: async () => false,
    location: { reload: () => { assert.equal(wrote, true); assert.equal(status, 'Protected cloud sync on'); reloaded = true; } }
  });
  vm.runInContext(section('async function lockProtectedWorkspace(', '\nfunction renderVaultPanel('), context);
  await context.lockProtectedWorkspace(); assert.equal(reloaded, true);
});
