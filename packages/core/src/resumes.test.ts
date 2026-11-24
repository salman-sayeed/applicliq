import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeRecords } from './merge';
import {
  copyName,
  linkResumeLabels,
  pickResume,
  resumeSyncEnabled,
  sanitizeResumeRecord,
  wordCount,
} from './resumes';
import { DEFAULT_SETTINGS, applySettingsPatch, combineSettings, splitSettings } from './settings';
import { AppliCliqDB, createJobRepository } from './storage';
import { type DriveClient, type SyncSnapshot } from './sync/drive';
import { syncWithDrive } from './sync/sync';
import type { Job, Resume, ResumeRecord } from './types';

const resume = (id: string, updatedAt: number, extra: Partial<Resume> = {}): Resume => ({
  id,
  name: `Resume ${id}`,
  text: 'TypeScript',
  createdAt: 1,
  updatedAt,
  ...extra,
});
const tomb = (id: string, deletedAt: number) => ({ id, deletedAt });

describe('resume helpers', () => {
  it('counts words', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('  Senior engineer\n\nReact,  Go ')).toBe(4);
  });

  it('sanitizes records from Drive', () => {
    expect(sanitizeResumeRecord({ id: 'a', deletedAt: 5, name: 'x' })).toEqual(tomb('a', 5));
    expect(sanitizeResumeRecord({ id: 'a', name: 'x' })).toBeUndefined();
    expect(
      sanitizeResumeRecord({ id: '', name: 'x', text: '', createdAt: 1, updatedAt: 1 }),
    ).toBeUndefined();
    const clean = sanitizeResumeRecord({ ...resume('a', 2), name: '  ', extra: true });
    expect(clean).toEqual({ ...resume('a', 2), name: 'Resume' });
  });

  it('picks the job’s resume, then the default, then the newest', () => {
    const list = [resume('a', 1), resume('b', 3), resume('c', 2)];
    expect(pickResume(list, { jobResumeId: 'c', defaultId: 'a' })?.id).toBe('c');
    expect(pickResume(list, { jobResumeId: 'gone', defaultId: 'a' })?.id).toBe('a');
    expect(pickResume(list)?.id).toBe('b');
    expect(pickResume([])).toBeUndefined();
  });

  it('names copies', () => {
    const list = [
      resume('a', 1, { name: 'Frontend' }),
      resume('b', 1, { name: 'Frontend (copy)' }),
    ];
    expect(copyName('Frontend', list)).toBe('Frontend (copy 2)');
    expect(copyName('Frontend (copy)', list)).toBe('Frontend (copy 2)');
    expect(copyName('Backend', list)).toBe('Backend (copy)');
  });
});

describe('resume sync setting', () => {
  it('follows encrypted sync until the user chooses', () => {
    expect(resumeSyncEnabled(DEFAULT_SETTINGS)).toBe(false);
    const encrypted = applySettingsPatch(DEFAULT_SETTINGS, { features: { encryptedSync: true } });
    expect(resumeSyncEnabled(encrypted)).toBe(true);
    expect(resumeSyncEnabled(applySettingsPatch(encrypted, { resumes: { sync: false } }))).toBe(
      false,
    );
    expect(
      resumeSyncEnabled(applySettingsPatch(DEFAULT_SETTINGS, { resumes: { sync: true } })),
    ).toBe(true);
  });

  it('turns Resume match on for settings saved before it existed', () => {
    const old = splitSettings(DEFAULT_SETTINGS).synced as Record<string, unknown>;
    delete old.resumes;
    old.features = { ...(old.features as object), resumeMatch: false };
    expect(combineSettings(old, undefined).features.resumeMatch).toBe(true);
    // Once a version with resumes saved them, the switch is the user's.
    const off = applySettingsPatch(DEFAULT_SETTINGS, { features: { resumeMatch: false } });
    expect(combineSettings(splitSettings(off).synced, undefined).features.resumeMatch).toBe(false);
  });

  it('cleans the ignore list', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      resumes: { ignoredSkills: ['Communication', ' communication ', '', 'Go'] },
    });
    expect(next.resumes.ignoredSkills).toEqual(['Communication', 'Go']);
  });
});

describe('resume merge (tombstones, last write wins)', () => {
  it('keeps the newer version and lets deletions win ties', () => {
    const merged = mergeRecords<ResumeRecord>(
      [resume('a', 5, { text: 'old' }), tomb('b', 7), resume('c', 3)],
      [resume('a', 6, { text: 'new' }), resume('b', 7), tomb('c', 2)],
      100,
    );
    expect(merged).toEqual([resume('a', 6, { text: 'new' }), tomb('b', 7), resume('c', 3)]);
  });

  it('drops tombstones after 30 days', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(mergeRecords<ResumeRecord>([tomb('a', 0)], [], 31 * day)).toEqual([]);
  });
});

describe('resumeVersion → resumeId migration', () => {
  const job = (id: string, extra: Partial<Job>): Job => ({
    id,
    url: `https://jobs.test/${id}`,
    title: 'Dev',
    company: 'Acme',
    status: 'applied',
    history: [],
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  });

  it('links jobs whose label names a resume (any case)', () => {
    const resumes = [resume('r1', 1, { name: 'Frontend v3' })];
    const links = linkResumeLabels(
      [
        job('a', { resumeVersion: 'frontend V3 ' }),
        job('b', { resumeVersion: 'backend' }),
        job('c', { resumeVersion: 'Frontend v3', resumeId: 'other' }),
        { id: 'd', deletedAt: 1 },
      ],
      resumes,
    );
    expect(links.map((l) => [l.job.id, l.resumeId])).toEqual([['a', 'r1']]);
  });
});

describe('repository', () => {
  let db: AppliCliqDB;
  let clock: number;
  const repo = () => createJobRepository(db, () => clock);

  beforeEach(() => {
    clock = 1_000;
    db = new AppliCliqDB(`test-${crypto.randomUUID()}`);
  });
  afterEach(async () => {
    await db.delete();
  });

  it('adds, renames, edits, duplicates, deletes and restores resumes', async () => {
    const r = repo();
    const a = await r.addResume({ name: ' Frontend ', text: 'React' });
    expect(a).toMatchObject({ name: 'Frontend', text: 'React', updatedAt: 1_000 });
    clock = 2_000;
    const edited = await r.updateResume(a.id, { name: 'Frontend v2', text: 'React, Go' });
    expect(edited).toMatchObject({ name: 'Frontend v2', text: 'React, Go', updatedAt: 2_000 });
    const copy = await r.duplicateResume(a.id);
    expect(copy.name).toBe('Frontend v2 (copy)');
    expect((await r.getResumes()).map((x) => x.name)).toEqual([
      'Frontend v2',
      'Frontend v2 (copy)',
    ]);

    clock = 3_000;
    expect(await r.deleteResume(a.id)).toBe(true);
    expect(await r.getResume(a.id)).toBeUndefined();
    expect(await db.resumes.get(a.id)).toEqual({ id: a.id, deletedAt: 3_000 });
    const restored = await r.restoreResume(edited);
    expect(restored.updatedAt).toBeGreaterThan(3_000);
    expect(await r.getResume(a.id)).toMatchObject({ name: 'Frontend v2' });
  });

  it('links old resume labels when a resume with that name is added or renamed', async () => {
    const r = repo();
    const job = await r.addJob({ url: 'https://x.test/1', title: 'Dev', company: 'A' });
    await r.updateJob(job.id, { resumeVersion: 'Data CV' });
    const other = await r.addResume({ name: 'Other' });
    expect((await r.getJob(job.id))?.resumeVersion).toBe('Data CV');
    await r.updateResume(other.id, { name: 'data cv' });
    const linked = await r.getJob(job.id);
    expect(linked?.resumeId).toBe(other.id);
    expect(linked?.resumeVersion).toBeUndefined();
  });

  it('exports and imports resumes with the backup', async () => {
    const r = repo();
    await r.addResume({ name: 'CV', text: 'Python' });
    const json = await r.exportJSON();
    const db2 = new AppliCliqDB(`test-${crypto.randomUUID()}`);
    const r2 = createJobRepository(db2, () => clock);
    await r2.importJSON(json);
    expect((await r2.getResumes()).map((x) => x.text)).toEqual(['Python']);
    await db2.delete();
  });

  it('clears resumes with the local data', async () => {
    const r = repo();
    await r.addResume({ name: 'CV' });
    await r.clearLocalData();
    expect(await db.resumes.count()).toBe(0);
  });
});

describe('sync', () => {
  let dbs: AppliCliqDB[] = [];
  const device = (now = () => 10_000) => {
    const db = new AppliCliqDB(`test-${crypto.randomUUID()}`);
    dbs.push(db);
    return createJobRepository(db, now);
  };
  afterEach(async () => {
    await Promise.all(dbs.map((db) => db.delete()));
    dbs = [];
  });

  // The devices' clock: tombstones must not look 30 days old to the sync.
  const opts = { now: () => 10_000 };

  /** One shared in-memory Drive file. */
  function fakeDrive() {
    let file: { data: unknown; etag: number } | undefined;
    const drive: DriveClient = {
      fileName: 'career-pocket.json',
      list: async () => (file ? [{ id: 'f', name: 'career-pocket.json' }] : []),
      rename: async () => {},
      download: async () => ({ data: structuredClone(file!.data), etag: `"${file!.etag}"` }),
      update: async (_id, snapshot) => {
        file = { data: structuredClone(snapshot), etag: file!.etag + 1 };
      },
      create: async (snapshot) => {
        file = { data: structuredClone(snapshot), etag: 1 };
        return 'f';
      },
      remove: async () => {
        file = undefined;
      },
      accountEmail: async () => 'me@example.test',
    };
    return { drive, data: () => file?.data as SyncSnapshot | undefined };
  }

  it('keeps resumes out of Drive while resume sync is off (the default)', async () => {
    const { drive, data } = fakeDrive();
    const a = device();
    await a.addResume({ name: 'CV', text: 'secret' });
    await a.addJob({ url: 'https://x.test/1', title: 'Dev', company: 'A' });
    await syncWithDrive(a, drive, opts);
    expect(data()?.records).toHaveLength(1);
    expect(data()?.resumes).toBeUndefined();
  });

  it('syncs resumes and their deletions when it is on', async () => {
    const { drive, data } = fakeDrive();
    const a = device();
    const b = device();
    await a.updateSettings({ resumes: { sync: true } });
    const cv = await a.addResume({ name: 'CV', text: 'Go' });
    await syncWithDrive(a, drive, opts);
    expect(data()?.resumes).toHaveLength(1);

    await syncWithDrive(b, drive, opts); // b gets the settings and the resume
    expect((await b.getResumes()).map((r) => r.name)).toEqual(['CV']);

    await b.deleteResume(cv.id);
    await syncWithDrive(b, drive, opts);
    expect(data()?.resumes).toEqual([{ id: cv.id, deletedAt: expect.any(Number) }]);
    expect(await a.getResumes()).toHaveLength(1);
    await syncWithDrive(a, drive, opts);
    expect(await a.getResumes()).toEqual([]);
    expect(data()?.resumes).toEqual([{ id: cv.id, deletedAt: expect.any(Number) }]);
  });

  it('removes resumes from Drive when resume sync is turned off', async () => {
    const { drive, data } = fakeDrive();
    const a = device();
    await a.updateSettings({ resumes: { sync: true } });
    await a.addResume({ name: 'CV' });
    await syncWithDrive(a, drive, opts);
    expect(data()?.resumes).toHaveLength(1);
    await a.updateSettings({ resumes: { sync: false } });
    await syncWithDrive(a, drive, opts);
    expect(data()?.resumes).toBeUndefined();
    // The local copy stays.
    expect(await a.getResumes()).toHaveLength(1);
  });
});
