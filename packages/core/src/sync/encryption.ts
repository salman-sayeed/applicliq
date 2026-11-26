import {
  type EncryptedFile,
  EncryptionError,
  type UnlockSecret,
  createEnvelope,
  headerOf,
  openFile,
  rewrapPassphrase,
  rewrapRecoveryCode,
  sealFile,
  unwrapDataKey,
} from '../crypto/envelope';
import type { KeyStore } from '../crypto/key-store';
import { resumeSyncEnabled } from '../resumes';
import { autofillSyncEnabled } from '../autofill/profile';
import type { JobRepository } from '../storage';
import {
  type DriveClient,
  DriveError,
  SCHEMA_VERSION,
  type SyncSnapshot,
  encryptedMarker,
  isEncryptedMarker,
} from './drive';
import { SyncError, downloadEncrypted, parseSnapshot, syncWithDrive } from './sync';

/**
 * The encrypted sync flows, shared by the extension and the website. Each takes the secret it
 * needs as an argument and forgets it: nothing here stores, logs or returns a passphrase or a
 * recovery code. Every Drive write is conditional on the ETag just downloaded, so a device
 * syncing at the same moment can't be overwritten (the flow fails and can be tried again).
 */

export type EncryptionDeps = {
  repo: JobRepository;
  /** Client for `career-pocket.json` (plain data, or the encrypted-sync marker). */
  drive: DriveClient;
  /** Client for `applicliq.enc.json`. */
  encryptedDrive: DriveClient;
  keys: KeyStore;
  now?: () => number;
};

const changedMeanwhile = () =>
  new SyncError('conflict', 'Your Drive data changed during this step. Try again.');

async function guard<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof DriveError && error.status === 412) throw changedMeanwhile();
    throw error;
  }
}

export function createEncryptionController(deps: EncryptionDeps) {
  const { repo, drive, encryptedDrive, keys, now = Date.now } = deps;

  /** Where Drive stands: 'on' when it holds the marker or an encrypted file. */
  async function driveState(): Promise<'on' | 'off'> {
    const [primary] = await drive.list();
    if (!primary) return (await encryptedDrive.list()).length ? 'on' : 'off';
    return isEncryptedMarker((await drive.download(primary.id)).data) ? 'on' : 'off';
  }

  async function currentFile() {
    const [file] = await encryptedDrive.list();
    if (!file) {
      throw new SyncError('encryption', 'Your encrypted data is missing from Drive.');
    }
    return { id: file.id, ...(await downloadEncrypted(encryptedDrive, file.id)) };
  }

  /** Unwraps the data key and checks it opens the payload (a damaged file is reported here). */
  async function unlockFile(file: EncryptedFile, secret: UnlockSecret) {
    const dek = await unwrapDataKey(headerOf(file), secret, { extractable: true });
    await openFile(file, dek);
    return dek;
  }

  /**
   * This device's data as a Drive snapshot; resumes only when resume sync is on, the Autofill
   * profile only when its sync is on.
   */
  async function plainSnapshot(): Promise<SyncSnapshot> {
    const settings = await repo.getSettings();
    const resumes = resumeSyncEnabled(settings) ? await repo.mergeResumesIntoLocal([]) : [];
    const autofill = autofillSyncEnabled(settings) ? await repo.mergeAutofillIntoLocal([]) : [];
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now(),
      records: await repo.mergeIntoLocal([]),
      settings: await repo.getSyncedSettings(),
      ...(resumes.length ? { resumes } : {}),
      ...(autofill.length ? { autofill } : {}),
    };
  }

  return {
    driveState,

    /** Whether this device holds the key (unlocked). */
    async isUnlocked(): Promise<boolean> {
      return (await keys.load()) !== undefined;
    },

    isRemembered: () => keys.isRemembered(),
    setRemembered: (remember: boolean) => keys.setRemembered(remember),

    /** "Lock now": forgets the key on this device. Local data stays usable. */
    lock: () => keys.clear(),

    /**
     * Turns encryption on: syncs the plain data first (so nothing from other devices is left
     * out), encrypts everything with a new data key, uploads it to the encrypted file, then
     * replaces `career-pocket.json` with the marker. Data reaches the marker step only after
     * the encrypted copy is safely in Drive.
     */
    async enable(passphrase: string, recoveryCode: string, remember: boolean): Promise<void> {
      if ((await driveState()) === 'on') {
        throw new EncryptionError(
          'invalid-file',
          'Encrypted sync is already on for this Google account. Unlock it instead.',
        );
      }
      // Fails (and stops here) if Drive holds a file this version can't read. With no file
      // there is nothing to merge (and nothing plain must be created).
      if ((await drive.list()).length) await syncWithDrive(repo, drive, { now });
      const { dek, header } = await createEnvelope(passphrase, recoveryCode);
      await repo.updateSettings({ features: { encryptedSync: true } });
      const sealed = await sealFile(header, dek, JSON.stringify(await plainSnapshot()));

      // Leftovers from an interrupted attempt are overwritten, not added to.
      const [existing, ...stale] = await encryptedDrive.list();
      if (existing) await encryptedDrive.update(existing.id, sealed);
      else await encryptedDrive.create(sealed);
      for (const { id } of stale) await encryptedDrive.remove(id).catch(() => {});

      await guard(async () => {
        const [primary, ...extras] = await drive.list();
        if (primary) {
          const { etag } = await drive.download(primary.id);
          await drive.update(primary.id, encryptedMarker(now()), etag);
        } else {
          await drive.create(encryptedMarker(now()));
        }
        // Duplicates were folded in by the sync above.
        for (const { id } of extras) await drive.remove(id).catch(() => {});
      }).catch(async (error: unknown) => {
        // The marker isn't there, so Drive still reads as plain: undo the switch here.
        await repo.updateSettings({ features: { encryptedSync: false } }).catch(() => {});
        throw error;
      });
      await keys.save(dek, remember);
    },

    /** Unlocks this device with the passphrase or the recovery code. */
    async unlock(secret: UnlockSecret, remember: boolean): Promise<void> {
      const { file } = await currentFile();
      await keys.save(await unlockFile(file, secret), remember);
    },

    /** Checks a recovery code without unlocking (the "forgot passphrase" flow's first step). */
    async checkRecoveryCode(recoveryCode: string): Promise<void> {
      const { file } = await currentFile();
      await unwrapDataKey(headerOf(file), { recoveryCode });
    },

    /**
     * Sets a new passphrase, proven with the current passphrase or the recovery code ("forgot
     * passphrase"). Only the wrapped key changes: the data isn't encrypted again. Unlocks.
     */
    async changePassphrase(
      secret: UnlockSecret,
      newPassphrase: string,
      remember: boolean,
    ): Promise<void> {
      await guard(async () => {
        const { id, file, etag } = await currentFile();
        const dek = await unlockFile(file, secret);
        const next = await rewrapPassphrase(file, dek, newPassphrase);
        await encryptedDrive.update(id, next, etag);
        await keys.save(dek, remember);
      });
    },

    /** Replaces the recovery code (the old one stops working). Proven with the passphrase. */
    async resetRecoveryCode(passphrase: string, newRecoveryCode: string): Promise<void> {
      await guard(async () => {
        const { id, file, etag } = await currentFile();
        const dek = await unlockFile(file, { passphrase });
        const next = await rewrapRecoveryCode(file, dek, newRecoveryCode);
        await encryptedDrive.update(id, next, etag);
      });
    },

    /**
     * Turns encryption off: decrypts Drive's data, merges it here, writes it back as a plain
     * `career-pocket.json` (replacing the marker), then deletes the encrypted file.
     */
    async disable(passphrase: string): Promise<void> {
      const encFiles = await encryptedDrive.list();
      if (encFiles.length === 0) {
        // Nothing encrypted in Drive (its data was deleted): there is nothing to decrypt, so turn
        // the switch off and let this device's copy become the plain file (replacing a marker).
        await repo.updateSettings({ features: { encryptedSync: false } });
        await guard(async () => {
          const [primary] = await drive.list();
          if (!primary) return;
          const { data, etag } = await drive.download(primary.id);
          if (isEncryptedMarker(data)) await drive.update(primary.id, await plainSnapshot(), etag);
        });
        await keys.clear();
        return;
      }
      await guard(async () => {
        const { file } = await currentFile();
        const dek = await unlockFile(file, { passphrase });
        const remote = parseSnapshot(JSON.parse(await openFile(file, dek)));
        await repo.mergeIntoLocal(remote.records);
        await repo.mergeSettingsIntoLocal(remote.settings);
        // Resumes come down too; whether they go back up in plain text is the resume setting's
        // call (by default: no, once encryption is off).
        if (remote.resumes.length) await repo.mergeResumesIntoLocal(remote.resumes);
        // The Autofill profile too; it goes back up only if its own sync setting says so.
        if (remote.autofill.length) await repo.mergeAutofillIntoLocal(remote.autofill);
        await repo.updateSettings({ features: { encryptedSync: false } });

        const [primary, ...extras] = await drive.list();
        const plain = await plainSnapshot();
        if (primary) {
          const { etag } = await drive.download(primary.id);
          await drive.update(primary.id, plain, etag);
        } else {
          await drive.create(plain);
        }
        for (const { id } of extras) await drive.remove(id).catch(() => {});
      });
      for (const { id } of await encryptedDrive.list()) {
        await encryptedDrive.remove(id).catch(() => {});
      }
      await keys.clear();
    },
  };
}

export type EncryptionController = ReturnType<typeof createEncryptionController>;
