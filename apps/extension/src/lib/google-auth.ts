import { DRIVE_SCOPE } from '@applicliq/core';

/**
 * Google sign-in for Drive sync, scope `drive.appdata` only.
 *
 * - Web flow (Firefox, Edge, and Chrome when a Web client ID is set): `identity.launchWebAuthFlow`
 *   with the "Web application" OAuth client (implicit flow).
 * - Chrome with only a Chrome client: `identity.getAuthToken`, with the "Chrome extension" OAuth
 *   client from the manifest's `oauth2` key. Chrome caches and renews the token itself.
 * Web-flow tokens last an hour; renewing is tried silently (`prompt=none`), which works while
 * the user is signed in to Google in the browser.
 *
 * See docs/google-setup.md for creating the client IDs.
 */

/** Whether the user turned sync on (kept when a token expires, cleared by sign-out). */
const SIGNED_IN_KEY = 'syncSignedIn';
/** Web-flow token cache. Session storage where available: gone when the browser closes. */
const TOKEN_KEY = 'syncToken';
type CachedToken = { token: string; expiresAt: number };

const WEB_CLIENT_ID: string = import.meta.env.WXT_GOOGLE_CLIENT_ID_WEB ?? '';
/**
 * Chrome uses `getAuthToken` only when no Web client is configured: Chrome extension clients
 * created since Google dropped custom URI schemes fail with "Custom URI scheme is not supported
 * on Chrome apps", while `launchWebAuthFlow` works everywhere.
 */
const useChromeIdentity = import.meta.env.BROWSER === 'chrome' && WEB_CLIENT_ID === '';

export class NotSignedInError extends Error {
  constructor(message = 'Not signed in to Google Drive.') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

/** False when this build has no OAuth client ID (sync is then hidden behind a hint). */
export function isSyncConfigured(): boolean {
  if (useChromeIdentity) return !!browser.runtime.getManifest().oauth2?.client_id;
  return WEB_CLIENT_ID !== '';
}

const tokenStore = () => browser.storage.session ?? browser.storage.local;

export async function isSignedIn(): Promise<boolean> {
  const stored = (await browser.storage.local.get(SIGNED_IN_KEY)) as { [SIGNED_IN_KEY]?: true };
  return stored[SIGNED_IN_KEY] === true;
}

/**
 * An access token. Non-interactive by default (background syncs): throws `NotSignedInError`
 * when the user must act. Interactive only from a click (Sign in).
 */
export async function getToken({ interactive = false } = {}): Promise<string> {
  if (!interactive && !(await isSignedIn())) throw new NotSignedInError();
  return useChromeIdentity ? chromeToken(interactive) : webFlowToken(interactive);
}

/** Forgets a token Drive rejected, so the next `getToken` fetches a fresh one. */
export async function dropToken(token: string): Promise<void> {
  if (useChromeIdentity) {
    await browser.identity.removeCachedAuthToken({ token });
  } else {
    await tokenStore().remove(TOKEN_KEY);
  }
}

/** Asks the user to sign in and grant Drive app-data access. Call from a click. */
export async function signIn(): Promise<void> {
  await getToken({ interactive: true });
  await browser.storage.local.set({ [SIGNED_IN_KEY]: true });
}

/**
 * Stops syncing: revokes the app's access at Google (best effort, e.g. offline) and forgets the
 * token. Local data stays; signing in again merges it back with Drive.
 */
export async function signOut(): Promise<void> {
  const token = await cachedToken();
  await browser.storage.local.remove(SIGNED_IN_KEY);
  if (token) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    }).catch(() => {});
    await dropToken(token);
  }
  if (useChromeIdentity) await browser.identity.clearAllCachedAuthTokens().catch(() => {});
}

/** The current token if one is at hand, without any sign-in UI. */
async function cachedToken(): Promise<string | undefined> {
  try {
    if (useChromeIdentity) return await chromeToken(false);
    const stored = (await tokenStore().get(TOKEN_KEY)) as { [TOKEN_KEY]?: CachedToken };
    return stored[TOKEN_KEY]?.token;
  } catch {
    return undefined;
  }
}

async function chromeToken(interactive: boolean): Promise<string> {
  try {
    const result = await browser.identity.getAuthToken({ interactive, scopes: [DRIVE_SCOPE] });
    if (!result.token) throw new NotSignedInError();
    if (result.grantedScopes && !result.grantedScopes.includes(DRIVE_SCOPE)) {
      throw new NotSignedInError('Google Drive access was not granted.');
    }
    return result.token;
  } catch (error) {
    if (error instanceof NotSignedInError) throw error;
    throw new NotSignedInError(
      interactive ? signInFailure(error) : 'Google Drive access expired. Sign in again.',
    );
  }
}

async function webFlowToken(interactive: boolean): Promise<string> {
  const store = tokenStore();
  const stored = (await store.get(TOKEN_KEY)) as { [TOKEN_KEY]?: CachedToken };
  const cached = stored[TOKEN_KEY];
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  if (!WEB_CLIENT_ID) throw new NotSignedInError('Sync is not set up in this build.');

  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: WEB_CLIENT_ID,
    response_type: 'token',
    redirect_uri: browser.identity.getRedirectURL(),
    scope: DRIVE_SCOPE,
    state,
    // Silent renewal shows nothing; it fails if Google needs the user (consent, sign-in).
    ...(interactive ? {} : { prompt: 'none' }),
  }).toString();

  let redirect: string | undefined;
  try {
    redirect = await browser.identity.launchWebAuthFlow({ url: url.toString(), interactive });
  } catch (error) {
    throw new NotSignedInError(
      interactive ? signInFailure(error) : 'Google Drive access expired. Sign in again.',
    );
  }

  // The token comes back in the redirect URL's fragment.
  const params = new URLSearchParams(new URL(redirect ?? '').hash.slice(1));
  const token = params.get('access_token');
  if (params.get('state') !== state || !token) {
    throw new NotSignedInError(params.get('error') ?? 'Google sign-in failed.');
  }
  if (!(params.get('scope') ?? DRIVE_SCOPE).split(' ').includes(DRIVE_SCOPE)) {
    throw new NotSignedInError('Google Drive access was not granted.');
  }
  // Renew a minute early so a request never starts with an about-to-expire token.
  const expiresIn = Number(params.get('expires_in') ?? 3600);
  await store.set({
    [TOKEN_KEY]: { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 } satisfies CachedToken,
  });
  return token;
}

function signInFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|closed|did not approve|not approve/i.test(message)
    ? 'Sign-in was cancelled.'
    : `Google sign-in failed: ${message}`;
}
