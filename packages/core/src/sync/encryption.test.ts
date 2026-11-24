import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type EncryptedFile,
  generateRecoveryCode,
  openFile,
  unwrapDataKey,
} from '../crypto/envelope';
import { createKeyStore } from '../crypto/key-store';
import { DEFAULT_SETTINGS, splitSettings } from '../settings';
import { AppliCliqDB, createJobRepository } from '../storage';
import {
  type DriveClient,
  DriveError,
  ENCRYPTED_SYNC_FILE_NAME,
  SYNC_FILE_NAME,
  type SyncSnapshot,
} from './drive';
import { createEncryptionController } from './encryption';
import { SyncError, parseSnapshot, syncWithDrive } from './sync';

const PASSPHRASE = 'correct horse battery staple';
const clock = () => 10_000;
const dbs: AppliCliqDB[] = [];

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

type Stored = { name: string; data: unknown; etag: number };

/** One appDataFolder holding both files; each client sees the names it asks for. */
function fakeFolder() {
  const files = new Map<string, Stored>();
  let seq = 0;
  const writes: string[] = [];
  /** Runs once, right before the next update of `name`: another device writing first. */
  const before = new Map<string, () => unknown>();

  function client(fileName: string, legacy?: string): DriveClient {
    const names = [fileName, legacy].filter(Boolean);
    return {
      fileName,
      list: async () =>
        [...files]
          .filter(([, f]) => names.includes(f.name))
          .map(([id, f]) => ({ id, name: f.name })),
      rename: async (id) => void (files.get(id)!.name = fileName),
      download: async (id) => {
        const file = files.get(id);
        if (!file) throw new DriveError('gone', 404);
        return { data: structuredClone(file.data), etag: `"${file.etag}"` };
      },
      update: async (id, body, etag) => {
        const hook = before.get(fileName);
        before.delete(fileName);
        await hook?.();
        const file = files.get(id);
        if (!file) throw new DriveError('gone', 404);
        if (etag && etag !== `"${file.etag}"`) throw new DriveError('stale', 412);
        writes.push(`update ${fileName}`);
        files.set(id, { ...file, data: structuredClone(body), etag: file.etag + 1 });
      },
      create: async (body) => {
        const id = `f${seq++}`;
        writes.push(`create ${fileName}`);
        files.set(id, { name: fileName, data: structuredClone(body), etag: 1 });
        return id;
      },
      remove: async (id) => {
        writes.push(`remove ${files.get(id)?.name}`);
        files.delete(id);
      },
      accountEmail: async () => 'me@example.test',
    };
  }

  const byName = (name: string) => [...files.values()].filter((f) => f.name === name);
  return {
    files,
    writes,
    plain: client(SYNC_FILE_NAME, 'pocket-career.json'),
    encrypted: client(ENCRYPTED_SYNC_FILE_NAME),
    put: (name: string, data: unknown) => files.set(`f${seq++}`, { name, data, etag: 1 }),
    main: () => byName(SYNC_FILE_NAME)[0]?.data,
    enc: () => byName(ENCRYPTED_SYNC_FILE_NAME)[0]?.data as EncryptedFile | undefined,
    countOf: (name: string) => byName(name).length,
    beforeUpdate: (name: string, hook: () => unknown) => before.set(name, hook),
  };
}

type Folder = ReturnType<typeof fakeFolder>;

/** A device: its own IndexedDB, key store and controller, on a shared Drive folder. */
function device(folder: Folder) {
  const db = new AppliCliqDB(`test-${crypto.randomUUID()}`);
  dbs.push(db);
  const repo = createJobRepository(db, clock);
  const keys = createKeyStore({ dbName: `keys-${crypto.randomUUID()}` });
  let forgotten = 0;
  const encryption = {
    drive: folder.encrypted,
    getKey: () => keys.load(),
    forgetKey: async () => {
      forgotten++;
      await keys.clear();
    },
  };
  const controller = createEncryptionController({
    repo,
    drive: folder.plain,
    encryptedDrive: folder.encrypted,
    keys,
    now: clock,
  });
  return {
    repo,
    keys,
    controller,
    forgotten: () => forgotten,
    sync: () => syncWithDrive(repo, folder.plain, { now: clock, encryption }),
    add: (title: string) =>
      repo.addJob({ url: `https://jobs.test/${title}`, title, company: 'Acme' }),
    titles: async () => (await repo.getJobs()).map((j) => j.title).sort(),
  };
}

/** What Drive's encrypted file holds, opened with the passphrase. */
async function driveContents(folder: Folder, passphrase = PASSPHRASE) {
  const file = folder.enc()!;
  const dek = await unwrapDataKey(file, { passphrase });
  return JSON.parse(await openFile(file, dek)) as SyncSnapshot;
}

const titlesOf = (snapshot: SyncSnapshot) =>
  snapshot.records
    .filter((r): r is Extract<typeof r, { title: string }> => 'title' in r)
    .map((r) => r.title)
    .sort();

async function enabled() {
  const folder = fakeFolder();
  const a = device(folder);
  await a.add('From A');
  await a.sync();
  const recoveryCode = generateRecoveryCode();
  await a.controller.enable(PASSPHRASE, recoveryCode, true);
  return { folder, a, recoveryCode };
}

describe('turning encryption on', () => {
  it('encrypts everything into its own file and leaves a marker old versions stop on', async () => {
    const { folder, a } = await enabled();
    expect(folder.main()).toEqual({
      schemaVersion: 3,
      encrypted: true,
      updatedAt: 10_000,
      records: [],
    });
    expect(JSON.stringify(folder.enc())).not.toContain('From A');
    const contents = await driveContents(folder);
    expect(titlesOf(contents)).toEqual(['From A']);
    expect(contents.settings?.features?.encryptedSync).toBe(true);
    expect(await a.controller.isUnlocked()).toBe(true);
    expect(await a.controller.driveState()).toBe('on');

    // An older version (no encryption support) reads the marker: "update", nothing written.
    const writes = folder.writes.length;
    const error = await syncWithDrive(a.repo, folder.plain, { now: clock }).catch((e) => e);
    expect(error).toMatchObject({ kind: 'newer-schema' });
    expect(error.message).toContain('Update AppliCliq to keep syncing');
    expect(() => parseSnapshot(folder.main())).toThrow(SyncError);
    expect(folder.writes.length).toBe(writes);
  });

  it('works on an empty Drive without ever creating a plain file', async () => {
    const folder = fakeFolder();
    const a = device(folder);
    await a.add('Only here');
    await a.controller.enable(PASSPHRASE, generateRecoveryCode(), true);
    expect(folder.writes).toEqual([
      `create ${ENCRYPTED_SYNC_FILE_NAME}`,
      `create ${SYNC_FILE_NAME}`,
    ]);
    expect(titlesOf(await driveContents(folder))).toEqual(['Only here']);
  });

  it('merges what other devices synced before encrypting', async () => {
    const folder = fakeFolder();
    const a = device(folder);
    const b = device(folder);
    await b.add('From B');
    await b.sync();
    await a.add('From A');
    await a.controller.enable(PASSPHRASE, generateRecoveryCode(), true);
    expect(titlesOf(await driveContents(folder))).toEqual(['From A', 'From B']);
  });

  it('refuses when Drive is already encrypted', async () => {
    const { a } = await enabled();
    await expect(a.controller.enable(PASSPHRASE, generateRecoveryCode(), true)).rejects.toThrow(
      /already on/,
    );
  });

  it('stops on a Drive file it cannot read', async () => {
    const folder = fakeFolder();
    folder.put(SYNC_FILE_NAME, { schemaVersion: 9, records: [] });
    const a = device(folder);
    await expect(
      a.controller.enable(PASSPHRASE, generateRecoveryCode(), true),
    ).rejects.toMatchObject({
      kind: 'newer-schema',
    });
    expect(folder.writes).toEqual([]);
  });
});

describe('another device', () => {
  it('is locked until unlocked: nothing is merged or uploaded', async () => {
    const { folder } = await enabled();
    const b = device(folder);
    await b.add('From B');
    const writes = folder.writes.length;
    await expect(b.sync()).rejects.toMatchObject({ kind: 'locked' });
    expect(folder.writes.length).toBe(writes);
    expect(await b.titles()).toEqual(['From B']);
  });

  it('merges both ways after unlocking, and the upload stays encrypted', async () => {
    const { folder, a } = await enabled();
    const b = device(folder);
    await b.add('From B');
    await b.controller.unlock({ passphrase: PASSPHRASE }, true);
    expect(await b.sync()).toMatchObject({ encrypted: true, uploaded: true });
    expect(await b.titles()).toEqual(['From A', 'From B']);
    expect(JSON.stringify(folder.files.get([...folder.files.keys()].at(-1)!))).not.toContain(
      'From B',
    );
    expect((await b.repo.getSettings()).features.encryptedSync).toBe(true);

    await a.sync();
    expect(await a.titles()).toEqual(['From A', 'From B']);
    // A deletion on A reaches B through the encrypted file.
    const fromB = (await a.repo.getJobs()).find((j) => j.title === 'From B')!;
    await a.repo.deleteJob(fromB.id);
    await a.sync();
    await b.sync();
    expect(await b.titles()).toEqual(['From A']);
  });

  it('unlocks with the recovery code instead', async () => {
    const { folder, recoveryCode } = await enabled();
    const b = device(folder);
    await b.controller.unlock({ recoveryCode: recoveryCode.toLowerCase() }, true);
    await b.sync();
    expect(await b.titles()).toEqual(['From A']);
  });

  it('reports a wrong passphrase or code and stays locked', async () => {
    const { folder } = await enabled();
    const b = device(folder);
    await expect(
      b.controller.unlock({ passphrase: 'not the passphrase' }, true),
    ).rejects.toMatchObject({
      kind: 'wrong-passphrase',
    });
    await expect(
      b.controller.unlock({ recoveryCode: generateRecoveryCode() }, true),
    ).rejects.toMatchObject({ kind: 'wrong-recovery-code' });
    expect(await b.controller.isUnlocked()).toBe(false);
  });

  it('reports a tampered file on unlock and never merges it', async () => {
    const { folder } = await enabled();
    const file = folder.enc()!;
    const bytes = Uint8Array.from(atob(file.ciphertext), (c) => c.charCodeAt(0));
    bytes[5] = bytes[5]! ^ 1;
    file.ciphertext = btoa(String.fromCharCode(...bytes));
    const b = device(folder);
    await expect(b.controller.unlock({ passphrase: PASSPHRASE }, true)).rejects.toMatchObject({
      kind: 'tampered',
    });
    expect(await b.titles()).toEqual([]);
  });

  it('stops on an encrypted file from a newer version', async () => {
    const { folder, a } = await enabled();
    folder.enc()!.version = 2;
    const writes = folder.writes.length;
    await expect(a.sync()).rejects.toMatchObject({ kind: 'newer-schema' });
    folder.enc()!.version = 1;
    folder.enc()!.format = 'something-else' as never;
    await expect(a.sync()).rejects.toMatchObject({ kind: 'invalid-remote' });
    expect(folder.writes.length).toBe(writes);
  });

  it('asks again when its stored key no longer opens the file', async () => {
    const { folder, a } = await enabled();
    const b = device(folder);
    await b.controller.unlock({ passphrase: PASSPHRASE }, true);
    // Encryption turned off and on again on A: a new data key.
    await a.controller.disable(PASSPHRASE);
    await a.controller.enable(PASSPHRASE, generateRecoveryCode(), true);
    await expect(b.sync()).rejects.toMatchObject({ kind: 'locked' });
    expect(b.forgotten()).toBe(1);
    expect(await b.controller.isUnlocked()).toBe(false);
  });
});

describe('keys on this device', () => {
  it('locks and unlocks; local data stays usable while locked', async () => {
    const { folder, a } = await enabled();
    await a.controller.lock();
    expect(await a.controller.isUnlocked()).toBe(false);
    await a.add('Offline edit');
    const writes = folder.writes.length;
    await expect(a.sync()).rejects.toMatchObject({ kind: 'locked' });
    expect(folder.writes.length).toBe(writes);
    await a.controller.unlock({ passphrase: PASSPHRASE }, true);
    await a.sync();
    expect(titlesOf(await driveContents(folder))).toEqual(['From A', 'Offline edit']);
  });

  it('remembers a non-extractable key, or keeps it in memory only', async () => {
    const { folder } = await enabled();
    const b = device(folder);
    await b.controller.unlock({ passphrase: PASSPHRASE }, true);
    expect(await b.controller.isRemembered()).toBe(true);
    expect((await b.keys.load())!.extractable).toBe(false);

    const c = device(folder);
    await c.controller.unlock({ passphrase: PASSPHRASE }, false);
    expect(await c.controller.isRemembered()).toBe(false);
    expect(await c.controller.isUnlocked()).toBe(true);
    // From memory into IndexedDB, and back (a remembered key can't be read out: it locks).
    expect(await c.controller.setRemembered(true)).toBe(true);
    expect(await c.controller.isRemembered()).toBe(true);
    expect(await c.controller.setRemembered(false)).toBe(false);
    expect(await c.controller.isUnlocked()).toBe(false);
  });
});

describe('passphrase and recovery code', () => {
  it('changes the passphrase without re-encrypting the data', async () => {
    const { folder, a } = await enabled();
    const before = folder.enc()!;
    await a.controller.changePassphrase({ passphrase: PASSPHRASE }, 'a whole new passphrase', true);
    const after = folder.enc()!;
    expect(after.ciphertext).toBe(before.ciphertext);
    expect(after.iv).toBe(before.iv);
    const b = device(folder);
    await expect(b.controller.unlock({ passphrase: PASSPHRASE }, true)).rejects.toMatchObject({
      kind: 'wrong-passphrase',
    });
    await b.controller.unlock({ passphrase: 'a whole new passphrase' }, true);
    await b.sync();
    expect(await b.titles()).toEqual(['From A']);
  });

  it('sets a new passphrase with the recovery code (forgot passphrase)', async () => {
    const { folder, recoveryCode } = await enabled();
    const b = device(folder);
    await b.controller.checkRecoveryCode(recoveryCode);
    expect(await b.controller.isUnlocked()).toBe(false);
    await b.controller.changePassphrase({ recoveryCode }, 'remembered this time', true);
    expect(await b.controller.isUnlocked()).toBe(true);
    expect(titlesOf(await driveContents(folder, 'remembered this time'))).toEqual(['From A']);
  });

  it('resets the recovery code: the old one stops working', async () => {
    const { folder, a, recoveryCode } = await enabled();
    const newCode = generateRecoveryCode();
    await a.controller.resetRecoveryCode(PASSPHRASE, newCode);
    const b = device(folder);
    await expect(b.controller.checkRecoveryCode(recoveryCode)).rejects.toMatchObject({
      kind: 'wrong-recovery-code',
    });
    await b.controller.unlock({ recoveryCode: newCode }, true);
  });

  it('fails cleanly when another device writes during a passphrase change', async () => {
    const { folder, a } = await enabled();
    folder.beforeUpdate(ENCRYPTED_SYNC_FILE_NAME, () => {
      const stored = [...folder.files.values()].find((f) => f.name === ENCRYPTED_SYNC_FILE_NAME)!;
      stored.etag++;
    });
    await expect(
      a.controller.changePassphrase({ passphrase: PASSPHRASE }, 'another passphrase', true),
    ).rejects.toMatchObject({ kind: 'conflict' });
    await a.controller.lock();
    await a.controller.unlock({ passphrase: PASSPHRASE }, true);
  });
});

describe('encrypted sync', () => {
  it('uploads with a new IV each time and only when something changed', async () => {
    const { folder, a } = await enabled();
    expect(await a.sync()).toMatchObject({ uploaded: false, encrypted: true });
    const ivs = new Set([folder.enc()!.iv]);
    await a.add('Second');
    await a.sync();
    ivs.add(folder.enc()!.iv);
    await a.add('Third');
    await a.sync();
    ivs.add(folder.enc()!.iv);
    expect(ivs.size).toBe(3);
  });

  it('starts over on 412 so another device’s write is merged', async () => {
    const { folder, a } = await enabled();
    const b = device(folder);
    await b.controller.unlock({ passphrase: PASSPHRASE }, true);
    await b.sync();
    await a.add('From A again');
    await b.add('From B');
    // B uploads between A's download and A's upload: A's upload gets a 412 and starts over.
    folder.beforeUpdate(ENCRYPTED_SYNC_FILE_NAME, () => b.sync());
    const updates = () => folder.writes.filter((w) => w.includes(ENCRYPTED_SYNC_FILE_NAME)).length;
    const before = updates();
    expect(await a.sync()).toMatchObject({ uploaded: true });
    expect(updates() - before).toBe(2); // B's upload, then A's second attempt
    expect(titlesOf(await driveContents(folder))).toEqual(['From A', 'From A again', 'From B']);
    expect(await a.titles()).toEqual(['From A', 'From A again', 'From B']);
  });

  it('folds in a plain file an older version wrote, then replaces it with the marker', async () => {
    const { folder, a } = await enabled();
    // The marker was deleted by hand, and an older version then created a plain file.
    const [markerId] = [...folder.files].find(([, f]) => f.name === SYNC_FILE_NAME)!;
    folder.files.delete(markerId);
    const other = createJobRepository(new AppliCliqDB(`test-${crypto.randomUUID()}`), clock);
    const old = await other.addJob({ url: 'https://old.test', title: 'Old version', company: 'X' });
    folder.put(SYNC_FILE_NAME, { schemaVersion: 2, updatedAt: 1, records: [old] });

    expect(await a.sync()).toMatchObject({ encrypted: true, uploaded: true });
    expect(folder.main()).toMatchObject({ schemaVersion: 3, encrypted: true, records: [] });
    expect(folder.countOf(SYNC_FILE_NAME)).toBe(1);
    expect(titlesOf(await driveContents(folder))).toEqual(['From A', 'Old version']);
  });

  it('goes back to plain sync when encryption was turned off elsewhere and a delete failed', async () => {
    const { folder, a } = await enabled();
    const b = device(folder);
    await b.controller.unlock({ passphrase: PASSPHRASE }, true);
    await b.sync();
    const leftover = structuredClone(folder.enc());
    await a.controller.disable(PASSPHRASE);
    folder.put(ENCRYPTED_SYNC_FILE_NAME, leftover);
    expect(await b.sync()).toMatchObject({ encrypted: false });
    expect((await b.repo.getSettings()).features.encryptedSync).toBe(false);
    expect(folder.main()).toMatchObject({ schemaVersion: 2 });
  });

  it('recreates a missing marker when only the encrypted file is left', async () => {
    const { folder, a } = await enabled();
    const [markerId] = [...folder.files].find(([, f]) => f.name === SYNC_FILE_NAME)!;
    folder.files.delete(markerId);
    expect(await a.sync()).toMatchObject({ encrypted: true });
    expect(folder.main()).toMatchObject({ schemaVersion: 3, encrypted: true });
  });

  it('never uploads plain data when encryption is on and Drive is empty', async () => {
    const { folder, a } = await enabled();
    folder.files.clear();
    await expect(a.sync()).rejects.toMatchObject({ kind: 'encryption' });
    expect(folder.files.size).toBe(0);
  });

  it('keeps synced settings inside the encrypted payload', async () => {
    const { folder, a } = await enabled();
    await a.repo.updateSettings({ goals: { daily: 7 } });
    await a.sync();
    expect((await driveContents(folder)).settings?.goals?.daily).toBe(7);
    expect(JSON.stringify(folder.main())).not.toContain('goals');
  });
});

describe('turning encryption off', () => {
  it('writes plain data back, deletes the encrypted file and the key', async () => {
    const { folder, a } = await enabled();
    const b = device(folder);
    await b.controller.unlock({ passphrase: PASSPHRASE }, true);
    await b.add('From B');
    await b.sync();

    await expect(a.controller.disable('wrong passphrase!')).rejects.toMatchObject({
      kind: 'wrong-passphrase',
    });
    await a.controller.disable(PASSPHRASE);
    expect(folder.countOf(ENCRYPTED_SYNC_FILE_NAME)).toBe(0);
    const plain = parseSnapshot(folder.main());
    expect(plain.records.map((r) => ('title' in r ? r.title : '')).sort()).toEqual([
      'From A',
      'From B',
    ]);
    expect((plain.settings as typeof DEFAULT_SETTINGS).features.encryptedSync).toBe(false);
    expect(await a.controller.isUnlocked()).toBe(false);
    expect(await a.titles()).toEqual(['From A', 'From B']);

    // Other devices go back to plain sync and pick up the switch.
    expect(await b.sync()).toMatchObject({ encrypted: false });
    expect((await b.repo.getSettings()).features.encryptedSync).toBe(false);
  });

  it('turns off when the encrypted data was deleted, keeping this device’s copy', async () => {
    const { folder, a } = await enabled();
    const [encId] = [...folder.files].find(([, f]) => f.name === ENCRYPTED_SYNC_FILE_NAME)!;
    folder.files.delete(encId);
    await a.controller.disable('');
    expect(parseSnapshot(folder.main()).records).toHaveLength(1);
    expect(await a.sync()).toMatchObject({ encrypted: false });
  });
});

describe('the default settings', () => {
  it('have encrypted sync off', () => {
    expect(splitSettings(DEFAULT_SETTINGS).synced.features?.encryptedSync).toBe(false);
  });
});
