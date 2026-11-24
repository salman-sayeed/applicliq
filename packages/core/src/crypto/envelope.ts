import { SCHEMA_VERSION } from '../sync/drive';
import {
  BASE32_ALPHABET,
  fromBase32Values,
  fromBase64,
  toBase32Values,
  toBase64,
} from './encoding';

/**
 * Envelope encryption for the Drive sync file, with the browser's Web Crypto API only.
 *
 * - A random 256-bit data key (DEK) encrypts the whole sync payload with AES-256-GCM, with a new
 *   random 12-byte IV on every upload.
 * - The DEK is stored in the file twice, wrapped (AES-GCM) with:
 *   - a key derived from the passphrase: PBKDF2-SHA256, 600,000 iterations, random 16-byte salt;
 *   - a key derived from the recovery code (128 random bits): HKDF-SHA256 with its own salt
 *     (the code is already full-strength random, so no slow KDF is needed).
 * - Changing the passphrase or resetting the recovery code only re-wraps the DEK.
 *
 * GCM authenticates everything: a wrong passphrase, a wrong recovery code and a changed byte
 * all fail decryption, never produce garbage. Nothing here stores, logs or returns a secret.
 */

export const ENCRYPTED_FORMAT = 'applicliq-encrypted';
/** Version of the encrypted file's own layout (not of the payload inside). */
export const ENCRYPTED_FORMAT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 10;

/** Iteration counts a file may declare (unlocking uses the file's; new wraps use the constant). */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
/** Recovery code: 128 bits = 26 base32 characters, plus 2 check characters = 7 groups of 4. */
const RECOVERY_BYTES = 16;
const RECOVERY_SYMBOLS = 26;

const text = new TextEncoder();
// Additional authenticated data: ties each ciphertext to its role, so pieces can't be swapped.
const AAD_PAYLOAD = text.encode('applicliq:payload:v1');
const AAD_PASSPHRASE = text.encode('applicliq:wrap:passphrase:v1');
const AAD_RECOVERY = text.encode('applicliq:wrap:recovery:v1');
const HKDF_INFO = text.encode('applicliq:recovery-code:v1');

export type WrappedKey = { iv: string; data: string };

/** Everything in the file except the encrypted payload. */
export type EncryptedHeader = {
  format: typeof ENCRYPTED_FORMAT;
  version: number;
  /** Format of the payload inside (the plain sync snapshot's `schemaVersion`). */
  schemaVersion: number;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  wrappedKeys: { passphrase: WrappedKey; recovery: WrappedKey & { salt: string } };
};

export type EncryptedFile = EncryptedHeader & { iv: string; ciphertext: string };

export type EncryptionErrorKind =
  | 'wrong-passphrase'
  | 'wrong-recovery-code'
  /** Not a recovery code at all (wrong length or a typo the check characters caught). */
  | 'invalid-recovery-code'
  /** The data key opened but the payload didn't: the file was changed or damaged. */
  | 'tampered'
  | 'invalid-file'
  | 'newer-version'
  | 'weak-passphrase';

export class EncryptionError extends Error {
  constructor(
    readonly kind: EncryptionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'EncryptionError';
  }
}

const MESSAGES: Record<EncryptionErrorKind, string> = {
  'wrong-passphrase': 'That passphrase does not unlock your data (or the file was changed).',
  'wrong-recovery-code': 'That recovery code does not unlock your data (or the file was changed).',
  'invalid-recovery-code':
    'That does not look like a recovery code. Check for typos: it has 28 letters and digits.',
  tampered:
    'Your encrypted Drive file is damaged or was changed outside AppliCliq, so it was not used.',
  'invalid-file': 'Your Drive sync file is in a format this version does not know.',
  'newer-version':
    'Your Drive data was saved by a newer version of AppliCliq. Update AppliCliq to keep syncing.',
  'weak-passphrase': `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`,
};

const fail = (kind: EncryptionErrorKind): never => {
  throw new EncryptionError(kind, MESSAGES[kind]);
};

const subtle = () => globalThis.crypto.subtle;
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const AES = { name: 'AES-GCM', length: 256 } as const;

// ---- Recovery codes -------------------------------------------------------------------------

/** Two check symbols (Fletcher-style), so most typos are caught before any decryption. */
function checkSymbols(values: readonly number[]): [number, number] {
  let a = 0;
  let b = 0;
  for (const v of values) {
    a = (a + v + 1) % 32;
    b = (b + a) % 32;
  }
  return [a, b];
}

function formatCode(values: readonly number[]): string {
  const chars = values.map((v) => BASE32_ALPHABET[v]).join('');
  return chars.match(/.{1,4}/g)!.join('-');
}

/** A new random recovery code, e.g. `ABCD-EFGH-…` (7 groups of 4). Show it once, never store it. */
export function generateRecoveryCode(): string {
  const values = toBase32Values(randomBytes(RECOVERY_BYTES));
  return formatCode([...values, ...checkSymbols(values)]);
}

/** Upper-case symbols of what the user typed, spaces and dashes ignored, look-alikes fixed. */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/8/g, 'B');
}

/** The code's 16 bytes, or undefined if it is mistyped (length, characters or check symbols). */
export function parseRecoveryCode(input: string): Uint8Array<ArrayBuffer> | undefined {
  const code = normalizeRecoveryCode(input);
  if (code.length !== RECOVERY_SYMBOLS + 2) return undefined;
  const values = [...code].map((c) => BASE32_ALPHABET.indexOf(c));
  if (values.some((v) => v < 0)) return undefined;
  const data = values.slice(0, RECOVERY_SYMBOLS);
  const [a, b] = checkSymbols(data);
  if (values[RECOVERY_SYMBOLS] !== a || values[RECOVERY_SYMBOLS + 1] !== b) return undefined;
  const bytes = fromBase32Values(data, RECOVERY_BYTES);
  return bytes ? new Uint8Array(bytes) : undefined;
}

/** The last 4 characters of a code, as the user is asked to type them back. */
export function recoveryCodeTail(code: string): string {
  return normalizeRecoveryCode(code).slice(-4);
}

// ---- Passphrases ----------------------------------------------------------------------------

export type PassphraseStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/**
 * A rough strength hint (no word lists): length counts most, then variety; repeats and
 * sequences count against it. Only a hint: the minimum length is the one hard rule.
 */
export function passphraseStrength(passphrase: string): PassphraseStrength {
  const length = [...passphrase].length;
  if (length < MIN_PASSPHRASE_LENGTH) return { score: 0, label: 'Too short' };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(passphrase));
  const unique = new Set(passphrase.toLowerCase()).size;
  let points = length >= 20 ? 3 : length >= 14 ? 2 : 1;
  if (classes.length >= 3) points++;
  if (/\s/.test(passphrase.trim()) && length >= 16) points++; // several words
  if (unique < 6 || /(.)\1{3,}/.test(passphrase)) points -= 2;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|password|passwort)/i.test(passphrase)) {
    points -= 1;
  }
  const score = Math.max(1, Math.min(4, points)) as 1 | 2 | 3 | 4;
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score]! };
}

// ---- Keys -----------------------------------------------------------------------------------

async function passphraseKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const base = await subtle().importKey(
    'raw',
    text.encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    AES,
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function recoveryKey(code: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>) {
  const base = await subtle().importKey('raw', code, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: HKDF_INFO },
    base,
    AES,
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function wrap(
  dek: CryptoKey,
  kek: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
): Promise<WrappedKey> {
  const iv = randomBytes(IV_BYTES);
  const data = await subtle().wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv,
    additionalData: aad,
  });
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

async function unwrap(
  wrapped: WrappedKey,
  kek: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  extractable: boolean,
): Promise<CryptoKey | undefined> {
  try {
    return await subtle().unwrapKey(
      'raw',
      fromBase64(wrapped.data)!,
      kek,
      { name: 'AES-GCM', iv: fromBase64(wrapped.iv)!, additionalData: aad },
      AES,
      extractable,
      ['encrypt', 'decrypt'],
    );
  } catch {
    return undefined;
  }
}

function checkPassphrase(passphrase: string) {
  if ([...passphrase].length < MIN_PASSPHRASE_LENGTH) fail('weak-passphrase');
}

function recoveryBytes(code: string) {
  return parseRecoveryCode(code) ?? fail('invalid-recovery-code');
}

async function wrapForPassphrase(dek: CryptoKey, passphrase: string) {
  checkPassphrase(passphrase);
  const salt = randomBytes(SALT_BYTES);
  const kek = await passphraseKey(passphrase, salt, PBKDF2_ITERATIONS);
  return {
    kdf: {
      name: 'PBKDF2' as const,
      hash: 'SHA-256' as const,
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
    },
    wrapped: await wrap(dek, kek, AAD_PASSPHRASE),
  };
}

async function wrapForRecovery(dek: CryptoKey, code: string) {
  const bytes = recoveryBytes(code);
  const salt = randomBytes(SALT_BYTES);
  const wrapped = await wrap(dek, await recoveryKey(bytes, salt), AAD_RECOVERY);
  return { ...wrapped, salt: toBase64(salt) };
}

/**
 * Sets encryption up: a new random data key, wrapped with the passphrase and the recovery code.
 * The returned key is extractable (it must be, to be wrapped again later); store a
 * non-extractable copy (`toStorableKey`) and let this one go.
 */
export async function createEnvelope(
  passphrase: string,
  recoveryCode: string,
): Promise<{ dek: CryptoKey; header: EncryptedHeader }> {
  checkPassphrase(passphrase);
  recoveryBytes(recoveryCode);
  const dek = await subtle().generateKey(AES, true, ['encrypt', 'decrypt']);
  const forPassphrase = await wrapForPassphrase(dek, passphrase);
  return {
    dek,
    header: {
      format: ENCRYPTED_FORMAT,
      version: ENCRYPTED_FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      kdf: forPassphrase.kdf,
      wrappedKeys: {
        passphrase: forPassphrase.wrapped,
        recovery: await wrapForRecovery(dek, recoveryCode),
      },
    },
  };
}

export type UnlockSecret = { passphrase: string } | { recoveryCode: string };

/**
 * The data key, unwrapped with the passphrase or the recovery code. Throws an
 * `EncryptionError` ('wrong-passphrase' / 'wrong-recovery-code' / 'invalid-recovery-code').
 */
export async function unwrapDataKey(
  header: EncryptedHeader,
  secret: UnlockSecret,
  { extractable = false } = {},
): Promise<CryptoKey> {
  if ('passphrase' in secret) {
    const kek = await passphraseKey(
      secret.passphrase,
      fromBase64(header.kdf.salt)!,
      header.kdf.iterations,
    );
    const dek = await unwrap(header.wrappedKeys.passphrase, kek, AAD_PASSPHRASE, extractable);
    return dek ?? fail('wrong-passphrase');
  }
  const bytes = recoveryBytes(secret.recoveryCode);
  const { recovery } = header.wrappedKeys;
  const kek = await recoveryKey(bytes, fromBase64(recovery.salt)!);
  const dek = await unwrap(recovery, kek, AAD_RECOVERY, extractable);
  return dek ?? fail('wrong-recovery-code');
}

/** The header with the data key wrapped for a new passphrase (new salt). Data is untouched. */
export async function rewrapPassphrase<T extends EncryptedHeader>(
  header: T,
  dek: CryptoKey,
  passphrase: string,
): Promise<T> {
  const { kdf, wrapped } = await wrapForPassphrase(dek, passphrase);
  return { ...header, kdf, wrappedKeys: { ...header.wrappedKeys, passphrase: wrapped } };
}

/** The header with the data key wrapped for a new recovery code. Data is untouched. */
export async function rewrapRecoveryCode<T extends EncryptedHeader>(
  header: T,
  dek: CryptoKey,
  recoveryCode: string,
): Promise<T> {
  const recovery = await wrapForRecovery(dek, recoveryCode);
  return { ...header, wrappedKeys: { ...header.wrappedKeys, recovery } };
}

/** A non-extractable copy of the data key, for keeping on this device. */
export async function toStorableKey(dek: CryptoKey): Promise<CryptoKey> {
  if (!dek.extractable) return dek;
  const raw = await subtle().exportKey('raw', dek);
  return subtle().importKey('raw', raw, AES, false, ['encrypt', 'decrypt']);
}

/** The key's raw bytes (base64), for the extension's in-memory session storage. */
export async function exportRawKey(dek: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await subtle().exportKey('raw', dek)));
}

/** A non-extractable key from `exportRawKey`'s output; undefined if it isn't one. */
export async function importRawKey(raw: string): Promise<CryptoKey | undefined> {
  const bytes = fromBase64(raw);
  if (bytes?.length !== KEY_BYTES) return undefined;
  return subtle().importKey('raw', bytes, AES, false, ['encrypt', 'decrypt']);
}

// ---- Payload --------------------------------------------------------------------------------

/** Encrypts the payload with a fresh random IV: the complete file, ready to upload. */
export async function sealFile(
  header: EncryptedHeader,
  dek: CryptoKey,
  payload: string,
): Promise<EncryptedFile> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD_PAYLOAD },
    dek,
    text.encode(payload),
  );
  return {
    format: header.format,
    version: header.version,
    schemaVersion: header.schemaVersion,
    kdf: header.kdf,
    wrappedKeys: header.wrappedKeys,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypts the payload. Throws `EncryptionError('tampered')` if it doesn't authenticate. */
export async function openFile(file: EncryptedFile, dek: CryptoKey): Promise<string> {
  try {
    const plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.iv)!, additionalData: AAD_PAYLOAD },
      dek,
      fromBase64(file.ciphertext)!,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return fail('tampered');
  }
}

/** The header part of a file (what a passphrase change rewrites). */
export function headerOf(file: EncryptedFile): EncryptedHeader {
  const { format, version, schemaVersion, kdf, wrappedKeys } = file;
  return { format, version, schemaVersion, kdf, wrappedKeys };
}

// ---- Validation -----------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const bytesOf = (v: unknown, length?: number) => {
  const bytes = fromBase64(v);
  return bytes !== undefined && (length === undefined || bytes.length === length);
};
const isWrapped = (v: unknown): v is WrappedKey =>
  isObject(v) && bytesOf(v.iv, IV_BYTES) && bytesOf(v.data, KEY_BYTES + TAG_BYTES);

/** Whether Drive content claims to be an encrypted AppliCliq file (valid or not). */
export function isEncryptedFile(data: unknown): boolean {
  return isObject(data) && data.format === ENCRYPTED_FORMAT;
}

/**
 * Checks an encrypted file from Drive (untrusted). Throws an `EncryptionError`:
 * 'newer-version' for a layout or payload this version doesn't know, 'invalid-file' otherwise.
 */
export function parseEncryptedFile(data: unknown): EncryptedFile {
  if (!isObject(data) || data.format !== ENCRYPTED_FORMAT) return fail('invalid-file');
  const { version, schemaVersion, kdf, wrappedKeys, iv, ciphertext } = data;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('invalid-file');
  }
  if (version > ENCRYPTED_FORMAT_VERSION) return fail('newer-version');
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return fail('invalid-file');
  }
  if (schemaVersion > SCHEMA_VERSION) return fail('newer-version');
  const kdfOk =
    isObject(kdf) &&
    kdf.name === 'PBKDF2' &&
    kdf.hash === 'SHA-256' &&
    typeof kdf.iterations === 'number' &&
    Number.isInteger(kdf.iterations) &&
    kdf.iterations >= MIN_ITERATIONS &&
    kdf.iterations <= MAX_ITERATIONS &&
    bytesOf(kdf.salt, SALT_BYTES);
  const keysOk =
    isObject(wrappedKeys) &&
    isWrapped(wrappedKeys.passphrase) &&
    isWrapped(wrappedKeys.recovery) &&
    bytesOf((wrappedKeys.recovery as Record<string, unknown>).salt, SALT_BYTES);
  const payloadOk = bytesOf(iv, IV_BYTES) && (fromBase64(ciphertext)?.length ?? 0) >= TAG_BYTES;
  if (!kdfOk || !keysOk || !payloadOk) return fail('invalid-file');
  const recovery = (wrappedKeys as { recovery: WrappedKey & { salt: string } }).recovery;
  const passphrase = (wrappedKeys as { passphrase: WrappedKey }).passphrase;
  // Rebuilt field by field, so nothing unexpected from the file is carried along.
  return {
    format: ENCRYPTED_FORMAT,
    version,
    schemaVersion,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: kdf.iterations as number,
      salt: kdf.salt as string,
    },
    wrappedKeys: {
      passphrase: { iv: passphrase.iv, data: passphrase.data },
      recovery: { salt: recovery.salt, iv: recovery.iv, data: recovery.data },
    },
    iv: iv as string,
    ciphertext: ciphertext as string,
  };
}
