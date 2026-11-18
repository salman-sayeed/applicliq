# Google Drive sync setup

Pocket Career syncs through a single file, `pocket-career.json`, in the hidden **appDataFolder**
of the user's own Google Drive. It asks for one scope,
`https://www.googleapis.com/auth/drive.appdata`, which can only see files the app itself
created there. It can't see anything else in the user's Drive.

To build with sync you need a Google Cloud project with two OAuth client IDs:

| Client type          | Used by                                                  | Sign-in API                        |
| -------------------- | -------------------------------------------------------- | ---------------------------------- |
| **Chrome extension** | the extension in Chrome                                  | `chrome.identity.getAuthToken`     |
| **Web application**  | the extension in Firefox and Edge, and the web dashboard | `identity.launchWebAuthFlow` / web |

Neither flow uses a client secret. Client IDs are not secret (they ship inside the extension),
but never create or commit a client secret for these clients.

Without client IDs the extension still builds and works fully offline. The sync menu then says
sync isn't set up.

## 1. Create the project and enable the Drive API

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project
   (e.g. "Pocket Career").
2. Go to **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.

## 2. Configure the OAuth consent screen

In **Google Auth Platform** (formerly _APIs & Services → OAuth consent screen_):

1. **Branding**: app name, support email, and a logo if you want one.
2. **Audience**: choose **External**. While the app is in **Testing**, only the Google accounts
   you add under **Test users** can sign in. Add your own account.
3. **Data access → Add or remove scopes**: add `.../auth/drive.appdata`
   ("See, create, and delete its own configuration data in your Google Drive").
4. Before release, move the app from Testing to **In production**. The console shows whether
   Google needs to verify the app for the scopes you added.

## 3. Chrome extension client

The client is tied to the extension's **ID**, so first make that ID stable.

### Pin the extension ID in development (recommended)

An unpacked extension's ID comes from its folder unless the manifest has a `key`. To get the same
ID on every machine, generate a key once (outside the repo, or anywhere: `*.pem` is gitignored):

```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out pocket-career-dev.pem
```

The public key, for `WXT_CHROME_EXTENSION_KEY`:

```bash
openssl rsa -in pocket-career-dev.pem -pubout -outform DER | openssl base64 -A
```

The extension ID it produces:

```bash
openssl rsa -in pocket-career-dev.pem -pubout -outform DER | shasum -a 256 | head -c32 | tr 0-9a-f a-p
```

You can also load the extension once and copy its ID from `chrome://extensions`.

### Create the client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Chrome extension**.
3. **Item ID**: the extension ID from above.
4. Copy the client ID into `WXT_GOOGLE_CLIENT_ID_CHROME`.

The Chrome Web Store assigns the published extension its own ID. Create a second Chrome
extension client with that ID for release builds, or upload the store's public key as the dev
`key` so both IDs match.

## 4. Web application client

This one client serves Firefox, Edge and the web dashboard.

1. **Create credentials → OAuth client ID**, application type **Web application**.
2. **Authorized JavaScript origins** (for the web dashboard):
   - `http://localhost:5173` (`pnpm dev:web`)
   - your Cloudflare Pages URL, e.g. `https://pocket-career.pages.dev`, and any custom domain
3. **Authorized redirect URIs** (for the extension's `launchWebAuthFlow`). Each browser
   derives one from the extension ID:
   - **Firefox**: `https://<hash>.extensions.allizom.org/`. The add-on ID is fixed to
     `pocket-career@pocket-career` in `wxt.config.ts`, so this URL is stable.
   - **Edge**: `https://<edge-extension-id>.chromiumapp.org/`.

   To get the exact value, open the extension's background console (Firefox:
   `about:debugging` → This Firefox → Inspect; Edge: `edge://extensions` → service worker)
   and run:

   ```js
   browser.identity.getRedirectURL();
   ```

   Paste it **including the trailing slash**.

4. Copy the client ID into `WXT_GOOGLE_CLIENT_ID_WEB`.

## 5. Put the IDs in the build

```bash
cp apps/extension/.env.example apps/extension/.env
```

Fill in `apps/extension/.env` (it's gitignored):

```ini
WXT_GOOGLE_CLIENT_ID_CHROME=1234-abc.apps.googleusercontent.com
WXT_GOOGLE_CLIENT_ID_WEB=1234-def.apps.googleusercontent.com
WXT_CHROME_EXTENSION_KEY=MIIBIjANBgkqh...
```

Then `pnpm dev:ext` or `pnpm build:ext`. In CI, set the same variables in the environment
instead of using a file.

## How sync behaves

- **Sign in / Sign out** live in the sync menu at the top right of the dashboard. Signing out
  revokes the app's access at Google and keeps all jobs on the device.
- A sync runs when the popup opens, 3 seconds after a change, every 15 minutes, and on browser
  start-up. The background does all syncing, so two pages never race.
- Each sync downloads the file, merges it with local data (last write wins per job, deletions
  travel as tombstones), saves the result locally, and uploads only if it differs from Drive.
- The upload sends the downloaded ETag as `If-Match`. If Drive answers `412 Precondition Failed`
  (another device wrote in between), the whole round starts over, up to 3 times. If an overwrite
  ever slips through, the device whose change was lost still has it locally. Its next sync sees
  that Drive differs and uploads it again.
- The file carries a `schemaVersion`. A file from a newer app version is never overwritten:
  sync stops with "update to keep syncing".
- Firefox and Edge get one-hour tokens and renew them silently while you're signed in to Google
  in that browser. When that fails, the menu asks you to **Sign in again**.

## Troubleshooting

| Symptom                                 | Fix                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch` (Firefox, Edge) | Add the exact `getRedirectURL()` value, with trailing slash, to the Web client's redirect URIs.     |
| `bad client id` / `OAuth2 not granted`  | The Chrome client's Item ID doesn't match the extension ID. Pin it with `WXT_CHROME_EXTENSION_KEY`. |
| `access_denied` / "app not verified"    | In Testing mode, add the account under **Test users**.                                              |
| 403 from Drive                          | The Google Drive API isn't enabled for the project, or the `drive.appdata` scope wasn't granted.    |
| Sync menu says "isn't set up"           | The build had no client ID for this browser: check `apps/extension/.env` and rebuild.               |
