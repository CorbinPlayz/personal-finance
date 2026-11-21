import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSplit, cleanSplit, activeSplit, splitAmount } from '../split.mjs';

const ids = ['a', 'b', 'c'];
const parts = [{ accountId: 'a', percent: 50 }, { accountId: 'b', percent: 30 }, { accountId: 'c', percent: 20 }];
const sum = list => Math.round(list.reduce((n, x) => n + x * 100, 0));

test('validateSplit accepts exactly 100 and explains everything else', () => {
  assert.equal(validateSplit(parts, ids), '');
  assert.match(validateSplit([parts[0]], ids), /at least two/);
  assert.match(validateSplit([{ accountId: 'a', percent: 50 }, { accountId: 'b', percent: 49.99 }], ids), /99\.99%/);
  assert.match(validateSplit([{ accountId: 'a', percent: 60 }, { accountId: 'b', percent: 60 }], ids), /120%/);
  assert.match(validateSplit([{ accountId: 'a', percent: 50 }, { accountId: 'zzz', percent: 50 }], ids), /no longer exists/);
  assert.match(validateSplit([{ accountId: 'a', percent: 50 }, { accountId: 'a', percent: 50 }], ids), /only appear once/);
  assert.match(validateSplit([{ accountId: 'a', percent: 100 }, { accountId: 'b', percent: 0 }], ids), /more than 0/);
  assert.match(validateSplit([{ accountId: 'a', percent: 'x' }, { accountId: 'b', percent: 100 }], ids), /more than 0/);
  assert.equal(validateSplit([{ accountId: 'a', percent: 33.33 }, { accountId: 'b', percent: 33.33 }, { accountId: 'c', percent: 33.34 }], ids), '');
});

test('splitAmount always adds back to the exact amount', () => {
  assert.deepEqual(splitAmount(1000, parts), [500, 300, 200]);
  assert.deepEqual(splitAmount(0.01, parts), [0.01, 0, 0]);
  const thirds = [{ accountId: 'a', percent: 33.33 }, { accountId: 'b', percent: 33.33 }, { accountId: 'c', percent: 33.34 }];
  for (const amount of [0.01, 0.02, 1, 9.99, 100, 1234.56, 3000.01, 999999999.99]) {
    for (const set of [parts, thirds]) {
      const pieces = splitAmount(amount, set);
      assert.equal(sum(pieces), Math.round(amount * 100), `pieces for ${amount}`);
      assert.ok(pieces.every(p => p >= 0));
    }
  }
  assert.deepEqual(splitAmount(100, [{ accountId: 'a', percent: 50 }, { accountId: 'b', percent: 50 }]), [50, 50]);
  assert.deepEqual(splitAmount(-5, parts), []);
  assert.deepEqual(splitAmount(10, []), []);
});

test('cleanSplit and activeSplit ignore junk and only activate valid enabled splits', () => {
  assert.deepEqual(cleanSplit(null), { enabled: false, parts: [] });
  assert.deepEqual(cleanSplit({ enabled: 'yes', parts: [{ accountId: 'a', percent: '50' }, { accountId: 5, percent: 50 }, null] }), { enabled: false, parts: [{ accountId: 'a', percent: 50 }] });
  assert.equal(activeSplit({ enabled: false, parts }, ids), null);
  assert.equal(activeSplit({ enabled: true, parts: parts.slice(0, 2) }, ids), null);
  assert.equal(activeSplit({ enabled: true, parts }, ['a', 'b']), null);
  assert.deepEqual(activeSplit({ enabled: true, parts }, ids), parts);
});
