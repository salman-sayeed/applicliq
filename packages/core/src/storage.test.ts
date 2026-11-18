import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PocketCareerDB, createJobRepository } from './storage';
import { DEFAULT_SETTINGS, type Job, type JobRecord, TOMBSTONE_TTL_MS } from './types';

let db: PocketCareerDB;
let clock: number;
const repo = () => createJobRepository(db, () => clock);
const input = (extra: Partial<Job> = {}) => ({
  url: 'https://jobs.test/1',
  title: 'Dev',
  company: 'Acme',
  ...extra,
});

beforeEach(() => {
  clock = 1_000;
  db = new PocketCareerDB(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('addJob / getJob', () => {
  it('creates a saved job with an initial history entry', async () => {
    const job = await repo().addJob(input());
    expect(job).toMatchObject({ status: 'saved', createdAt: 1_000, updatedAt: 1_000 });
    expect(job.history).toEqual([{ status: 'saved', at: 1_000 }]);
    expect(await repo().getJob(job.id)).toEqual(job);
  });

  it('honours an initial status', async () => {
    const job = await repo().addJob(input({ status: 'applied' }));
    expect(job.history).toEqual([{ status: 'applied', at: 1_000 }]);
  });

  it('stores the normalized URL and a trimmed company', async () => {
    const job = await repo().addJob(
      input({ url: 'https://jobs.test/1/?utm_source=x#apply', company: '  Acme  ' }),
    );
    expect(job.url).toBe('https://jobs.test/1');
    expect(job.company).toBe('Acme');
  });
});

describe('updateJob', () => {
  it('appends to history only when the status changes', async () => {
    const job = await repo().addJob(input());
    clock = 2_000;
    await repo().updateJob(job.id, { status: 'applied' });
    clock = 3_000;
    await repo().updateJob(job.id, { status: 'applied', notes: 'sent cover letter' });
    clock = 4_000;
    const updated = await repo().updateJob(job.id, { status: 'interview' });
    expect(updated.history).toEqual([
      { status: 'saved', at: 1_000 },
      { status: 'applied', at: 2_000 },
      { status: 'interview', at: 4_000 },
    ]);
    expect(updated.notes).toBe('sent cover letter');
  });

  it('always bumps updatedAt, even for an empty patch', async () => {
    const job = await repo().addJob(input());
    clock = 2_000;
    expect((await repo().updateJob(job.id, {})).updatedAt).toBe(2_000);
  });

  it('bumps updatedAt past the previous value even if the clock went backwards', async () => {
    const job = await repo().addJob(input());
    clock = 500;
    expect((await repo().updateJob(job.id, { notes: 'x' })).updatedAt).toBe(1_001);
  });

  it('ignores protected fields smuggled into the patch', async () => {
    const job = await repo().addJob(input());
    clock = 2_000;
    const sneaky = { id: 'other', createdAt: 0, updatedAt: 0, deletedAt: 1, history: [] };
    const updated = await repo().updateJob(job.id, sneaky as never);
    expect(updated).toMatchObject({ id: job.id, createdAt: 1_000, updatedAt: 2_000 });
    expect(updated.history).toHaveLength(1);
    expect(updated.deletedAt).toBeUndefined();
  });

  it('normalizes an updated URL', async () => {
    const job = await repo().addJob(input());
    const updated = await repo().updateJob(job.id, { url: 'https://jobs.test/2#top' });
    expect(updated.url).toBe('https://jobs.test/2');
  });

  it('throws for a missing or deleted job', async () => {
    await expect(repo().updateJob('nope', {})).rejects.toThrow('Job not found');
    const job = await repo().addJob(input());
    await repo().deleteJob(job.id);
    await expect(repo().updateJob(job.id, { notes: 'x' })).rejects.toThrow('Job not found');
  });
});

describe('deleteJob', () => {
  it('leaves a tombstone with only id + deletedAt, hidden from every query', async () => {
    const job = await repo().addJob(input());
    clock = 5_000;
    expect(await repo().deleteJob(job.id)).toBe(true);
    expect(await repo().getAllRecords()).toEqual([{ id: job.id, deletedAt: 5_000 }]);
    expect(await repo().getJobs()).toEqual([]);
    expect(await repo().getJob(job.id)).toBeUndefined();
    expect(await repo().getJobByUrl(job.url)).toBeUndefined();
    expect(await repo().findSameCompany('Acme')).toEqual([]);
  });

  it('returns false and changes nothing for unknown or already-deleted jobs', async () => {
    expect(await repo().deleteJob('nope')).toBe(false);
    const job = await repo().addJob(input());
    await repo().deleteJob(job.id);
    clock = 9_000;
    expect(await repo().deleteJob(job.id)).toBe(false);
    expect(await repo().getAllRecords()).toEqual([{ id: job.id, deletedAt: 1_000 }]);
  });

  it('never dates the tombstone before the last edit', async () => {
    const job = await repo().addJob(input());
    clock = 500;
    await repo().deleteJob(job.id);
    expect(await repo().getAllRecords()).toEqual([{ id: job.id, deletedAt: 1_000 }]);
  });
});

describe('getJobs', () => {
  it('returns live jobs, most recently updated first', async () => {
    const a = await repo().addJob(input({ title: 'a' }));
    clock = 2_000;
    const b = await repo().addJob(input({ title: 'b' }));
    clock = 3_000;
    await repo().updateJob(a.id, { notes: 'touched' });
    const c = await repo().addJob(input({ title: 'c' }));
    await repo().deleteJob(c.id);
    expect((await repo().getJobs()).map((j) => j.id)).toEqual([a.id, b.id]);
  });
});

describe('getJobByUrl', () => {
  it('matches regardless of tracking params, hash, param order and trailing slash', async () => {
    const job = await repo().addJob(input({ url: 'https://jobs.test/view?id=7&team=web' }));
    const found = await repo().getJobByUrl(
      'https://JOBS.test/view/?team=web&utm_campaign=x&id=7&gclid=abc#details',
    );
    expect(found?.id).toBe(job.id);
  });

  it('keeps meaningful query params apart', async () => {
    await repo().addJob(input({ url: 'https://jobs.test/view?id=7' }));
    expect(await repo().getJobByUrl('https://jobs.test/view?id=8')).toBeUndefined();
  });

  it('returns undefined when nothing matches', async () => {
    expect(await repo().getJobByUrl('https://jobs.test/none')).toBeUndefined();
  });
});

describe('findSameCompany', () => {
  it('finds other live jobs at the company, case-insensitively, newest first', async () => {
    const a = await repo().addJob(input({ company: 'Acme' }));
    clock = 2_000;
    const b = await repo().addJob(input({ company: 'ACME' }));
    clock = 3_000;
    const c = await repo().addJob(input({ company: 'acme' }));
    await repo().addJob(input({ company: 'Acme Labs' }));
    const d = await repo().addJob(input({ company: 'Acme' }));
    await repo().deleteJob(d.id);

    const found = await repo().findSameCompany(' acme ', c.id);
    expect(found.map((j) => j.id)).toEqual([b.id, a.id]);
  });

  it('returns nothing for a blank company', async () => {
    await repo().addJob(input({ company: '' }));
    expect(await repo().findSameCompany('   ')).toEqual([]);
  });
});

describe('purgeOldTombstones', () => {
  it('deletes only tombstones at least 30 days old', async () => {
    const a = await repo().addJob(input());
    const b = await repo().addJob(input());
    const live = await repo().addJob(input());
    await repo().deleteJob(a.id);
    clock += 1;
    await repo().deleteJob(b.id);
    clock = 1_000 + TOMBSTONE_TTL_MS;
    expect(await repo().purgeOldTombstones()).toBe(1);
    expect((await repo().getAllRecords()).map((r) => r.id).sort()).toEqual([b.id, live.id].sort());
  });

  it('accepts a custom TTL', async () => {
    const a = await repo().addJob(input());
    await repo().deleteJob(a.id);
    clock += 10;
    expect(await repo().purgeOldTombstones(10)).toBe(1);
  });
});

describe('settings', () => {
  it('returns defaults before anything is saved', async () => {
    expect(await repo().getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges partial updates, including nested goals, and persists them', async () => {
    await repo().updateSettings({ theme: 'dark' });
    await repo().updateSettings({ ghostedAfterDays: 14, goals: { applicationsPerWeek: 3 } });
    expect(await createJobRepository(db).getSettings()).toEqual({
      theme: 'dark',
      ghostedAfterDays: 14,
      goals: { applicationsPerWeek: 3 },
    });
  });
});

describe('exportJSON / importJSON', () => {
  it('round-trips every record, tombstones included, into another database', async () => {
    const kept = await repo().addJob(input({ tags: ['a'], salary: { min: 1, currency: 'EUR' } }));
    const gone = await repo().addJob(input());
    await repo().deleteJob(gone.id);
    const json = await repo().exportJSON();
    expect(JSON.parse(json)).toMatchObject({ version: 1, updatedAt: 1_000 });

    const other = new PocketCareerDB(`test-${crypto.randomUUID()}`);
    try {
      const otherRepo = createJobRepository(other, () => clock);
      expect(await otherRepo.importJSON(json)).toEqual({ imported: 2, skipped: 0 });
      expect(await otherRepo.getJobs()).toEqual([kept]);
      expect(await otherRepo.getAllRecords()).toContainEqual({ id: gone.id, deletedAt: 1_000 });
    } finally {
      await other.delete();
    }
  });

  it('merges instead of overwriting: newer local edits survive, newer file versions win', async () => {
    const a = await repo().addJob(input({ title: 'a' }));
    const b = await repo().addJob(input({ title: 'b' }));
    const backup = await repo().exportJSON();

    clock = 2_000;
    await repo().updateJob(a.id, { title: 'a edited after backup' });
    const c = await repo().addJob(input({ title: 'c, only local' }));
    // A newer version of b, e.g. from another device's export.
    const file = JSON.parse(backup) as { records: JobRecord[] };
    file.records = file.records.map((r) =>
      r.id === b.id ? { ...r, title: 'b from file', updatedAt: 3_000 } : r,
    );

    await repo().importJSON(backup);
    await repo().importJSON(JSON.stringify(file));

    const titles = Object.fromEntries((await repo().getJobs()).map((j) => [j.id, j.title]));
    expect(titles).toEqual({
      [a.id]: 'a edited after backup',
      [b.id]: 'b from file',
      [c.id]: 'c, only local',
    });
  });

  it('applies deletions from the file', async () => {
    const a = await repo().addJob(input());
    const file = { version: 1, updatedAt: 2_000, records: [{ id: a.id, deletedAt: 2_000 }] };
    await repo().importJSON(JSON.stringify(file));
    expect(await repo().getJobs()).toEqual([]);
  });

  it('skips malformed records and reports them', async () => {
    const good = {
      id: 'g',
      url: 'https://jobs.test/g',
      title: 't',
      company: 'c',
      status: 'saved',
      history: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const file = {
      version: 1,
      updatedAt: 1,
      records: [good, { id: 'bad', title: 'missing fields' }, null, 'junk'],
    };
    expect(await repo().importJSON(JSON.stringify(file))).toEqual({ imported: 1, skipped: 3 });
    expect((await repo().getJobs()).map((j) => j.id)).toEqual(['g']);
  });

  it('rejects files that are not exports, without touching local data', async () => {
    const a = await repo().addJob(input());
    await expect(repo().importJSON('{nope')).rejects.toThrow('not valid JSON');
    await expect(repo().importJSON('null')).rejects.toThrow('not a Pocket Career export');
    await expect(repo().importJSON('{"version":2,"records":[]}')).rejects.toThrow(
      'not a Pocket Career export',
    );
    await expect(repo().importJSON('[]')).rejects.toThrow('not a Pocket Career export');
    expect(await repo().getJobs()).toEqual([a]);
  });
});

describe('restoreJob', () => {
  it('undoes a delete, dated after the tombstone so it also wins a sync', async () => {
    const job = await repo().addJob(input({ tags: ['x'] }));
    clock = 5_000;
    await repo().deleteJob(job.id);
    clock = 4_000; // even if the clock went backwards
    const restored = await repo().restoreJob(job);
    expect(restored).toEqual({ ...job, updatedAt: 5_001 });
    expect(await repo().getJobs()).toEqual([restored]);
  });

  it('leaves a live job alone', async () => {
    const job = await repo().addJob(input());
    clock = 2_000;
    const edited = await repo().updateJob(job.id, { notes: 'kept' });
    expect(await repo().restoreJob(job)).toEqual(edited);
  });
});

describe('watchJobs', () => {
  it('emits the current jobs, then again after each change', async () => {
    const seen: string[][] = [];
    let notify = () => {};
    const unsubscribe = repo().watchJobs((jobs) => {
      seen.push(jobs.map((j) => j.title));
      notify();
    });
    const next = () => new Promise<void>((resolve) => (notify = resolve));

    await next();
    await Promise.all([next(), repo().addJob(input({ title: 'First' }))]);
    unsubscribe();
    await repo().addJob(input({ title: 'Second' }));
    await new Promise((r) => setTimeout(r, 50));

    expect(seen).toEqual([[], ['First']]);
  });
});
