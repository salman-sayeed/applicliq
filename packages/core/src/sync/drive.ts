import type { SyncedSettings } from '../settings';
import type { AutofillRecord } from '../autofill/profile';
import type { JobRecord, ResumeRecord } from '../types';

/**
 * Minimal Google Drive v3 client for the hidden appDataFolder, over plain `fetch`.
 * Data is only ever sent to Google Drive, authenticated as the user, with the
 * `drive.appdata` scope: the app cannot see any other file in the user's Drive.
 *
 * Token acquisition is platform-specific (chrome.identity / launchWebAuthFlow in the
 * extension, Google Identity Services on the web), so callers inject `getToken`.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
// Kept from the Career Pocket days: renaming it would split existing users' data from what is already in their Drive.
export const SYNC_FILE_NAME = 'career-pocket.json';
/** The file's name before the app was renamed; such a file is adopted and renamed on sync. */
export const LEGACY_SYNC_FILE_NAME = 'pocket-career.json';

/**
 * Format of the Drive file and of exports. Bump on incompatible changes.
 * 2: jobs may carry `alternateUrls` and `offer` (merged duplicates, offer details). Version 1
 * files are read as they are; versions older than this one can't overwrite a version 2 file.
 */
export const SCHEMA_VERSION = 2;
/** The oldest file format this version still reads. */
export const MIN_SCHEMA_VERSION = 1;

/**
 * Encrypted sync keeps its data in its own file, and replaces `career-pocket.json` with a small
 * marker. Older versions only ever look at `career-pocket.json` (and the legacy name): they find
 * the marker, whose `schemaVersion` is above anything they support, and stop with "update to
 * keep syncing" instead of reading or overwriting anything. If the encrypted data sat in a file
 * they don't look for, with `career-pocket.json` gone, they would see an empty Drive and upload
 * their jobs in plain text next to it.
 */
export const ENCRYPTED_SYNC_FILE_NAME = 'applicliq.enc.json';
/** Above every plain `schemaVersion` any released version supports (they stop on it). */
export const ENCRYPTED_MARKER_SCHEMA_VERSION = 3;

export type EncryptedMarker = {
  schemaVersion: typeof ENCRYPTED_MARKER_SCHEMA_VERSION;
  encrypted: true;
  updatedAt: number;
  /** Empty, so versions that check for `records` before the version reach the version check. */
  records: [];
};

export function encryptedMarker(now: number): EncryptedMarker {
  return {
    schemaVersion: ENCRYPTED_MARKER_SCHEMA_VERSION,
    encrypted: true,
    updatedAt: now,
    records: [],
  };
}

/** Whether a downloaded `career-pocket.json` is the encrypted-sync marker. */
export function isEncryptedMarker(data: unknown): boolean {
  const file = data as { encrypted?: unknown; schemaVersion?: unknown } | null;
  return (
    !!file &&
    typeof file === 'object' &&
    file.encrypted === true &&
    file.schemaVersion === ENCRYPTED_MARKER_SCHEMA_VERSION
  );
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type SyncSnapshot = {
  schemaVersion: number;
  updatedAt: number;
  records: JobRecord[];
  /**
   * Synced settings (device-only keys left out). Optional: files from older versions have none,
   * and older versions drop it when they upload; the next sync from a newer device adds it back.
   */
  settings?: SyncedSettings;
  /**
   * Resumes (Resume match), only when resume sync is on (`resumeSyncEnabled`); left out when
   * there are none. Older versions drop it when they upload, like `settings`; the next sync from
   * a device with resume sync on adds it back (its local copy still has every resume and
   * tombstone).
   */
  resumes?: ResumeRecord[];
  /**
   * Autofill's profile and saved answers, only when the user turned on "Sync autofill profile"
   * (`autofillSyncEnabled`). Same rules as `resumes`.
   */
  autofill?: AutofillRecord[];
};

export type DriveClientOptions = {
  /** An access token with the `drive.appdata` scope. Must not prompt the user. */
  getToken: () => Promise<string>;
  /** Called when Drive rejects a token (401), before one retry with a fresh token. */
  onUnauthorized?: (token: string) => Promise<void>;
  fileName?: string;
  /** Also listed, so data from before a rename is found; `rename` moves it to `fileName`. */
  legacyFileName?: string;
  fetch?: typeof fetch;
};

export type DriveFile = { id: string; name: string };

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

/** A downloaded file: its parsed JSON and the ETag to make the next upload conditional. */
export type DriveDownload = { data: unknown; etag?: string };

export function createDriveClient({
  getToken,
  onUnauthorized,
  fileName = SYNC_FILE_NAME,
  legacyFileName = fileName === SYNC_FILE_NAME ? LEGACY_SYNC_FILE_NAME : undefined,
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: DriveClientOptions) {
  async function request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const res = await fetchImpl(url, { ...init, headers });
    if (res.status === 401 && onUnauthorized && !retried) {
      await onUnauthorized(token);
      return request(url, init, true);
    }
    if (!res.ok) throw new DriveError(`Drive request failed (${res.status})`, res.status);
    return res;
  }

  return {
    /** The current file name; a file listed under another name is a legacy one. */
    fileName,

    /**
     * The sync files (and legacy-named ones), oldest first: two devices may each have created
     * one.
     */
    async list(): Promise<DriveFile[]> {
      const names = [fileName, legacyFileName].filter(Boolean).map((n) => `name = '${n}'`);
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: `(${names.join(' or ')}) and trashed = false`,
        fields: 'files(id,name)',
        orderBy: 'createdTime',
        pageSize: '10',
      });
      const res = await request(`${API}/files?${params}`);
      const body = (await res.json()) as { files?: DriveFile[] };
      return (body.files ?? []).map((f) => ({ id: f.id, name: f.name ?? fileName }));
    },

    /** Gives a file the current name (adopts a legacy-named file). */
    async rename(id: string): Promise<void> {
      await request(`${API}/files/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName }),
      });
    },

    async download(id: string): Promise<DriveDownload> {
      const res = await request(`${API}/files/${encodeURIComponent(id)}?alt=media`, {
        cache: 'no-store',
      });
      const etag = res.headers.get('ETag') ?? undefined;
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
      return { data, etag };
    },

    /**
     * Overwrites the file. With `etag`, only if it hasn't changed since it was downloaded:
     * otherwise Drive answers 412 (a `DriveError` with status 412).
     */
    async update(id: string, snapshot: object, etag?: string): Promise<void> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (etag) headers['If-Match'] = etag;
      await request(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(snapshot),
      });
    },

    /** Creates the file in appDataFolder; returns its id. */
    async create(snapshot: object): Promise<string> {
      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify({ name: fileName, parents: ['appDataFolder'] })], {
          type: 'application/json',
        }),
      );
      form.append('file', new Blob([JSON.stringify(snapshot)], { type: 'application/json' }));
      const res = await request(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        body: form,
      });
      return ((await res.json()) as { id: string }).id;
    },

    /** The signed-in account's email address, shown in settings. */
    async accountEmail(): Promise<string | undefined> {
      const res = await request(`${API}/about?fields=user(emailAddress)`);
      const body = (await res.json()) as { user?: { emailAddress?: string } };
      return body.user?.emailAddress;
    },

    async remove(id: string): Promise<void> {
      await request(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
