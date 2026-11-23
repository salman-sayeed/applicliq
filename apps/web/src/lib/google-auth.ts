import './legacy-keys.ts';
import { DRIVE_SCOPE } from '@applicliq/core';

/**
 * Google sign-in for the web dashboard with Google Identity Services (GIS), token model, scope
 * `drive.appdata` only. GIS is the one remote script the site loads, and only on /app: it is
 * Google's own sign-in, and nothing but the Drive file ever goes to Google.
 *
 * Browser tokens last an hour and GIS can't renew them without a click (a popup outside a click
 * is blocked), so when one expires, sync asks to "Sign in again"; the dashboard keeps working
 * from IndexedDB meanwhile.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
// Storage keys kept from the Career Pocket days: renaming them would sign existing users out.
/** Whether the user turned sync on in this browser (cleared by sign-out). */
const SIGNED_IN_KEY = 'career-pocket:sync-signed-in';
/** The access token: per tab, gone when the tab closes. */
const TOKEN_KEY = 'career-pocket:sync-token';

type CachedToken = { token: string; expiresAt: number };

type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
};

type Gis = {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    prompt?: '' | 'none' | 'consent' | 'select_account';
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
  }): { requestAccessToken(): void };
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: Gis } };
  }
}

export class NotSignedInError extends Error {
  constructor(message = 'Not signed in to Google Drive.') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

export const isSyncConfigured = (): boolean => CLIENT_ID !== '';

function read<T>(storage: Storage, key: string): T | undefined {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    if (value === undefined) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: sign-in then lasts only as long as the page.
  }
}

export const isSignedIn = (): boolean => read<boolean>(localStorage, SIGNED_IN_KEY) === true;

/** A token that is still good, if this tab has one. */
function cachedToken(): string | undefined {
  const cached = read<CachedToken>(sessionStorage, TOKEN_KEY);
  return cached && cached.expiresAt > Date.now() ? cached.token : undefined;
}

export const hasToken = (): boolean => cachedToken() !== undefined;

let gisLoading: Promise<Gis> | undefined;

/** Loads the GIS script once. Preload it on /app so a click can open the popup right away. */
export function loadGis(): Promise<Gis> {
  gisLoading ??= new Promise<Gis>((resolve, reject) => {
    const ready = () => window.google?.accounts?.oauth2;
    const loaded = ready();
    if (loaded) return resolve(loaded);
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const gis = ready();
      if (gis) resolve(gis);
      else reject(new Error('Google sign-in did not load.'));
    };
    script.onerror = () => reject(new Error('Could not load Google sign-in. Are you offline?'));
    document.head.append(script);
  }).catch((error: unknown) => {
    gisLoading = undefined; // Let the next attempt retry (e.g. back online).
    throw error;
  });
  return gisLoading;
}

/**
 * An access token. Without `interactive` (background syncs) it never shows UI and throws
 * `NotSignedInError` when the user has to act. Interactive only from a click.
 */
export async function getToken({ interactive = false } = {}): Promise<string> {
  const cached = cachedToken();
  if (cached) return cached;
  if (!interactive) {
    throw new NotSignedInError(
      isSignedIn()
        ? 'Your Google session expired. Sign in again to keep syncing.'
        : 'Not signed in to Google Drive.',
    );
  }
  return requestToken(isSignedIn() ? '' : 'select_account');
}

let pending: Promise<string> | undefined;

function requestToken(prompt: '' | 'select_account'): Promise<string> {
  if (!CLIENT_ID) return Promise.reject(new NotSignedInError('Sync is not set up on this site.'));
  pending ??= loadGis()
    .then(
      (gis) =>
        new Promise<string>((resolve, reject) => {
          const client = gis.initTokenClient({
            client_id: CLIENT_ID,
            scope: DRIVE_SCOPE,
            prompt,
            callback: (response) => {
              if (response.error || !response.access_token) {
                reject(new NotSignedInError(signInFailure(response.error ?? '')));
              } else if (!gis.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
                reject(new NotSignedInError('Google Drive access was not granted.'));
              } else {
                // Renew a minute early so a request never starts with an about-to-expire token.
                const expiresAt = Date.now() + (Number(response.expires_in || 3600) - 60) * 1000;
                write(sessionStorage, TOKEN_KEY, {
                  token: response.access_token,
                  expiresAt,
                } satisfies CachedToken);
                resolve(response.access_token);
              }
            },
            error_callback: (error) => reject(new NotSignedInError(signInFailure(error.type))),
          });
          client.requestAccessToken();
        }),
    )
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

function signInFailure(reason: string): string {
  if (/popup_closed|access_denied/.test(reason)) return 'Sign-in was cancelled.';
  if (reason === 'popup_failed_to_open') {
    return 'The Google sign-in window was blocked. Allow pop-ups for this site and try again.';
  }
  return reason ? `Google sign-in failed: ${reason}` : 'Google sign-in failed.';
}

/** Forgets a token Drive rejected, so the next interactive `getToken` fetches a fresh one. */
export function dropToken(): void {
  write(sessionStorage, TOKEN_KEY, undefined);
}

/** Asks the user to choose an account and grant Drive app-data access. Call from a click. */
export async function signIn(): Promise<void> {
  await getToken({ interactive: true });
  write(localStorage, SIGNED_IN_KEY, true);
}

/** Revokes the app's access at Google (best effort) and forgets the token. */
export async function signOut(): Promise<void> {
  const token = cachedToken();
  write(localStorage, SIGNED_IN_KEY, undefined);
  dropToken();
  if (!token) return;
  try {
    const gis = await loadGis();
    await new Promise<void>((resolve) => gis.revoke(token, resolve));
  } catch {
    // Offline or GIS unavailable: the token expires within the hour anyway.
  }
}
