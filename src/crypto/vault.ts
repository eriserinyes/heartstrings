/**
 * Encrypted-at-rest storage.
 *
 * The entire Vault (names, notes, relationships) is serialised to JSON and
 * sealed with AES-256-GCM. The key is derived from a passphrase with
 * PBKDF2-SHA-256 and never leaves memory; the passphrase itself is never
 * stored anywhere. localStorage only ever holds the salt, IV and ciphertext.
 *
 * Without the passphrase the stored blob is unreadable — by other scripts,
 * browser extensions that scrape storage, someone poking at devtools, or an
 * AI assistant with access to the machine.
 */
import type { Vault } from '../model/types';

export const STORAGE_KEY = 'heartstrings.vault.v1';
export const PBKDF2_ITERATIONS = 600_000;

export interface SealedVault {
  format: 'heartstrings-sealed';
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ct: string;
}

export interface VaultKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<VaultKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: the raw key can't be read back out of the CryptoKey
    ['encrypt', 'decrypt'],
  );
  return { key, salt, iterations };
}

export async function createKey(passphrase: string): Promise<VaultKey> {
  return deriveKey(passphrase, crypto.getRandomValues(new Uint8Array(16)));
}

export async function seal(vault: Vault, vk: VaultKey): Promise<SealedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh IV every save
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vk.key, enc.encode(JSON.stringify(vault)));
  return {
    format: 'heartstrings-sealed',
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: vk.iterations, salt: toB64(vk.salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    ct: toB64(new Uint8Array(ct)),
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase didn’t unlock this vault.');
  }
}

/** Derives the key from the blob's own salt and decrypts. Throws WrongPassphraseError on a bad passphrase. */
export async function unseal(sealed: SealedVault, passphrase: string): Promise<{ vault: Vault; vk: VaultKey }> {
  if (sealed.format !== 'heartstrings-sealed' || sealed.v !== 1) throw new Error('Not a Heartstrings vault file.');
  const vk = await deriveKey(passphrase, fromB64(sealed.kdf.salt), sealed.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.cipher.iv) }, vk.key, fromB64(sealed.ct));
  } catch {
    throw new WrongPassphraseError();
  }
  return { vault: JSON.parse(dec.decode(plain)) as Vault, vk };
}

export function isSealedVault(x: unknown): x is SealedVault {
  return !!x && typeof x === 'object' && (x as SealedVault).format === 'heartstrings-sealed';
}

export function readStored(): SealedVault | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSealedVault(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStored(sealed: SealedVault): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sealed));
}

export function clearStored(): void {
  localStorage.removeItem(STORAGE_KEY);
}
