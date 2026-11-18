import type { JobRecord } from '../types';

/**
 * Minimal Google Drive v3 client for the hidden appDataFolder, over plain `fetch`.
 * Data is only ever sent to Google Drive, authenticated as the user, with the
 * `drive.appdata` scope: the app cannot see any other file in the user's Drive.
 *
 * Token acquisition is platform-specific (chrome.identity / launchWebAuthFlow in the
 * extension, Google Identity Services on the web), so callers inject `getToken`.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const SYNC_FILE_NAME = 'pocket-career.json';

/** Format of the Drive file and of exports. Bump on incompatible changes. */
export const SCHEMA_VERSION = 1;

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type SyncSnapshot = {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: number;
  records: JobRecord[];
};

export type DriveClientOptions = {
  /** An access token with the `drive.appdata` scope. Must not prompt the user. */
  getToken: () => Promise<string>;
  /** Called when Drive rejects a token (401), before one retry with a fresh token. */
  onUnauthorized?: (token: string) => Promise<void>;
  fileName?: string;
  fetch?: typeof fetch;
};

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
    /** Ids of the sync files, oldest first (two devices may each have created one). */
    async list(): Promise<string[]> {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: `name = '${fileName}' and trashed = false`,
        fields: 'files(id)',
        orderBy: 'createdTime',
        pageSize: '10',
      });
      const res = await request(`${API}/files?${params}`);
      const body = (await res.json()) as { files?: { id: string }[] };
      return (body.files ?? []).map((f) => f.id);
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
    async update(id: string, snapshot: SyncSnapshot, etag?: string): Promise<void> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (etag) headers['If-Match'] = etag;
      await request(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(snapshot),
      });
    },

    /** Creates the file in appDataFolder; returns its id. */
    async create(snapshot: SyncSnapshot): Promise<string> {
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

    async remove(id: string): Promise<void> {
      await request(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
