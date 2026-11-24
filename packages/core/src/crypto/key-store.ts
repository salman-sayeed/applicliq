import { exportRawKey, importRawKey, toStorableKey } from './envelope';

/**
 * Where this device keeps the unlocked data key.
 *
 * - "Remember on this device" (default): a non-extractable `CryptoKey` in IndexedDB. Scripts can
 *   use it to encrypt and decrypt but can never read its bytes, and background sync works
 *   without asking again.
 * - Not remembered: the key lives only in memory (`session`) and is asked for again in the next
 *   browser session. The extension passes `storage.session` (in memory, cleared when the browser
 *   closes); the website keeps it in the page, so a reload asks again.
 *
 * The passphrase and recovery code are never stored anywhere.
 */

/** In-memory storage for the key's bytes while it isn't remembered. */
export type SessionKeyStorage = {
  get(): Promise<string | undefined>;
  set(raw: string): Promise<void>;
  remove(): Promise<void>;
};

export type KeyStore = {
  /** The key, if this device is unlocked. */
  load(): Promise<CryptoKey | undefined>;
  /** Keeps an (extractable) key just unwrapped. Remembered: only a non-extractable copy. */
  save(dek: CryptoKey, remember: boolean): Promise<void>;
  /** Whether the key is kept across browser sessions. */
  isRemembered(): Promise<boolean>;
  /**
   * Moves a key kept in memory into IndexedDB. Turning it off can't move a remembered key back
   * (its bytes can't be read), so it forgets it: returns whether the device is still unlocked.
   */
  setRemembered(remember: boolean): Promise<boolean>;
  /** Forgets the key ("Lock now", sign-out). */
  clear(): Promise<void>;
};

// New name (no Career Pocket data ever lived here).
export const KEY_DB_NAME = 'applicliq-keys';
const STORE = 'keys';
const DEK_ID = 'dek';

/** Plain memory: the website's "not remembered" storage. */
export function memorySessionStorage(): SessionKeyStorage {
  let value: string | undefined;
  return {
    get: async () => value,
    set: async (raw) => void (value = raw),
    remove: async () => void (value = undefined),
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createKeyStore({
  dbName = KEY_DB_NAME,
  session = memorySessionStorage(),
}: { dbName?: string; session?: SessionKeyStorage } = {}): KeyStore {
  let opening: Promise<IDBDatabase> | undefined;

  function open(): Promise<IDBDatabase> {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        // Another context deleting the database must not be blocked by this connection.
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
      req.onerror = () => {
        opening = undefined;
        reject(req.error);
      };
    });
    return opening;
  }

  async function run<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>) {
    const db = await open();
    return request(task(db.transaction(STORE, mode).objectStore(STORE)));
  }

  const readStored = async () => {
    const value = await run('readonly', (s) => s.get(DEK_ID));
    return value instanceof CryptoKey ? value : undefined;
  };
  const deleteStored = () => run('readwrite', (s) => s.delete(DEK_ID)).then(() => {});

  return {
    async load() {
      const stored = await readStored();
      if (stored) return stored;
      const raw = await session.get();
      return raw ? importRawKey(raw) : undefined;
    },

    async save(dek, remember) {
      if (remember) {
        const key = await toStorableKey(dek);
        await run('readwrite', (s) => s.put(key, DEK_ID));
        await session.remove();
      } else {
        await session.set(await exportRawKey(dek));
        await deleteStored();
      }
    },

    async isRemembered() {
      return (await readStored()) !== undefined;
    },

    async setRemembered(remember) {
      if (remember) {
        const raw = await session.get();
        const key = raw ? await importRawKey(raw) : undefined;
        if (!key) return (await readStored()) !== undefined;
        await run('readwrite', (s) => s.put(key, DEK_ID));
        await session.remove();
        return true;
      }
      if (await readStored()) {
        await deleteStored();
        return (await session.get()) !== undefined;
      }
      return (await session.get()) !== undefined;
    },

    async clear() {
      await Promise.all([deleteStored(), session.remove()]);
    },
  };
}
