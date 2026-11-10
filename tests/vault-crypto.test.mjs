// Run with: node --test tests/vault-crypto.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { newKdf, deriveVaultKey, encryptLedger, decryptLedger, looksEncrypted, validateEnvelope, sameKdf, VAULT_ITERATIONS } from '../vault-crypto.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ledger = { accounts: [{ id: 'acct', name: 'private checking', balance: 1234.56 }], transactions: [{ id: 'tx', description: 'private expense', amount: 42 }], budgets: [], goals: [], purchases: [], settings: { currency: 'USD' } };

test('encrypts and decrypts a ledger with a non-extractable key and unique nonces', async () => {
  const kdf = newKdf(), key = await deriveVaultKey('a very strong passphrase', kdf);
  assert.equal(kdf.iterations, VAULT_ITERATIONS); assert.equal(key.extractable, false);
  const first = await encryptLedger(ledger, key, kdf), second = await encryptLedger(ledger, key, kdf);
  assert.equal(looksEncrypted(first), true); assert.doesNotMatch(JSON.stringify(first), /private checking|private expense|1234\.56/);
  assert.notEqual(first.iv, second.iv); assert.notEqual(first.revision, second.revision); assert.notEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(await decryptLedger(first, key), ledger); assert.equal(sameKdf(first.kdf, second.kdf), true);
});

test('wrong passphrases, tampered ciphertext, and mixed plaintext fail closed', async () => {
  const kdf = newKdf(), key = await deriveVaultKey('correct passphrase', kdf), wrong = await deriveVaultKey('incorrect passphrase', kdf);
  const envelope = await encryptLedger(ledger, key, kdf);
  await assert.rejects(decryptLedger(envelope, wrong));
  const bytes = Buffer.from(envelope.ciphertext, 'base64'); bytes[0] ^= 1;
  await assert.rejects(decryptLedger({ ...envelope, ciphertext: bytes.toString('base64') }, key));
  assert.throws(() => validateEnvelope({ ...envelope, data: ledger }), /invalid|unsupported/i);
  assert.throws(() => validateEnvelope({ ...envelope, kdf: { ...kdf, iterations: 1 } }), /invalid|unsupported/i);
  assert.throws(() => validateEnvelope({ ...envelope, iv: 'bad' }), /Invalid/);
});
