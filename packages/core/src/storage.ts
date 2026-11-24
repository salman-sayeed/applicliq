import { Dexie, type Table, liveQuery } from 'dexie';
import { type FeatureId, isFeatureEnabled } from './features';
import type { ImportDraft } from './import/review';
import { mergeJobs } from './merge';
import { mergeDuplicateJobs, pairKey } from './smart/duplicates';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsPatch,
  type SettingsSection,
  type SyncedSettings,
  applySettingsPatch,
  combineSettings,
  isNewerSettings,
  mergeSyncedSettings,
  sameSyncedValues,
  sanitizeSyncedSettings,
  splitSettings,
} from './settings';
import { SCHEMA_VERSION, type SyncSnapshot } from './sync/drive';
import {
  type Job,
  type JobRecord,
  type JobStatus,
  type StatusChange,
  TOMBSTONE_TTL_MS,
  isLiveJob,
} from './types';
import { normalizeUrl } from './url';
import { sanitizeRecords } from './validate';

/** Settings rows: the synced part (also where pre-settings-page versions kept everything)… */
const SYNCED_ID = 'app';
/** …the keys that never leave this device… */
const DEVICE_ID = 'device';
/** …and app state that isn't a setting. */
const LOCAL_STATE_ID = 'state';

type SettingsRow = { id: string } & Record<string, unknown>;

/** Per-device app state kept next to the settings. */
export type LocalState = {
  /** The first-run introduction was shown (or skipped). */
  onboardingDone?: boolean;
  /**
   * Features turned off at start-up because the browser no longer grants their permissions;
   * Settings → Features says so until dismissed.
   */
  featuresTurnedOff?: FeatureId[];
};

// Kept from the Career Pocket days: renaming it would hide every existing user's saved jobs.
export const DB_NAME = 'career-pocket';
/** The database's name before the app was renamed; its data moves over on first open. */
export const LEGACY_DB_NAME = 'pocket-career';

export class AppliCliqDB extends Dexie {
  jobs!: Table<JobRecord, string>;
  settings!: Table<SettingsRow, string>;

  /** `legacyName`: a database to take the data from once (the default DB adopts the old one). */
  constructor(
    name = DB_NAME,
    { legacyName = name === DB_NAME ? LEGACY_DB_NAME : undefined }: { legacyName?: string } = {},
  ) {
    super(name);
    // Only indexed fields are listed; every other field is still stored. Tombstones have no
    // `url`/`company`/`status`/`updatedAt`, so they never appear in those indexes.
    this.version(2).stores({
      jobs: 'id, url, company, status, updatedAt, deletedAt',
      settings: 'id',
    });
    // 3: other URLs of merged duplicates are indexed too, so `getJobByUrl` finds them.
    this.version(3).stores({
      jobs: 'id, url, *alternateUrls, company, status, updatedAt, deletedAt',
      settings: 'id',
    });
    // Runs before the first query; queries wait for it.
    if (legacyName) this.on('ready', () => adoptLegacyDatabase(this, legacyName));
  }
}

/**
 * Copies jobs and settings from the database the app used before its rename, if there is one
 * and this one is still empty, then deletes it. Never throws: at worst the old data stays where
 * it was and the app starts empty.
 */
async function adoptLegacyDatabase(db: AppliCliqDB, legacyName: string): Promise<void> {
  try {
    if (!(await Dexie.exists(legacyName))) return;
    const legacy = new Dexie(legacyName);
    let jobs: JobRecord[] = [];
    let settings: SettingsRow[] = [];
    try {
      await legacy.open();
      const tables = legacy.tables.map((t) => t.name);
      if (tables.includes('jobs')) jobs = await legacy.table('jobs').toArray();
      if (tables.includes('settings')) settings = await legacy.table('settings').toArray();
    } finally {
      legacy.close();
    }
    // In a transaction, so two pages opening at once don't both copy.
    await db.transaction('rw', db.jobs, db.settings, async () => {
      if ((await db.jobs.count()) > 0 || (await db.settings.count()) > 0) return;
      await db.jobs.bulkPut(jobs);
      await db.settings.bulkPut(settings);
    });
    // Not awaited: another open page may hold the old database open for a moment.
    void Dexie.delete(legacyName).catch(() => {});
  } catch (error) {
    console.warn('AppliCliq: could not move data from the old database', error);
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
  /** The file's settings were newer than the local ones and replaced them. */
  settingsApplied: boolean;
};

/** Fields a patch may never overwrite, even if a caller passes them at runtime. */
const PROTECTED_FIELDS = ['id', 'history', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export function createJobRepository(db: AppliCliqDB, now: () => number = Date.now) {
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

  /** All live jobs (tombstones hidden), most recently updated first. */
  async function getJobs(): Promise<Job[]> {
    const all = await db.jobs.orderBy('updatedAt').reverse().toArray();
    return all.filter(isLiveJob);
  }

  async function readSettingsRows() {
    const [synced, device] = await db.settings.bulkGet([SYNCED_ID, DEVICE_ID]);
    return { synced, device };
  }

  /** Synced part plus device part, validated; defaults for anything missing. */
  async function getSettings(): Promise<Settings> {
    const { synced, device } = await readSettingsRows();
    return combineSettings(synced, device);
  }

  async function writeSettings(settings: Settings): Promise<void> {
    const { synced, device } = splitSettings(settings);
    await db.settings.bulkPut([
      { ...synced, id: SYNCED_ID },
      { ...device, id: DEVICE_ID },
    ]);
  }

  /**
   * Applies a patch (invalid values are ignored, see `sanitizeSettings`). `updatedAt` moves
   * forward only when a synced key changed, so device-only changes never win a merge elsewhere.
   */
  async function updateSettings(patch: SettingsPatch): Promise<Settings> {
    return db.transaction('rw', db.settings, async () => {
      const current = await getSettings();
      const next = applySettingsPatch(current, patch);
      const before = splitSettings(current).synced;
      if (!sameSyncedValues(before, splitSettings(next).synced)) {
        next.updatedAt = Math.max(now(), current.updatedAt + 1);
      }
      await writeSettings(next);
      return next;
    });
  }

  /** Normalizes a URL for storage, unless the user turned URL cleaning off. */
  async function storedUrl(url: string): Promise<string> {
    const { automation } = await getSettings();
    return automation.cleanUrls ? normalizeUrl(url) : url.trim();
  }

  return {
    getJobs,

    /**
     * Calls `listener` with the live jobs now and after every change, including changes made
     * in other pages of the same origin (e.g. the extension popup). Returns an unsubscribe.
     */
    watchJobs(listener: (jobs: Job[]) => void, onError?: (error: unknown) => void): () => void {
      const subscription = liveQuery(getJobs).subscribe({
        next: listener,
        error: (error: unknown) => onError?.(error),
      });
      return () => subscription.unsubscribe();
    },

    /** A live job by id; tombstones are treated as missing. */
    async getJob(id: string): Promise<Job | undefined> {
      const record = await db.jobs.get(id);
      return record && isLiveJob(record) ? record : undefined;
    },

    /**
     * Finds a saved job by URL, ignoring tracking parameters, the hash and param order. Jobs saved
     * with URL cleaning off keep their URL as given; those need a scan, done only then.
     */
    async getJobByUrl(url: string): Promise<Job | undefined> {
      const normalized = normalizeUrl(url);
      const newest = (jobs: JobRecord[]) =>
        jobs.filter(isLiveJob).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const keys = [...new Set([normalized, url.trim()])];
      const found = newest(await db.jobs.where('url').anyOf(keys).toArray());
      if (found) return found;
      // Another posting of a merged job (its `alternateUrls`).
      const alternate = newest(await db.jobs.where('alternateUrls').anyOf(keys).toArray());
      if (alternate || (await getSettings()).automation.cleanUrls) return alternate;
      return newest(
        await db.jobs
          .filter(
            (r) =>
              isLiveJob(r) &&
              [r.url, ...(r.alternateUrls ?? [])].some((u) => normalizeUrl(u) === normalized),
          )
          .toArray(),
      );
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
        url: await storedUrl(input.url),
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
      return db.transaction('rw', db.jobs, db.settings, async () => {
        const current = await db.jobs.get(id);
        if (!current || !isLiveJob(current)) throw new Error(`Job not found: ${id}`);
        const changes: JobPatch = { ...patch };
        for (const key of PROTECTED_FIELDS) delete (changes as Record<string, unknown>)[key];
        if (changes.url !== undefined) changes.url = await storedUrl(changes.url);
        if (changes.alternateUrls !== undefined) {
          const urls = await Promise.all(changes.alternateUrls.map(storedUrl));
          const unique = [...new Set(urls)].filter((u) => u && u !== (changes.url ?? current.url));
          changes.alternateUrls = unique.length ? unique : undefined;
        }
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

    /**
     * Undoes `deleteJob`: brings the job back from its tombstone, dated after the deletion so
     * the restore also wins when synced. Does nothing if the job is live already.
     */
    async restoreJob(job: Job): Promise<Job> {
      return db.transaction('rw', db.jobs, async () => {
        const current = await db.jobs.get(job.id);
        if (current && isLiveJob(current)) return current;
        const after = current ? current.deletedAt + 1 : 0;
        const restored: Job = { ...job, updatedAt: Math.max(now(), after, job.updatedAt + 1) };
        delete restored.deletedAt;
        await db.jobs.put(restored);
        return restored;
      });
    },

    /**
     * Merges two saved jobs that are the same posting: `otherId` is folded into `keepId` (see
     * `mergeDuplicateJobs`) and then deleted as a tombstone, in one transaction.
     */
    async mergeDuplicates(keepId: string, otherId: string): Promise<Job> {
      if (keepId === otherId) throw new Error('Pick two different jobs to merge.');
      return db.transaction('rw', db.jobs, async () => {
        const [keep, other] = await db.jobs.bulkGet([keepId, otherId]);
        if (!keep || !isLiveJob(keep) || !other || !isLiveJob(other)) {
          throw new Error('One of the jobs no longer exists.');
        }
        const at = Math.max(now(), keep.updatedAt + 1, other.updatedAt);
        const merged: Job = { ...mergeDuplicateJobs(keep, other), updatedAt: at };
        await db.jobs.put(merged);
        await db.jobs.put({ id: otherId, deletedAt: at });
        return merged;
      });
    },

    /** Remembers that two jobs aren't duplicates, so they are never suggested again. */
    async markNotDuplicate(a: string, b: string): Promise<void> {
      await db.transaction('rw', db.settings, async () => {
        const { helpers } = await getSettings();
        const key = pairKey(a, b);
        if (helpers.notDuplicatePairs.includes(key)) return;
        await updateSettings({
          helpers: { notDuplicatePairs: [...helpers.notDuplicatePairs, key] },
        });
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
        schemaVersion: SCHEMA_VERSION,
        updatedAt: now(),
        records: await getAllRecords(),
        settings: await getSyncedSettings(),
      };
      return JSON.stringify(snapshot, null, 2);
    },

    /**
     * Merges a file produced by `exportJSON` (or the Drive file) into the local store with
     * `mergeJobs`: newer versions win, nothing local is lost. Malformed records are skipped;
     * a file that is not a AppliCliq export throws.
     */
    async importJSON(json: string): Promise<ImportResult> {
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        throw new Error('Import failed: the file is not valid JSON.');
      }
      // Exports from before `schemaVersion` used `version: 1`, the same format.
      const snapshot = data as (Partial<SyncSnapshot> & { version?: unknown }) | null;
      const schema = snapshot?.schemaVersion ?? snapshot?.version;
      if (!snapshot || !Array.isArray(snapshot.records) || typeof schema !== 'number') {
        throw new Error('Import failed: not a AppliCliq export.');
      }
      if (schema > SCHEMA_VERSION) {
        throw new Error('Import failed: this file is from a newer version of AppliCliq.');
      }
      const { records, skipped } = sanitizeRecords(snapshot.records);
      await mergeIntoLocal(records);
      let settingsApplied = false;
      if (snapshot.settings !== undefined) {
        settingsApplied = (await mergeSettingsIntoLocal(snapshot.settings)).changed;
      }
      return { imported: records.length, skipped, settingsApplied };
    },

    /**
     * Adds imported jobs in one transaction, all tagged with a new `importBatchId` and
     * `importedAt`. The date applied becomes `createdAt` and the `applied` history entry; a later
     * status (interview, rejected...) is recorded at the import, since the file doesn't say when
     * it changed. Returns the batch id, for undo.
     */
    async importJobs(drafts: readonly ImportDraft[]): Promise<{ batchId: string; count: number }> {
      const at = now();
      const batchId = `${at.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      const { automation } = await getSettings();
      const jobs = drafts.map((draft): Job => {
        const { appliedAt, ...fields } = draft;
        const created = appliedAt !== undefined && appliedAt <= at ? appliedAt : at;
        const history: StatusChange[] =
          fields.status === 'saved' || appliedAt === undefined
            ? [{ status: fields.status, at: created }]
            : [{ status: 'applied', at: created }];
        if (history[0]!.status !== fields.status) history.push({ status: fields.status, at });
        return {
          ...fields,
          url: automation.cleanUrls ? normalizeUrl(fields.url) : fields.url.trim(),
          company: fields.company.trim(),
          id: crypto.randomUUID(),
          history,
          createdAt: created,
          updatedAt: at,
          importedAt: at,
          importBatchId: batchId,
        };
      });
      await db.jobs.bulkAdd(jobs);
      return { batchId, count: jobs.length };
    },

    /**
     * Undoes an import: deletes the batch's jobs that are still here, as tombstones, so the
     * deletion syncs like any other. Returns how many were deleted.
     */
    async undoImport(batchId: string): Promise<number> {
      return db.transaction('rw', db.jobs, async () => {
        const batch = (await db.jobs.toArray()).filter(
          (r): r is Job => isLiveJob(r) && r.importBatchId === batchId,
        );
        const at = now();
        await db.jobs.bulkPut(
          batch.map((job) => ({ id: job.id, deletedAt: Math.max(at, job.updatedAt) })),
        );
        return batch.length;
      });
    },

    getSettings,
    updateSettings,

    /** Whether a feature is on (Settings → Features). */
    async isFeatureEnabled(id: FeatureId): Promise<boolean> {
      return isFeatureEnabled(await getSettings(), id);
    },

    /** Calls `listener` with the settings now and after every change; returns an unsubscribe. */
    watchSettings(listener: (settings: Settings) => void, onError?: (e: unknown) => void) {
      const subscription = liveQuery(getSettings).subscribe({
        next: listener,
        error: (error: unknown) => onError?.(error),
      });
      return () => subscription.unsubscribe();
    },

    /** Puts one section back to its defaults (device keys included). */
    resetSettingsSection(section: SettingsSection): Promise<Settings> {
      return updateSettings({ [section]: structuredClone(DEFAULT_SETTINGS[section]) });
    },

    /** The part of the settings that syncs through Drive. */
    getSyncedSettings,

    /** Merges settings from elsewhere (Drive, an import): last write wins on `updatedAt`. */
    mergeSettingsIntoLocal,

    /**
     * Renames a tag on every job that has it (case-insensitive) and in the tag list; merges into
     * an existing tag of the new name. Returns how many jobs changed.
     */
    async renameTag(from: string, to: string): Promise<number> {
      const name = to.trim();
      const old = from.toLowerCase();
      if (!name) throw new Error('A tag needs a name.');
      return db.transaction('rw', db.jobs, db.settings, async () => {
        let changed = 0;
        const at = now();
        const jobs = (await db.jobs.toArray()).filter(isLiveJob);
        for (const job of jobs) {
          if (!job.tags?.some((t) => t.toLowerCase() === old)) continue;
          const renamed = job.tags.map((t) => (t.toLowerCase() === old ? name : t));
          const tags = renamed.filter(
            (t, i) => renamed.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i,
          );
          await db.jobs.put({ ...job, tags, updatedAt: Math.max(at, job.updatedAt + 1) });
          changed++;
        }
        const { labels } = await getSettings();
        const existing = labels.tags.find((t) => t.name.toLowerCase() === old);
        const others = labels.tags.filter((t) => t.name.toLowerCase() !== old);
        const target = others.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (existing && !target) others.push({ ...existing, name });
        await updateSettings({ labels: { tags: others } });
        return changed;
      });
    },

    getLocalState,

    async setLocalState(patch: LocalState): Promise<void> {
      await db.transaction('rw', db.settings, async () => {
        await db.settings.put({ ...(await getLocalState()), ...patch, id: LOCAL_STATE_ID });
      });
    },

    /** Empties this device's copy: jobs, settings and app state. Drive is not touched. */
    async clearLocalData(): Promise<void> {
      await db.transaction('rw', db.jobs, db.settings, async () => {
        await db.jobs.clear();
        await db.settings.clear();
      });
    },
  };

  async function getLocalState(): Promise<LocalState> {
    const row = await db.settings.get(LOCAL_STATE_ID);
    const turnedOff = Array.isArray(row?.featuresTurnedOff)
      ? (row.featuresTurnedOff as unknown[]).filter((id): id is FeatureId => typeof id === 'string')
      : [];
    return {
      onboardingDone: row?.onboardingDone === true,
      ...(turnedOff.length ? { featuresTurnedOff: turnedOff } : {}),
    };
  }

  async function getSyncedSettings(): Promise<SyncedSettings> {
    return splitSettings(await getSettings()).synced;
  }

  /**
   * Merges a synced settings object from Drive or a file into the local one. Returns the winner
   * and whether the local settings changed. Settings from a newer app version are ignored.
   */
  async function mergeSettingsIntoLocal(
    incoming: unknown,
  ): Promise<{ settings: SyncedSettings; changed: boolean }> {
    return db.transaction('rw', db.settings, async () => {
      const local = await getSyncedSettings();
      if (incoming === undefined || isNewerSettings(incoming)) {
        return { settings: local, changed: false };
      }
      const winner = mergeSyncedSettings(local, sanitizeSyncedSettings(incoming));
      if (winner === local) return { settings: local, changed: false };
      const { device } = await readSettingsRows();
      await writeSettings(combineSettings(winner, device));
      return { settings: winner, changed: !sameSyncedValues(winner, local) };
    });
  }
}

export type JobRepository = ReturnType<typeof createJobRepository>;
