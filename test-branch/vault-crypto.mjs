/*
 * Northstar protected-workspace envelope. The passphrase is never stored.
 * PBKDF2 derives a non-extractable AES-GCM key; every save uses a fresh IV.
 * The envelope contains no ledger fields, only cryptographic metadata.
 * Security still depends on a strong passphrase, trusted browser/code, and
 * removing any older plaintext copies separately after a successful migration.
 */
export const VAULT_FORMAT = 'northstar-encrypted-v1';
export const VAULT_ITERATIONS = 600000;
const AAD = new TextEncoder().encode('Northstar finance vault v1');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const fields = ['cipher', 'ciphertext', 'format', 'iv', 'kdf', 'revision', 'version'];

function randomBytes(length) { return crypto.getRandomValues(new Uint8Array(length)); }
function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function fromBase64(value, expectedLength) {
  if (typeof value !== 'string' || value.length > 16 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid encrypted data.');
  let raw;
  try { raw = atob(value); } catch { throw new Error('Invalid encrypted data.'); }
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (expectedLength !== undefined && bytes.length !== expectedLength) throw new Error('Invalid encrypted data.');
  return bytes;
}
export function looksEncrypted(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    (String(value.format || '').startsWith('northstar-encrypted') || 'ciphertext' in value || 'vault' in value);
}
export function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== fields.join(',') ||
      value.format !== VAULT_FORMAT || value.version !== 1 || value.cipher !== 'AES-GCM' ||
      !value.kdf || typeof value.kdf !== 'object' || Array.isArray(value.kdf) ||
      Object.keys(value.kdf).sort().join(',') !== 'iterations,name,salt' ||
      value.kdf.name !== 'PBKDF2-SHA-256' || value.kdf.iterations !== VAULT_ITERATIONS) {
    throw new Error('This encrypted copy is invalid or uses an unsupported format.');
  }
  fromBase64(value.kdf.salt, 16); fromBase64(value.iv, 12); fromBase64(value.revision, 16);
  if (fromBase64(value.ciphertext).length < 16) throw new Error('Invalid encrypted data.');
  return value;
}
export function newKdf() {
  return { name: 'PBKDF2-SHA-256', iterations: VAULT_ITERATIONS, salt: toBase64(randomBytes(16)) };
}
export async function deriveVaultKey(passphrase, kdf) {
  if (!globalThis.isSecureContext && typeof window !== 'undefined') throw new Error('Passphrase protection requires a secure HTTPS connection.');
  if (!crypto?.subtle || typeof passphrase !== 'string' || passphrase.length > 1024) throw new Error('Passphrase protection is unavailable in this browser.');
  if (!kdf || kdf.name !== 'PBKDF2-SHA-256' || kdf.iterations !== VAULT_ITERATIONS) throw new Error('Unsupported encrypted data.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromBase64(kdf.salt, 16), iterations: kdf.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptLedger(ledger, key, kdf) {
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(ledger));
  const result = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, plaintext);
  return { format: VAULT_FORMAT, version: 1, cipher: 'AES-GCM', kdf: { ...kdf }, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(result)), revision: toBase64(randomBytes(16)) };
}
export async function decryptLedger(envelope, key) {
  validateEnvelope(envelope);
  const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv, 12), additionalData: AAD, tagLength: 128 }, key, fromBase64(envelope.ciphertext));
  const parsed = JSON.parse(decoder.decode(result));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !['accounts','transactions','budgets','goals','purchases'].every(k => Array.isArray(parsed[k]))) throw new Error('Encrypted copy does not contain valid finance data.');
  return parsed;
}
export function sameKdf(a, b) {
  return !!a && !!b && a.name === b.name && a.iterations === b.iterations && a.salt === b.salt;
}
