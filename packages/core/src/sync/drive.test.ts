import { describe, expect, it } from 'vitest';
import { DriveError, createDriveClient } from './drive';

type Call = { url: string; method: string; headers: Headers };

function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: new Headers(init.headers) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

describe('createDriveClient', () => {
  it('lists the sync file in appDataFolder, oldest first, with the bearer token', async () => {
    const { fetch, calls } = fakeFetch([
      json({
        files: [
          { id: 'a', name: 'pocket-career.json' },
          { id: 'b', name: 'career-pocket.json' },
        ],
      }),
    ]);
    const drive = createDriveClient({ getToken: async () => 'tok', fetch });
    expect(await drive.list()).toEqual([
      { id: 'a', name: 'pocket-career.json' },
      { id: 'b', name: 'career-pocket.json' },
    ]);
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get('spaces')).toBe('appDataFolder');
    expect(url.searchParams.get('orderBy')).toBe('createdTime');
    expect(url.searchParams.get('q')).toBe(
      "(name = 'career-pocket.json' or name = 'pocket-career.json') and trashed = false",
    );
    expect(calls[0]!.headers.get('Authorization')).toBe('Bearer tok');
  });

  it('renames a legacy file to the current name', async () => {
    const { fetch, calls } = fakeFetch([json({})]);
    const drive = createDriveClient({ getToken: async () => 'tok', fetch });
    await drive.rename('a');
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toMatch(/\/files\/a$/);
  });

  it('returns the ETag with the download and sends it as If-Match on update', async () => {
    const { fetch, calls } = fakeFetch([
      json({ schemaVersion: 1, records: [] }, { headers: { ETag: '"v7"' } }),
      json({}),
    ]);
    const drive = createDriveClient({ getToken: async () => 'tok', fetch });
    const file = await drive.download('a');
    expect(file).toEqual({ data: { schemaVersion: 1, records: [] }, etag: '"v7"' });
    await drive.update('a', { schemaVersion: 1, updatedAt: 1, records: [] }, file.etag);
    expect(calls[1]!.method).toBe('PATCH');
    expect(calls[1]!.headers.get('If-Match')).toBe('"v7"');
  });

  it('surfaces 412 as a DriveError', async () => {
    const { fetch } = fakeFetch([new Response('', { status: 412 })]);
    const drive = createDriveClient({ getToken: async () => 'tok', fetch });
    const error = await drive
      .update('a', { schemaVersion: 1, updatedAt: 1, records: [] }, '"old"')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect((error as DriveError).status).toBe(412);
  });

  it('drops a rejected token and retries once with a fresh one', async () => {
    const tokens = ['stale', 'fresh'];
    const dropped: string[] = [];
    const { fetch, calls } = fakeFetch([new Response('', { status: 401 }), json({ files: [] })]);
    const drive = createDriveClient({
      getToken: async () => tokens[0]!,
      onUnauthorized: async (t) => {
        dropped.push(t);
        tokens.shift();
      },
      fetch,
    });
    expect(await drive.list()).toEqual([]);
    expect(dropped).toEqual(['stale']);
    expect(calls[1]!.headers.get('Authorization')).toBe('Bearer fresh');
  });

  it('gives undefined data for a file that is not JSON', async () => {
    const { fetch } = fakeFetch([new Response('not json')]);
    const drive = createDriveClient({ getToken: async () => 'tok', fetch });
    expect((await drive.download('a')).data).toBeUndefined();
  });
});
