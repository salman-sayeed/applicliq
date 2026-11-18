import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PocketCareerDB, createJobRepository } from './storage';
import { TOMBSTONE_TTL_MS } from './types';

let db: PocketCareerDB;
let clock: number;
const repo = () => createJobRepository(db, () => clock);

beforeEach(() => {
  clock = 1_000;
  db = new PocketCareerDB(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('job repository', () => {
  it('creates a job with an initial history entry', async () => {
    const job = await repo().create({ url: 'https://x.test/1', title: 'Dev', company: 'X' });
    expect(job.status).toBe('saved');
    expect(job.history).toEqual([{ status: 'saved', at: 1_000 }]);
    expect(await repo().get(job.id)).toEqual(job);
  });

  it('appends to history only when the status changes', async () => {
    const job = await repo().create({ url: 'u', title: 't', company: 'c' });
    clock = 2_000;
    await repo().update(job.id, { status: 'applied' });
    clock = 3_000;
    const updated = await repo().update(job.id, { notes: 'sent cover letter' });
    expect(updated.history.map((h) => h.status)).toEqual(['saved', 'applied']);
    expect(updated.updatedAt).toBe(3_000);
  });

  it('deleting leaves a tombstone with only id + deletedAt, hidden from the UI', async () => {
    const job = await repo().create({ url: 'u', title: 't', company: 'c' });
    clock = 5_000;
    await repo().remove(job.id);
    expect(await repo().list()).toEqual([]);
    expect(await repo().get(job.id)).toBeUndefined();
    expect(await repo().allRecords()).toEqual([{ id: job.id, deletedAt: 5_000 }]);
  });

  it('purges tombstones after 30 days', async () => {
    const a = await repo().create({ url: 'u', title: 't', company: 'c' });
    const b = await repo().create({ url: 'u', title: 't', company: 'c' });
    await repo().remove(a.id);
    clock += TOMBSTONE_TTL_MS + 1;
    await repo().remove(b.id);
    expect(await repo().purgeExpiredTombstones()).toBe(1);
    expect((await repo().allRecords()).map((r) => r.id)).toEqual([b.id]);
  });
});
