/** Binary ↔ text helpers for the encrypted sync file (no dependencies). */

const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes standard base64; undefined when it isn't valid base64. */
export function fromBase64(text: unknown): Uint8Array<ArrayBuffer> | undefined {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4) {
    return undefined;
  }
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

/** RFC 4648 base32 alphabet: no 0, 1, 8 or 9, so fewer look-alikes when typed by hand. */
export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 symbols (0–31), most significant bits first, zero-padded at the end. */
export function toBase32Values(bytes: Uint8Array): number[] {
  const values: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      values.push((buffer >> (bits - 5)) & 31);
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) values.push((buffer << (5 - bits)) & 31);
  return values;
}

/** The first `length` bytes encoded by base32 symbols; undefined if the padding bits aren't 0. */
export function fromBase32Values(
  values: readonly number[],
  length: number,
): Uint8Array | undefined {
  const bytes = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const value of values) {
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      if (index < length) bytes[index++] = (buffer >> (bits - 8)) & 255;
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  return index === length && buffer === 0 ? bytes : undefined;
}
