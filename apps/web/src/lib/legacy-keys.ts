/**
 * Browser storage keys were prefixed `pocket-career:` before the app was renamed Career Pocket.
 * Moves any left over to their new names once, so a returning user stays signed in and keeps
 * their sync status. Imported for its side effect before any key is read.
 */
const OLD = 'pocket-career:';
const NEW = 'career-pocket:';

function move(storage: Storage): void {
  for (const key of Object.keys(storage)) {
    if (!key.startsWith(OLD)) continue;
    const renamed = NEW + key.slice(OLD.length);
    if (storage.getItem(renamed) === null) storage.setItem(renamed, storage.getItem(key)!);
    storage.removeItem(key);
  }
}

if (typeof window !== 'undefined') {
  try {
    move(localStorage);
    move(sessionStorage);
  } catch {
    // Storage blocked: nothing to move.
  }
}
