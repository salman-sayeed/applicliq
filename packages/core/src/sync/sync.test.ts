import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PocketCareerDB, createJobRepository } from '../storage';
import type { DriveClient, SyncSnapshot } from './drive';
import { syncWithDrive } from './sync';

let db: PocketCareerDB;
const clock = () => 10_000;

function fakeDrive(initial?: SyncSnapshot) {
  let stored = initial;
  const drive: DriveClient = {
    read: async () => stored,
    write: async (s) => {
      stored = s;
    },
  };
  return { drive, get: () => stored };
}

beforeEach(() => {
  db = new PocketCareerDB(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('syncWithDrive', () => {
  it('pushes local records when Drive has no file yet', async () => {
    const repo = createJobRepository(db, clock);
    const job = await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const { drive, get } = fakeDrive();
    expect(await syncWithDrive(repo, drive, clock)).toEqual({ records: 1, pulled: false });
    expect(get()?.records).toEqual([job]);
  });

  it('merges remote changes in, skipping malformed remote records', async () => {
    const repo = createJobRepository(db, clock);
    const job = await repo.addJob({ url: 'https://a.test', title: 't', company: 'c' });
    const remote = {
      version: 1,
      updatedAt: 1,
      records: [{ id: job.id, deletedAt: 20_000 }, { id: 'broken' }],
    } as SyncSnapshot;
    const { drive, get } = fakeDrive(remote);
    await syncWithDrive(repo, drive, clock);
    expect(await repo.getJobs()).toEqual([]);
    expect(await repo.getAllRecords()).toEqual([{ id: job.id, deletedAt: 20_000 }]);
    expect(get()?.records).toEqual([{ id: job.id, deletedAt: 20_000 }]);
  });
});
