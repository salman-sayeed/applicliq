import type { JobRecord } from '../types';

/**
 * Minimal Google Drive client for the hidden appDataFolder.
 * Data is only ever sent to Google Drive, authenticated as the user, with the
 * `drive.appdata` scope: the app cannot see any other file in the user's Drive.
 *
 * Token acquisition is platform-specific (chrome.identity in the extension,
 * Google Identity Services on the web), so callers inject `getToken`.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const SYNC_FILE_NAME = 'pocket-career.json';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type SyncSnapshot = {
  version: 1;
  updatedAt: number;
  records: JobRecord[];
};

export type DriveClientOptions = {
  getToken: () => Promise<string>;
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

export function createDriveClient({
  getToken,
  fileName = SYNC_FILE_NAME,
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: DriveClientOptions) {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const res = await fetchImpl(url, { ...init, headers });
    if (!res.ok) throw new DriveError(`Drive request failed (${res.status})`, res.status);
    return res;
  }

  async function findFileId(): Promise<string | undefined> {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name = '${fileName}' and trashed = false`,
      fields: 'files(id)',
      pageSize: '1',
    });
    const res = await request(`${API}/files?${params}`);
    const body = (await res.json()) as { files?: { id: string }[] };
    return body.files?.[0]?.id;
  }

  return {
    /** Downloads the snapshot, or returns undefined if none exists yet. */
    async read(): Promise<SyncSnapshot | undefined> {
      const id = await findFileId();
      if (!id) return undefined;
      const res = await request(`${API}/files/${id}?alt=media`);
      return (await res.json()) as SyncSnapshot;
    },

    /** Creates or overwrites the snapshot file. */
    async write(snapshot: SyncSnapshot): Promise<void> {
      const json = JSON.stringify(snapshot);
      const id = await findFileId();
      if (id) {
        await request(`${UPLOAD}/files/${id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
        return;
      }
      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify({ name: fileName, parents: ['appDataFolder'] })], {
          type: 'application/json',
        }),
      );
      form.append('file', new Blob([json], { type: 'application/json' }));
      await request(`${UPLOAD}/files?uploadType=multipart`, { method: 'POST', body: form });
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
