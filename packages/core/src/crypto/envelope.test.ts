import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64 } from './encoding';
import {
  ENCRYPTED_FORMAT,
  type EncryptedFile,
  EncryptionError,
  PBKDF2_ITERATIONS,
  createEnvelope,
  generateRecoveryCode,
  headerOf,
  openFile,
  parseEncryptedFile,
  parseRecoveryCode,
  passphraseStrength,
  recoveryCodeTail,
  rewrapPassphrase,
  rewrapRecoveryCode,
  sealFile,
  toStorableKey,
  unwrapDataKey,
} from './envelope';

const PASSPHRASE = 'correct horse battery staple';
const PAYLOAD = JSON.stringify({ schemaVersion: 2, records: [{ id: 'a', title: 'Engineer' }] });

async function setup(payload = PAYLOAD) {
  const recoveryCode = generateRecoveryCode();
  const { dek, header } = await createEnvelope(PASSPHRASE, recoveryCode);
  const file = await sealFile(header, dek, payload);
  return { dek, header, file, recoveryCode };
}

/** Flips one bit of a base64 value. */
function flip(value: string, byte = 0): string {
  const bytes = fromBase64(value)!;
  bytes[byte] = bytes[byte]! ^ 1;
  return toBase64(bytes);
}

const kindOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (e: unknown) => (e instanceof EncryptionError ? e.kind : String(e)),
  );

describe('recovery codes', () => {
  it('are 128 random bits as 7 groups of 4 base32 characters, with check characters', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([A-Z2-7]{4}-){6}[A-Z2-7]{4}$/);
    expect(parseRecoveryCode(code)).toHaveLength(16);
    expect(generateRecoveryCode()).not.toBe(code);
    expect(recoveryCodeTail(code)).toBe(code.slice(-4));
  });

  it('accept lower case, missing dashes, spaces and digit look-alikes', () => {
    const code = generateRecoveryCode();
    const bytes = parseRecoveryCode(code)!;
    expect(parseRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toEqual(bytes);
    expect(parseRecoveryCode(code.replace(/O/g, '0').replace(/I/g, '1'))).toEqual(bytes);
  });

  it('catch typos with the check characters', () => {
    const code = generateRecoveryCode();
    const typo = (code[0] === 'A' ? 'B' : 'A') + code.slice(1);
    expect(parseRecoveryCode(typo)).toBeUndefined();
    expect(parseRecoveryCode(code.slice(0, -1))).toBeUndefined();
    expect(parseRecoveryCode('')).toBeUndefined();
  });
});

describe('passphrases', () => {
  it('need at least 10 characters', async () => {
    expect(await kindOf(createEnvelope('short', generateRecoveryCode()))).toBe('weak-passphrase');
    const { dek, header } = await createEnvelope(PASSPHRASE, generateRecoveryCode());
    expect(await kindOf(rewrapPassphrase(header, dek, '123456789'))).toBe('weak-passphrase');
  });

  it('get a rough strength hint', () => {
    expect(passphraseStrength('abc').label).toBe('Too short');
    expect(passphraseStrength('aaaaaaaaaaaa').score).toBe(1);
    expect(passphraseStrength('password1234').score).toBeLessThanOrEqual(2);
    expect(passphraseStrength('Tr0ub4dor&3xyz').score).toBeGreaterThanOrEqual(3);
    expect(passphraseStrength('lantern orbit maple cascade').label).toBe('Strong');
  });
});

describe('envelope encryption', () => {
  it('round-trips with the passphrase and with the recovery code', async () => {
    const { file, recoveryCode } = await setup();
    expect(file).toMatchObject({ format: ENCRYPTED_FORMAT, version: 1, schemaVersion: 2 });
    expect(file.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 });
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    expect(fromBase64(file.kdf.salt)).toHaveLength(16);
    expect(fromBase64(file.iv)).toHaveLength(12);
    // Nothing readable in the file.
    expect(JSON.stringify(file)).not.toContain('Engineer');

    const byPassphrase = await unwrapDataKey(headerOf(file), { passphrase: PASSPHRASE });
    expect(await openFile(file, byPassphrase)).toBe(PAYLOAD);
    const byCode = await unwrapDataKey(headerOf(file), { recoveryCode });
    expect(await openFile(file, byCode)).toBe(PAYLOAD);
  });

  it('keeps unwrapped keys non-extractable unless asked', async () => {
    const { file } = await setup();
    expect((await unwrapDataKey(file, { passphrase: PASSPHRASE })).extractable).toBe(false);
    const dek = await unwrapDataKey(file, { passphrase: PASSPHRASE }, { extractable: true });
    expect(dek.extractable).toBe(true);
    expect((await toStorableKey(dek)).extractable).toBe(false);
  });

  it('rejects a wrong passphrase', async () => {
    const { file } = await setup();
    expect(await kindOf(unwrapDataKey(file, { passphrase: 'correct horse battery stapler' }))).toBe(
      'wrong-passphrase',
    );
  });

  it('rejects a wrong or mistyped recovery code', async () => {
    const { file } = await setup();
    expect(await kindOf(unwrapDataKey(file, { recoveryCode: generateRecoveryCode() }))).toBe(
      'wrong-recovery-code',
    );
    expect(await kindOf(unwrapDataKey(file, { recoveryCode: 'ABCD-EFGH' }))).toBe(
      'invalid-recovery-code',
    );
  });

  it('uses a new IV for every encryption', async () => {
    const { dek, header } = await setup();
    const files = await Promise.all([1, 2, 3].map(() => sealFile(header, dek, PAYLOAD)));
    expect(new Set(files.map((f) => f.iv)).size).toBe(3);
    expect(new Set(files.map((f) => f.ciphertext)).size).toBe(3);
  });

  describe('tampering', () => {
    it('detects a changed ciphertext or IV', async () => {
      const { file, dek } = await setup();
      expect(await kindOf(openFile({ ...file, ciphertext: flip(file.ciphertext, 3) }, dek))).toBe(
        'tampered',
      );
      expect(await kindOf(openFile({ ...file, iv: flip(file.iv) }, dek))).toBe('tampered');
      // The authentication tag at the end.
      const last = fromBase64(file.ciphertext)!.length - 1;
      expect(
        await kindOf(openFile({ ...file, ciphertext: flip(file.ciphertext, last) }, dek)),
      ).toBe('tampered');
    });

    it('detects a changed wrapped key, its IV or the salt', async () => {
      const { file, recoveryCode } = await setup();
      const { passphrase, recovery } = file.wrappedKeys;
      const variants: EncryptedFile[] = [
        {
          ...file,
          wrappedKeys: { recovery, passphrase: { ...passphrase, data: flip(passphrase.data) } },
        },
        {
          ...file,
          wrappedKeys: { recovery, passphrase: { ...passphrase, iv: flip(passphrase.iv) } },
        },
        { ...file, kdf: { ...file.kdf, salt: flip(file.kdf.salt) } },
      ];
      for (const variant of variants) {
        expect(await kindOf(unwrapDataKey(variant, { passphrase: PASSPHRASE }))).toBe(
          'wrong-passphrase',
        );
      }
      const badRecovery = {
        ...file,
        wrappedKeys: { passphrase, recovery: { ...recovery, data: flip(recovery.data) } },
      };
      expect(await kindOf(unwrapDataKey(badRecovery, { recoveryCode }))).toBe(
        'wrong-recovery-code',
      );
    });

    it('does not accept the passphrase-wrapped key in the recovery slot', async () => {
      const { file, recoveryCode } = await setup();
      const { passphrase, recovery } = file.wrappedKeys;
      const swapped = {
        ...file,
        wrappedKeys: { passphrase, recovery: { ...passphrase, salt: recovery.salt } },
      };
      expect(await kindOf(unwrapDataKey(swapped, { recoveryCode }))).toBe('wrong-recovery-code');
    });
  });

  it('changes the passphrase by re-wrapping only: old one fails, data unchanged', async () => {
    const { file } = await setup();
    const dek = await unwrapDataKey(file, { passphrase: PASSPHRASE }, { extractable: true });
    const next = await rewrapPassphrase(file, dek, 'a brand new passphrase');
    expect(next.iv).toBe(file.iv);
    expect(next.ciphertext).toBe(file.ciphertext);
    expect(next.wrappedKeys.recovery).toEqual(file.wrappedKeys.recovery);
    expect(next.kdf.salt).not.toBe(file.kdf.salt);
    expect(await kindOf(unwrapDataKey(next, { passphrase: PASSPHRASE }))).toBe('wrong-passphrase');
    const reopened = await unwrapDataKey(next, { passphrase: 'a brand new passphrase' });
    expect(await openFile(next, reopened)).toBe(PAYLOAD);
  });

  it('resets the recovery code by re-wrapping only: old code fails', async () => {
    const { file, recoveryCode } = await setup();
    const dek = await unwrapDataKey(file, { passphrase: PASSPHRASE }, { extractable: true });
    const newCode = generateRecoveryCode();
    const next = await rewrapRecoveryCode(file, dek, newCode);
    expect(next.ciphertext).toBe(file.ciphertext);
    expect(next.wrappedKeys.passphrase).toEqual(file.wrappedKeys.passphrase);
    expect(await kindOf(unwrapDataKey(next, { recoveryCode }))).toBe('wrong-recovery-code');
    expect(await openFile(next, await unwrapDataKey(next, { recoveryCode: newCode }))).toBe(
      PAYLOAD,
    );
  });

  it('encrypts 5,000 jobs quickly', async () => {
    const records = Array.from({ length: 5000 }, (_, i) => ({
      id: `job-${i}`,
      url: `https://jobs.example.test/${i}`,
      title: `Software Engineer ${i}`,
      company: `Company ${i % 300}`,
      status: 'applied',
      history: [{ status: 'applied', at: 1_700_000_000_000 + i }],
      notes: 'Some notes about the role. '.repeat(10),
      descriptionSnapshot: 'A long job description. '.repeat(80),
      createdAt: 1_700_000_000_000 + i,
      updatedAt: 1_700_000_000_000 + i,
    }));
    const payload = JSON.stringify({ schemaVersion: 2, updatedAt: 1, records });
    const { dek, header } = await createEnvelope(PASSPHRASE, generateRecoveryCode());
    const started = performance.now();
    const file = await sealFile(header, dek, payload);
    const parsed = parseEncryptedFile(JSON.parse(JSON.stringify(file)));
    expect(await openFile(parsed, dek)).toBe(payload);
    const elapsed = performance.now() - started;
    expect(payload.length).toBeGreaterThan(10_000_000);
    expect(elapsed).toBeLessThan(5_000);
  });
});

describe('parseEncryptedFile', () => {
  it('accepts a valid file and drops unknown fields', async () => {
    const { file } = await setup();
    expect(parseEncryptedFile({ ...file, extra: 'x' })).toEqual(file);
  });

  it('reports a newer layout or payload version as newer', async () => {
    const { file } = await setup();
    expect(
      await kindOf(Promise.resolve().then(() => parseEncryptedFile({ ...file, version: 2 }))),
    ).toBe('newer-version');
    expect(
      await kindOf(
        Promise.resolve().then(() => parseEncryptedFile({ ...file, schemaVersion: 99 })),
      ),
    ).toBe('newer-version');
  });

  it.each<[string, (f: EncryptedFile) => unknown]>([
    ['another format', (f) => ({ ...f, format: 'other' })],
    ['no version', (f) => ({ ...f, version: undefined })],
    ['another KDF', (f) => ({ ...f, kdf: { ...f.kdf, name: 'scrypt' } })],
    ['too few iterations', (f) => ({ ...f, kdf: { ...f.kdf, iterations: 10 } })],
    ['a short salt', (f) => ({ ...f, kdf: { ...f.kdf, salt: toBase64(new Uint8Array(8)) } })],
    ['a short IV', (f) => ({ ...f, iv: toBase64(new Uint8Array(8)) })],
    ['not base64', (f) => ({ ...f, ciphertext: '***' })],
    ['no wrapped keys', (f) => ({ ...f, wrappedKeys: undefined })],
    [
      'no recovery salt',
      (f) => ({
        ...f,
        wrappedKeys: { ...f.wrappedKeys, recovery: { ...f.wrappedKeys.recovery, salt: undefined } },
      }),
    ],
    ['null', () => null],
  ])('rejects a file with %s', async (_, change) => {
    const { file } = await setup();
    expect(await kindOf(Promise.resolve().then(() => parseEncryptedFile(change(file))))).toBe(
      'invalid-file',
    );
  });
});
