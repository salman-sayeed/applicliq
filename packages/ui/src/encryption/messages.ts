import { EncryptionError, toSyncError } from '@applicliq/core';

/** A failure as the user should read it. Never includes what was typed. */
export function encryptionErrorMessage(error: unknown): string {
  if (error instanceof EncryptionError) return error.message;
  return toSyncError(error).message;
}
