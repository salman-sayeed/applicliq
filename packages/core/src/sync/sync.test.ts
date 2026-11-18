import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, splitSettings } from '../settings';
import { PocketCareerDB, createJobRepository } from '../storage';
import type { JobRecord } from '../types';
import { type DriveClient, DriveError, type SyncSnapshot } from './drive';
import { SyncError, deleteDriveData, parseSnapshot, syncWithDrive, toSyncError } from './sync';

let db: PocketCareerDB;
const clock = () => 10_000;

type File = { data: unknown; etag: number };

/** In-memory Drive with ETags: `update` with a stale ETag fails with 412. */
function fakeDrive(initial: unknown[] = []) {
  const files = new Map<string, File>();
  let seq = 0;
  for (const data of initial) files.set(`f${seq++}`, { data, etag: 1 });
  const calls = { updates: 0, creates: 0, removes: 0 };
  /** Runs once, right before the next update: simulates another device writing first. */
  let beforeUpdate: (() => void) | undefined;

  const drive: DriveClient = {
    list: async () => [...files.keys()],
    download: async (id) => {
      const file = files.get(id)!;
      return { data: structuredClone(file.data), etag: `"${file.etag}"` };
    },
    update: async (id, snapshot, etag) => {
      calls.updates++;
      const hook = beforeUpdate;
      beforeUpdate = undefined;
      hook?.();
      const file = files.get(id)!;
      if (etag && etag !== `"${file.etag}"`) throw new DriveError('stale', 412);
      files.set(id, { data: structuredClone(snapshot), etag: file.etag + 1 });
    },
    create: async (snapshot) => {
      calls.creates++;
      const id = `f${seq++}`;
      files.set(id, { data: structuredClone(snapshot), etag: 1 });
      return id;
    },
    remove: async (id) => {
      calls.removes++;
      files.delete(id);
    },
    accountEmail: async () => 'me@example.test',
  };
  return {
    drive,
    calls,
    files,
    records: (id = [...files.keys()][0]!) => (files.get(id)?.data as SyncSnapshot).records,
    otherDeviceWrites: (write: (records: JobRecord[]) => JobRecord[]) => {
      beforeUpdate = () => {
        const [id, file] = [...files][0]!;
        const data = file.data as SyncSnapshot;
        files.set(id, { data: { ...data, records: write(data.records) }, etag: file.etag + 1 });
      };
    },
  };
}

/** A Drive file as a current device writes it, with untouched (default) settings. */
const snapshot = (
  records: unknown[],
  settings: unknown = splitSettings(DEFAULT_SETTINGS).synced,
) => ({
  schemaVersion: 1,
  updatedAt: 1,
  records,
  settings,
});

beforeEach(() => {
  db = new PocketCareerDB(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('syncWithDrive', () => {
  it('creates the file when Drive has none, and does nothing when there is nothing to sync', async () => {
    const repo = createJobRepository(db, clock);
    const empty = fakeDrive();
    expect(await syncWithDrive(repo, empty.drive, { now: clock })).toEqual({
      records: 0,
      uploaded: false,
      settingsChanged: false,
    });
    expect(empty.calls.creates).toBe(0);

    const job = await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    expect(await syncWithDrive(repo, empty.drive, { now: clock })).toEqual({
      records: 1,
      uploaded: true,
      settingsChanged: false,
    });
    expect(empty.files.size).toBe(1);
    expect(empty.records()).toEqual([job]);
    expect((empty.files.get('f0')!.data as SyncSnapshot).schemaVersion).toBe(1);
  });

  it('merges remote changes in, skipping malformed remote records', async () => {
    const repo = createJobRepository(db, clock);
    const job = await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const remote = fakeDrive([snapshot([{ id: job.id, deletedAt: 20_000 }, { id: 'broken' }])]);
    await syncWithDrive(repo, remote.drive, { now: clock });
    expect(await repo.getJobs()).toEqual([]);
    expect(await repo.getAllRecords()).toEqual([{ id: job.id, deletedAt: 20_000 }]);
    expect(remote.records()).toEqual([{ id: job.id, deletedAt: 20_000 }]);
  });

  it('only uploads when the merged set differs from Drive', async () => {
    const repo = createJobRepository(db, clock);
    await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const remote = fakeDrive([snapshot([])]);
    await syncWithDrive(repo, remote.drive, { now: clock });
    expect(remote.calls.updates).toBe(1);
    expect(await syncWithDrive(repo, remote.drive, { now: clock })).toMatchObject({
      uploaded: false,
    });
    expect(remote.calls.updates).toBe(1);
  });

  it('pulls without uploading when Drive is ahead', async () => {
    const repo = createJobRepository(db, clock);
    const other = createJobRepository(new PocketCareerDB(`test-${crypto.randomUUID()}`), clock);
    const job = await other.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const remote = fakeDrive([snapshot([job])]);
    expect(await syncWithDrive(repo, remote.drive, { now: clock })).toMatchObject({
      uploaded: false,
    });
    expect(await repo.getJobs()).toEqual([job]);
  });

  it('starts over on 412 so a write from another device is merged, not overwritten', async () => {
    const repo = createJobRepository(db, clock);
    const mine = await repo.addJob({ url: 'https://a.test', title: 'mine', company: 'c' });
    const remote = fakeDrive([snapshot([])]);
    const theirs = { ...mine, id: 'theirs', title: 'theirs' };
    remote.otherDeviceWrites((records) => [...records, theirs]);

    expect(await syncWithDrive(repo, remote.drive, { now: clock })).toMatchObject({
      uploaded: true,
    });
    expect(remote.calls.updates).toBe(2);
    expect(
      remote
        .records()
        .map((r) => r.id)
        .sort(),
    ).toEqual([mine.id, 'theirs'].sort());
    expect((await repo.getJobs()).map((j) => j.id).sort()).toEqual([mine.id, 'theirs'].sort());
  });

  it('gives up with a conflict error after too many 412s', async () => {
    const repo = createJobRepository(db, clock);
    await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const remote = fakeDrive([snapshot([])]);
    const drive: DriveClient = {
      ...remote.drive,
      update: async () => {
        throw new DriveError('stale', 412);
      },
    };
    await expect(syncWithDrive(repo, drive, { now: clock, maxAttempts: 2 })).rejects.toMatchObject({
      kind: 'conflict',
    });
  });

  it('folds duplicate files into the oldest one and deletes them', async () => {
    const repo = createJobRepository(db, clock);
    const other = createJobRepository(new PocketCareerDB(`test-${crypto.randomUUID()}`), clock);
    const a = await other.addJob({ url: 'https://a.test', title: 'a', company: 'c' });
    const b = await other.addJob({ url: 'https://b.test', title: 'b', company: 'c' });
    const remote = fakeDrive([snapshot([a]), snapshot([b])]);
    await syncWithDrive(repo, remote.drive, { now: clock });
    expect([...remote.files.keys()]).toEqual(['f0']);
    expect(
      remote
        .records()
        .map((r) => r.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
  });

  it('never overwrites a file from a newer schema or a foreign file', async () => {
    const repo = createJobRepository(db, clock);
    await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const newer = fakeDrive([{ schemaVersion: 2, updatedAt: 1, records: [] }]);
    await expect(syncWithDrive(repo, newer.drive, { now: clock })).rejects.toMatchObject({
      kind: 'newer-schema',
    });
    const foreign = fakeDrive([{ hello: 'world' }]);
    await expect(syncWithDrive(repo, foreign.drive, { now: clock })).rejects.toMatchObject({
      kind: 'invalid-remote',
    });
    expect(newer.calls.updates + foreign.calls.updates).toBe(0);
    expect(await repo.getJobs()).toHaveLength(1);
  });
});

describe('syncWithDrive settings', () => {
  const remoteSettings = (updatedAt: number, daily: number) => ({
    ...splitSettings(DEFAULT_SETTINGS).synced,
    updatedAt,
    goals: { ...splitSettings(DEFAULT_SETTINGS).synced.goals, daily },
  });

  it('pulls newer settings from Drive without uploading', async () => {
    const repo = createJobRepository(db, clock);
    const remote = fakeDrive([snapshot([], remoteSettings(5_000, 6))]);
    expect(await syncWithDrive(repo, remote.drive, { now: clock })).toMatchObject({
      uploaded: false,
      settingsChanged: true,
    });
    expect((await repo.getSettings()).goals.daily).toBe(6);
  });

  it('uploads newer local settings, without device keys', async () => {
    const repo = createJobRepository(db, clock);
    await repo.updateSettings({ goals: { daily: 4 }, jobPages: { showBadge: true } });
    const remote = fakeDrive([snapshot([], remoteSettings(5_000, 6))]);
    expect(await syncWithDrive(repo, remote.drive, { now: clock })).toMatchObject({
      uploaded: true,
      settingsChanged: false,
    });
    const file = remote.files.get('f0')!.data as SyncSnapshot;
    expect(file.settings?.goals?.daily).toBe(4);
    expect(file.settings?.jobPages).toEqual({ duplicateWarning: true, toolbarBadge: 'goal' });
  });

  it('adds settings to a file written by an older version', async () => {
    const repo = createJobRepository(db, clock);
    const remote = fakeDrive([{ schemaVersion: 1, updatedAt: 1, records: [] }]);
    expect(await syncWithDrive(repo, remote.drive, { now: clock })).toMatchObject({
      uploaded: true,
    });
    expect((remote.files.get('f0')!.data as SyncSnapshot).settings?.version).toBe(1);
  });

  it('passes settings from a newer app version through untouched', async () => {
    const repo = createJobRepository(db, clock);
    await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const future = { version: 99, updatedAt: 1, something: 'new' };
    const remote = fakeDrive([snapshot([], future)]);
    await syncWithDrive(repo, remote.drive, { now: clock });
    const file = remote.files.get('f0')!.data as SyncSnapshot;
    expect(file.records).toHaveLength(1);
    expect(file.settings).toEqual(future);
    expect((await repo.getSettings()).updatedAt).toBe(0);
  });

  it('creates a file for changed settings even with no jobs', async () => {
    const repo = createJobRepository(db, clock);
    await repo.updateSettings({ appearance: { theme: 'dark' } });
    const empty = fakeDrive();
    expect(await syncWithDrive(repo, empty.drive, { now: clock })).toMatchObject({
      uploaded: true,
    });
  });
});

describe('deleteDriveData', () => {
  it('removes every sync file', async () => {
    const remote = fakeDrive([snapshot([]), snapshot([])]);
    expect(await deleteDriveData(remote.drive)).toBe(2);
    expect(remote.files.size).toBe(0);
  });
});

describe('parseSnapshot', () => {
  it('reads the legacy `version: 1` format', () => {
    expect(parseSnapshot({ version: 1, updatedAt: 1, records: [] })).toEqual({
      records: [],
      skipped: 0,
      settings: undefined,
    });
  });
});

describe('toSyncError', () => {
  it('classifies failures', () => {
    expect(toSyncError(new DriveError('x', 401)).kind).toBe('auth');
    expect(toSyncError(new DriveError('x', 503)).kind).toBe('server');
    expect(toSyncError(new TypeError('Failed to fetch')).kind).toBe('offline');
    const own = new SyncError('newer-schema', 'x');
    expect(toSyncError(own)).toBe(own);
  });
});
