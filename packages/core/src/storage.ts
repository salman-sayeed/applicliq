import { Dexie, type Table } from 'dexie';
import { mergeJobs } from './merge';
import type { SyncSnapshot } from './sync/drive';
import {
  DEFAULT_SETTINGS,
  type Job,
  type JobRecord,
  type JobStatus,
  type Settings,
  TOMBSTONE_TTL_MS,
  isLiveJob,
} from './types';
import { normalizeUrl } from './url';
import { sanitizeRecords } from './validate';

const SETTINGS_ID = 'app';

type SettingsRow = Partial<Settings> & { id: typeof SETTINGS_ID };

export class PocketCareerDB extends Dexie {
  jobs!: Table<JobRecord, string>;
  settings!: Table<SettingsRow, string>;

  constructor(name = 'pocket-career') {
    super(name);
    // Only indexed fields are listed; every other field is still stored. Tombstones have no
    // `url`/`company`/`status`/`updatedAt`, so they never appear in those indexes.
    this.version(2).stores({
      jobs: 'id, url, company, status, updatedAt, deletedAt',
      settings: 'id',
    });
  }
}

export type NewJob = Omit<
  Job,
  'id' | 'status' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  status?: JobStatus;
};

export type JobPatch = Partial<
  Omit<Job, 'id' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'>
>;

export type ImportResult = {
  /** Valid records read from the file (jobs and tombstones). */
  imported: number;
  /** Records in the file that were malformed and ignored. */
  skipped: number;
};

/** Fields a patch may never overwrite, even if a caller passes them at runtime. */
const PROTECTED_FIELDS = ['id', 'history', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export function createJobRepository(db: PocketCareerDB, now: () => number = Date.now) {
  async function getAllRecords(): Promise<JobRecord[]> {
    return db.jobs.toArray();
  }

  /** Merges `incoming` into the local store in one transaction; returns the merged set. */
  async function mergeIntoLocal(incoming: JobRecord[]): Promise<JobRecord[]> {
    return db.transaction('rw', db.jobs, async () => {
      const merged = mergeJobs(await db.jobs.toArray(), incoming, now());
      await db.jobs.clear();
      await db.jobs.bulkPut(merged);
      return merged;
    });
  }

  async function getSettings(): Promise<Settings> {
    const row = await db.settings.get(SETTINGS_ID);
    return {
      goals: { ...DEFAULT_SETTINGS.goals, ...row?.goals },
      ghostedAfterDays: row?.ghostedAfterDays ?? DEFAULT_SETTINGS.ghostedAfterDays,
      theme: row?.theme ?? DEFAULT_SETTINGS.theme,
    };
  }

  return {
    /** All live jobs (tombstones hidden), most recently updated first. */
    async getJobs(): Promise<Job[]> {
      const all = await db.jobs.orderBy('updatedAt').reverse().toArray();
      return all.filter(isLiveJob);
    },

    /** A live job by id; tombstones are treated as missing. */
    async getJob(id: string): Promise<Job | undefined> {
      const record = await db.jobs.get(id);
      return record && isLiveJob(record) ? record : undefined;
    },

    /** Finds a saved job by URL, ignoring tracking parameters, the hash and param order. */
    async getJobByUrl(url: string): Promise<Job | undefined> {
      const matches = await db.jobs.where('url').equals(normalizeUrl(url)).toArray();
      return matches.filter(isLiveJob).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    },

    /** Other live jobs at the same company (case-insensitive), most recent first. */
    async findSameCompany(company: string, excludeId?: string): Promise<Job[]> {
      const name = company.trim();
      if (!name) return [];
      const matches = await db.jobs.where('company').equalsIgnoreCase(name).toArray();
      return matches
        .filter((r): r is Job => isLiveJob(r) && r.id !== excludeId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async addJob(input: NewJob): Promise<Job> {
      const at = now();
      const status = input.status ?? 'saved';
      const job: Job = {
        ...input,
        url: normalizeUrl(input.url),
        company: input.company.trim(),
        id: crypto.randomUUID(),
        status,
        history: [{ status, at }],
        createdAt: at,
        updatedAt: at,
      };
      await db.jobs.add(job);
      return job;
    },

    /**
     * Applies a patch and always bumps `updatedAt`. A status change appends to `history`.
     * Throws if the job does not exist or was deleted.
     */
    async updateJob(id: string, patch: JobPatch): Promise<Job> {
      return db.transaction('rw', db.jobs, async () => {
        const current = await db.jobs.get(id);
        if (!current || !isLiveJob(current)) throw new Error(`Job not found: ${id}`);
        const changes: JobPatch = { ...patch };
        for (const key of PROTECTED_FIELDS) delete (changes as Record<string, unknown>)[key];
        if (changes.url !== undefined) changes.url = normalizeUrl(changes.url);
        if (changes.company !== undefined) changes.company = changes.company.trim();

        // Never let the clock run backwards for this record, or a merge could drop the edit.
        const at = Math.max(now(), current.updatedAt + 1);
        const history =
          changes.status && changes.status !== current.status
            ? [...current.history, { status: changes.status, at }]
            : current.history;
        const next: Job = { ...current, ...changes, history, updatedAt: at };
        await db.jobs.put(next);
        return next;
      });
    },

    /**
     * Replaces a live job with a tombstone (`{ id, deletedAt }` only).
     * Returns false if there was no live job with that id.
     */
    async deleteJob(id: string): Promise<boolean> {
      return db.transaction('rw', db.jobs, async () => {
        const current = await db.jobs.get(id);
        if (!current || !isLiveJob(current)) return false;
        // A deletion must beat the version it deletes, even if the clock went backwards.
        const deletedAt = Math.max(now(), current.updatedAt);
        await db.jobs.put({ id, deletedAt });
        return true;
      });
    },

    /** Deletes tombstones at least `ttl` old (30 days by default). Returns how many. */
    async purgeOldTombstones(ttl: number = TOMBSTONE_TTL_MS): Promise<number> {
      return db.jobs
        .where('deletedAt')
        .belowOrEqual(now() - ttl)
        .delete();
    },

    /** Every record, tombstones included. Used by sync and export. */
    getAllRecords,

    /** Merges records from elsewhere (Drive, an import) into the local store. */
    mergeIntoLocal,

    /**
     * A backup of every record, tombstones included, in the same format as the Drive file,
     * so importing it on another device also propagates deletions.
     */
    async exportJSON(): Promise<string> {
      const snapshot: SyncSnapshot = {
        version: 1,
        updatedAt: now(),
        records: await getAllRecords(),
      };
      return JSON.stringify(snapshot, null, 2);
    },

    /**
     * Merges a file produced by `exportJSON` (or the Drive file) into the local store with
     * `mergeJobs`: newer versions win, nothing local is lost. Malformed records are skipped;
     * a file that is not a Pocket Career export throws.
     */
    async importJSON(json: string): Promise<ImportResult> {
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        throw new Error('Import failed: the file is not valid JSON.');
      }
      const snapshot = data as Partial<SyncSnapshot> | null;
      if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.records)) {
        throw new Error('Import failed: not a Pocket Career export (version 1).');
      }
      const { records, skipped } = sanitizeRecords(snapshot.records);
      await mergeIntoLocal(records);
      return { imported: records.length, skipped };
    },

    getSettings,

    async updateSettings(patch: Partial<Settings>): Promise<Settings> {
      return db.transaction('rw', db.settings, async () => {
        const current = await getSettings();
        const next: Settings = {
          ...current,
          ...patch,
          goals: { ...current.goals, ...patch.goals },
        };
        await db.settings.put({ id: SETTINGS_ID, ...next });
        return next;
      });
    },
  };
}

export type JobRepository = ReturnType<typeof createJobRepository>;
