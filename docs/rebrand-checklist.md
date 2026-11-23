# Rebrand checklist: Career Pocket → AppliCliq

The app was renamed from Career Pocket to **AppliCliq** (slug `applicliq`). Existing users keep
their data: everything stored in their browsers or Drive still uses the old identifiers (see
"Kept on purpose" below).

## Done

### Code (branch `rebrand/applicliq`)

- [x] Name changed everywhere people see it: extension manifest (`name`, `short_name`,
      description), popup, sidebar, dashboard, settings, onboarding, toasts, badge tooltips,
      website text and `<title>`s, install guide, privacy policy, README, CLAUDE.md, CONTRIBUTING,
      docs and store listing texts. Workspace packages are `@applicliq/*`.
- [x] Icons generated from `brand/applicliq-logo.png` by `scripts/generate-icons.ts`
      (`pnpm icons`, sharp):
  - extension: `apps/extension/public/icon/{16,32,48,96,128}.png`, wired into the manifest
    `icons`, the toolbar action (`action` / Firefox `browser_action`) and the Firefox sidebar
  - website: `favicon.svg`, `favicon.ico` (16/32/48), `apple-touch-icon.png` (180),
    `icon-192.png`, `icon-512.png`, maskable 192/512, `manifest.webmanifest`, `og-image.png`
    (1200×630, logo + "AppliCliq – Job Application Tracker")
  - logo in the popup, dashboard and settings headers, website navbar and footer, README
- [x] Theme: the default accent is the logo blue (`#406db5` light / `#7b9dd6` dark) and the "rose"
      preset the logo crimson (`#b23f58` / `#e07a91`). All pairs are at least 4.5:1 (WCAG AA) for
      text on the accent and accent text on the surfaces, in light and dark mode. The preset keys
      stored in settings are unchanged.
- [x] Website base URL `https://applicliq.pages.dev` (`SITE_URL`): canonical and Open Graph tags,
      `sitemap.xml`, `robots.txt`, README links, and a Website link in Settings → About.
- [x] Release assets renamed to `applicliq-chromium.zip` and `applicliq-firefox.zip`; the install
      page links to `releases/latest/download/applicliq-chromium.zip`. Version 1.1.0.
- [x] `.github/workflows/deploy-web.yml`: builds `apps/web` and deploys it to the `applicliq`
      Pages project on pushes to `main` that touch `apps/web`, `packages/ui` or `packages/core`.

### Cloudflare

- [x] New Pages project `applicliq`, production branch `main`.
- [x] `apps/web` built and deployed to https://applicliq.pages.dev. Checked: `/`, `/install`,
      `/app`, `/privacy`, favicons, `og-image.png`, `manifest.webmanifest`, `sitemap.xml`,
      `robots.txt` (all 200, new branding, no console errors).
- [x] Old project `career-pocket` (https://career-pocket.pages.dev) redirects every path with a
      301 to the same path on https://applicliq.pages.dev (query strings kept). It is
      Git-connected, so its production branch is the orphan branch `old-site-redirect` (only
      `_redirects`, no build command, output directory `/`), deployed 2026-11-23. Checked with
      `curl -I`: `/`, `/install`, `/app`, `/privacy`, `/app/settings` all 301 to the matching path.
      Never delete the old project, and never merge `old-site-redirect` into `main`.
      Its settings before the switch, to undo it: production branch `main`, build command
      `pnpm install --frozen-lockfile && pnpm --filter @career-pocket/web build`, output directory
      `apps/web/build`.
- [x] Auto-deploy: the Deploy web workflow published `bc033c1` to the `applicliq` project.

### Kept on purpose (never rename)

| What                                                              | Why                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| IndexedDB name `career-pocket`                                    | every existing user's saved jobs live there                   |
| Drive file `career-pocket.json` (legacy `pocket-career.json`)     | existing users' synced data                                   |
| `career-pocket:*` browser storage keys                            | sign-in state, sync status, cached appearance                 |
| Notification IDs `career-pocket-reminder:*`, `career-pocket-goal` | clicks on reminders shown before an update                    |
| Web Lock `career-pocket-sync`                                     | tabs on the old and new version must share the lock           |
| ICS UID `…-interview@career-pocket`                               | re-exported interviews would become duplicate calendar events |
| Firefox ID `career-pocket@career-pocket`, Chrome `key`            | the extension's identity and Google redirect URLs             |
| OAuth client IDs and the `drive.appdata` scope                    | sign-in for existing installs                                 |
| AMO URL `/addon/career-pocket/`                                   | the listing's slug hasn't changed yet                         |

## Remaining manual steps

### Release 1.1.0

- [ ] Merge `rebrand/applicliq` into `main`, then tag and push `v1.1.0`. Until a release has
      `applicliq-chromium.zip`, the install page's download link (latest release) returns 404:
      v1.0.1 only has `career-pocket-chromium.zip`.

### GitHub Actions secrets (for deploy-web.yml)

Done on 2026-11-23: `CLOUDFLARE_API_TOKEN` (Cloudflare Pages: Edit only) and `CLOUDFLARE_ACCOUNT_ID`
are set. To replace the token later:

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create Custom Token**.
   Name it e.g. "GitHub deploy applicliq". **Permissions**: Account → **Cloudflare Pages → Edit**
   (nothing else). **Account Resources**: Include → your account. Create, and copy the token
   (it is shown once).
2. Account ID: Cloudflare dashboard → **Workers & Pages** → the account ID in the right sidebar
   (or `npx wrangler whoami`).
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the account ID). Or with the
   GitHub CLI, which prompts for the value so it never lands in your shell history:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

4. Optional: `VITE_GOOGLE_CLIENT_ID` (the Web OAuth client ID). Without it the workflow uses the
   existing `WXT_GOOGLE_CLIENT_ID_WEB` secret, which is the same Web client.

### Google Cloud Console

- [ ] **APIs & Services → Credentials →** the Web OAuth client → **Authorized JavaScript origins**:
      add `https://applicliq.pages.dev` (keep `https://career-pocket.pages.dev` until nobody uses
      it; it now redirects, so it can go later). Without this, sign-in on the new `/app` fails.
- [ ] **Google Auth Platform → Branding**: app name **AppliCliq**, new logo, application home page
      `https://applicliq.pages.dev/`, privacy policy `https://applicliq.pages.dev/privacy`, and
      `applicliq.pages.dev` under authorized domains if listed. A name or logo change may need
      verification again.
- [ ] Leave the client IDs, the Chrome extension client and the redirect URIs as they are.

### GitHub

- [x] Renamed the repository `careerpocket` → `applicliq` (2026-11-23). Old links and clones
      redirect automatically.
- [x] Update the description ("AppliCliq: a free, open-source job application tracker") and the
      website field (`https://applicliq.pages.dev`).
- [x] Then update `GITHUB_URL` in `apps/web/src/lib/links.ts` and `apps/extension/src/lib/config.ts`,
      and the clone URLs in README.md, CONTRIBUTING.md and docs/store-listing.md, and
      `git remote set-url origin https://github.com/salman-sayeed/applicliq.git`.
- [x] The old Pages project still follows the renamed repo (Cloudflare tracks it by ID,
      `1462517255`; its stored name `careerpocket` is just a label).

### Firefox Add-ons (AMO)

- [ ] Upload 1.1.0 (`applicliq-1.1.0-firefox.zip`) with `applicliq-1.1.0-sources.zip` as the
      source code.
- [ ] Update the name (AppliCliq), summary, icon (`apps/extension/public/icon/128.png`) and
      screenshots.
- [ ] Keep the slug `career-pocket` for now. When you change it, update `FIREFOX_URL` in
      `apps/web/src/lib/config.ts` and the README links (AMO doesn't redirect old slugs).
- [ ] Never change the add-on ID `career-pocket@career-pocket`.

### Other

- [ ] Re-capture store and site screenshots (`docs/screenshots/capture*.mjs`) so they show the new
      name and logo.
- [ ] When Chrome Web Store / Edge listings go live, use the AppliCliq name and new icons.
