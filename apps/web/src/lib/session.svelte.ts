import { hasToken, signIn, signOut } from './google-auth.ts';
import { clearLocalData, db, runSync, sync } from './sync.svelte.ts';

/** Sign-in and sign-out as the dashboard and the settings page run them. */
export const session = $state<{ busy: boolean; actionError?: string }>({ busy: false });

async function act(action: () => Promise<void>) {
  session.busy = true;
  session.actionError = undefined;
  try {
    await action();
  } catch (e) {
    session.actionError = e instanceof Error ? e.message : String(e);
  } finally {
    session.busy = false;
  }
}

/** Call from a click: Google's sign-in popup needs the user gesture. */
export const startSignIn = () =>
  act(async () => {
    const wasSignedIn = sync.signedIn;
    await signIn();
    sync.error = undefined;
    sync.signedIn = true;
    // A first sign-in starts auto-sync (the /app page's effect); "Sign in again" syncs here.
    if (wasSignedIn) await runSync();
  });

/**
 * Sign-out also clears this browser's copy: the site may be on a shared computer, and the jobs
 * live on in Drive. Changes that never reached Drive are only dropped after a confirm, unless
 * `force` (the Drive data was just deleted on purpose).
 */
export const startSignOut = ({ force = false } = {}) =>
  act(async () => {
    let synced = force;
    if (!synced && hasToken() && navigator.onLine) {
      await runSync();
      synced = !sync.error;
    }
    if (!synced && (await db.jobs.count()) > 0) {
      const ok = confirm(
        'Changes made since your last sync have not reached Google Drive. Sign out and remove them from this browser anyway?',
      );
      if (!ok) return;
    }
    await signOut();
    await clearLocalData();
    sync.signedIn = false;
  });

export function syncNow() {
  session.actionError = undefined;
  void runSync();
}
