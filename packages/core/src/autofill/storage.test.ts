import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppliCliqDB, createJobRepository } from '../storage';
import { DEFAULT_SETTINGS, splitSettings } from '../settings';
import type { DriveClient, SyncSnapshot } from '../sync/drive';
import { syncWithDrive } from '../sync/sync';
import { EMPTY_PROFILE, sanitizeAutofillRecords, sanitizeProfile } from './profile';
import { TEST_PROFILE } from './test-profile';

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

describe('profile records', () => {
  it('cleans untrusted profiles and drops unknown keys', () => {
    const profile = sanitizeProfile({
      firstName: '  Ada ',
      phoneCountryCode: '+44',
      earliestStartDate: 'soon',
      needsSponsorship: 'maybe',
      salaryCurrency: 'gbp',
      otherLinks: [{ label: 'Blog', url: 'https://blog.test' }, { label: 'Empty' }, 'nope'],
      workAuthorization: [{ country: 'UK', authorized: true }, { authorized: true }],
      gender: 'never stored',
    });
    expect(profile).toMatchObject({
      firstName: 'Ada',
      phoneCountryCode: '44',
      earliestStartDate: '',
      needsSponsorship: '',
      salaryCurrency: 'GBP',
      otherLinks: [{ label: 'Blog', url: 'https://blog.test' }],
      workAuthorization: [{ country: 'UK', authorized: true }],
    });
    expect(profile).not.toHaveProperty('gender');
  });

  it('keeps valid records and tombstones from Drive, drops the rest', () => {
    expect(
      sanitizeAutofillRecords([
        { id: 'profile', profile: { email: 'a@b.test' }, updatedAt: 5 },
        {
          id: 'x',
          kind: 'answer',
          question: 'Why us?',
          answer: 'Because',
          createdAt: 1,
          updatedAt: 2,
        },
        { id: 'y', deletedAt: 9, question: 'gone' },
        {
          id: 'z',
          kind: 'answer',
          question: '',
          answer: 'no question',
          createdAt: 1,
          updatedAt: 1,
        },
        { id: 'w', kind: 'other', updatedAt: 1 },
      ]),
    ).toEqual([
      { id: 'profile', profile: { ...EMPTY_PROFILE, email: 'a@b.test' }, updatedAt: 5 },
      {
        id: 'x',
        kind: 'answer',
        question: 'Why us?',
        answer: 'Because',
        createdAt: 1,
        updatedAt: 2,
      },
      { id: 'y', deletedAt: 9 },
    ]);
  });
});

describe('repository', () => {
  it('saves and reads the profile', async () => {
    expect(await repo().getAutofillProfile()).toEqual(EMPTY_PROFILE);
    await repo().saveAutofillProfile(TEST_PROFILE);
    expect(await repo().getAutofillProfile()).toEqual(TEST_PROFILE);
  });

  it('adds, edits and deletes saved answers (deletions leave a tombstone)', async () => {
    const answer = await repo().addSavedAnswer({
      question: ' Tell us about yourself ',
      answer: 'Hi',
    });
    expect(answer.question).toBe('Tell us about yourself');
    clock = 2_000;
    await repo().updateSavedAnswer(answer.id, { answer: 'Hello' });
    expect((await repo().getSavedAnswers())[0]).toMatchObject({
      answer: 'Hello',
      updatedAt: 2_000,
    });
    clock = 3_000;
    expect(await repo().deleteSavedAnswer(answer.id)).toBe(true);
    expect(await repo().getSavedAnswers()).toEqual([]);
    expect(await repo().getAllAutofillRecords()).toEqual([{ id: answer.id, deletedAt: 3_000 }]);
  });

  it('keeps the profile in backups and empties it with the local data', async () => {
    await repo().saveAutofillProfile(TEST_PROFILE);
    const json = await repo().exportJSON();
    expect(JSON.parse(json).autofill).toHaveLength(1);
    await repo().clearLocalData();
    expect(await repo().getAutofillProfile()).toEqual(EMPTY_PROFILE);
    await repo().importJSON(json);
    expect(await repo().getAutofillProfile()).toEqual(TEST_PROFILE);
  });
});

describe('sync', () => {
  function memoryDrive() {
    const files = new Map<string, unknown>();
    const drive: DriveClient = {
      fileName: 'career-pocket.json',
      list: async () => [...files.keys()].map((id) => ({ id, name: 'career-pocket.json' })),
      rename: async () => {},
      download: async (id) => ({ data: structuredClone(files.get(id)), etag: '"1"' }),
      update: async (id, snapshot) => void files.set(id, structuredClone(snapshot)),
      create: async (snapshot) => {
        files.set('f', structuredClone(snapshot));
        return 'f';
      },
      remove: async (id) => void files.delete(id),
      accountEmail: async () => 'me@example.test',
    };
    return { drive, file: () => files.get('f') as SyncSnapshot | undefined };
  }

  it('leaves the profile out of Drive unless "Sync autofill profile" is on', async () => {
    const { drive, file } = memoryDrive();
    await repo().saveAutofillProfile(TEST_PROFILE);
    await repo().addJob({ url: 'https://jobs.test/1', title: 'Dev', company: 'Acme' });
    await syncWithDrive(repo(), drive, { now: () => clock });
    expect(file()?.autofill).toBeUndefined();

    clock = 5_000;
    await repo().updateSettings({ autofill: { syncProfile: true } });
    await syncWithDrive(repo(), drive, { now: () => clock });
    expect(file()?.autofill).toEqual([{ id: 'profile', profile: TEST_PROFILE, updatedAt: 1_000 }]);
  });

  it('brings the profile down to a device that syncs it', async () => {
    const { drive } = memoryDrive();
    const settings = splitSettings({
      ...DEFAULT_SETTINGS,
      updatedAt: 1,
      autofill: { ...DEFAULT_SETTINGS.autofill, syncProfile: true },
    }).synced;
    await drive.create({
      schemaVersion: 2,
      updatedAt: 1,
      records: [],
      settings,
      autofill: [{ id: 'profile', profile: TEST_PROFILE, updatedAt: 1 }],
    });
    await syncWithDrive(repo(), drive, { now: () => clock });
    expect(await repo().getAutofillProfile()).toEqual(TEST_PROFILE);
  });
});
