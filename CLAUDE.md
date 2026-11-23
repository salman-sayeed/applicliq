# AppliCliq

## Goal

A free, open-source, lightweight job application tracker: a browser extension that saves job
postings from any site, plus a static web dashboard to manage them.

There is **no backend and no database server**. Data lives locally in IndexedDB and syncs to the
user's own Google Drive, in the hidden `appDataFolder` (scope `drive.appdata`: the app can see
nothing else in the user's Drive).

## Stack

- **pnpm workspaces** monorepo, Node >= 22, TypeScript 6 (strict, project references)
- **Extension**: [WXT](https://wxt.dev) + Svelte 5 (runes) + Tailwind CSS v4. Builds for Chrome,
  Edge (MV3) and Firefox.
- **Web**: SvelteKit 3 with `@sveltejs/adapter-static`, fully prerendered, deployed to Cloudflare
  Pages. SvelteKit config lives in `apps/web/vite.config.ts` (there is no `svelte.config.js`).
- **Storage**: Dexie (IndexedDB). **Sync**: Google Drive REST v3 via `fetch` (no Google SDK).
- **Tooling**: Vitest (in `packages/core`), ESLint 10 flat config + typescript-eslint +
  eslint-plugin-svelte, Prettier (+ svelte and tailwind plugins).

## Folder structure

```
apps/
  extension/            WXT extension
    src/entrypoints/    popup/ and sidepanel/ (both mount components/JobPanel), dashboard/
                        (extension page), options/ (settings page, also the extension's options
                        page), background.ts, extract.content.ts, job-badge.content.ts (saved-job
                        page badge, injected by background), picker.content.ts ("pick from page")
    src/components/     JobPanel (save form + per-page draft, tab following in the sidebar),
                        JobForm, SavedJob, RecentJobs, form.css
    src/lib/draft.ts    form drafts in storage.session (per page URL, 24 h), toolbar "•" badge
    src/lib/tab-draft.ts  writes selected / picked page text into a tab's draft, page toast
    src/lib/open-in.ts  toolbar button opens popup or sidebar (side_panel / sidebar_action)
    src/lib/background.ts  auto-ghosting, reminders (quiet hours, goal nudge), goal badge, page badge
    src/lib/google-auth.ts launchWebAuthFlow (Web client); getAuthToken on Chrome if only a Chrome client
    src/lib/sync.ts     background sync runner + status in extension storage
docs/screenshots/       capture.mjs (dashboard shots), capture-extension.mjs (sidebar, pick from
                        page, right-click menu on fictional postings from demo-job.html)
docs/google-setup.md    creating the OAuth client IDs (env vars in apps/extension/.env, apps/web/.env)
docs/store-listing.md   Chrome Web Store / Edge / AMO listing text, permission justifications
.github/workflows/      ci.yml (format, lint, typecheck, test, build on PRs and main);
                        release.yml (on a v* tag: zips for Chrome, Edge, Firefox + sources zip,
                        plus applicliq-chromium.zip / applicliq-firefox.zip, attached to a GitHub
                        Release); deploy-web.yml (web app to the `applicliq` Cloudflare Pages
                        project on pushes to main touching apps/web or packages/ui|core)
brand/                  source logo (applicliq-logo.png; an .svg is used instead if added)
scripts/generate-icons.ts  `pnpm icons`: extension icons, favicons, PWA icons, web manifest,
                        og-image and logo images, all generated from brand/ with sharp
redirect-site/          `_redirects` deployed to the old career-pocket Pages project (301 to the
                        new site); not part of any build
    wxt.config.ts       manifest + Vite plugins (Tailwind)
  web/                  SvelteKit static site (Cloudflare Pages: docs/deploy-web.md)
    src/routes/         +layout.ts sets `prerender = true`; (site)/ landing + privacy (site.css),
                        app/ the dashboard and app/settings (client-only, app.css with the
                        dashboard and settings @source)
    src/lib/config.ts   store list (live / coming soon), manual-install browsers, donation details
                        (SUPPORT: the landing page's Support section and the README's)
    src/lib/Screenshots.svelte  landing-page screenshot tabs (scroll-snap, swipe on phones)
    src/routes/(site)/install/  manual install guide (Chrome, Brave, Edge, Opera)
    src/lib/session.svelte.ts  sign-in / sign-out shared by /app and /app/settings
    src/lib/google-auth.ts  Google Identity Services token client (loaded only on /app)
    src/lib/sync.svelte.ts  IndexedDB repo, dashboard adapter, sync runner + triggers
    static/_headers     Cloudflare headers; the CSP is a meta tag from vite.config.ts
packages/
  core/                 domain logic, NO UI code
    src/types.ts        Job model, statuses, tombstones
    src/settings.ts     Settings schema + defaults + validation (SETTINGS_SCHEMA), synced vs device
                        keys (DEVICE_KEYS), settings merge
    src/storage.ts      Dexie DB (jobs, settings) + repository: CRUD, URL/company lookup, settings,
                        import/export
    src/csv.ts          jobsToCsv (spreadsheet export)
    src/draft.ts        save-form Draft, setDraftField (salary text parsing), createDraftStore
    src/reminders.ts    auto-ghost selection, due reminders, job summary, goal badge text
    src/merge.ts        mergeJobs: last-write-wins merge, tombstone purge
    src/url.ts          normalizeUrl (strips hash + tracking params) for duplicate detection
    src/validate.ts     sanitizeRecord(s) for untrusted data (Drive file, imports)
    src/sync/           Drive appDataFolder client (fetch, ETags) + sync orchestration
    src/scrapers/       extractJob(doc, url): JSON-LD > site adapters (sites/) > meta tags;
                        HTML fixtures in __fixtures__ (excluded from Prettier)
  ui/                   shared Svelte components + Tailwind theme
    src/theme.css       @theme tokens; import after `tailwindcss` in each app
    src/components/     Button, StatusBadge, ...
    src/dashboard/      shared Dashboard (list, kanban, detail panel, onboarding) and SyncMenu. Talks to
                        storage only through a DashboardAdapter prop, never extension/platform APIs,
                        so the extension page and the web app can both mount it. Pages that render
                        it add `@source` for this folder in their CSS.
    src/settings/       shared SettingsPage (section nav, auto-save). Platform bits come in through a
                        SettingsPlatform prop; extension-only sections are disabled on the web.
    src/prefs.svelte.ts Prefs context: status names, hidden statuses, tag colours, date format
    src/appearance.ts   applyAppearance: theme / accent / density / reduce-motion on <html>
    src/motion.ts       fade/fly/slide/flip/crossfade that honour reduced motion (Svelte 5 runs
                        transitions with Web Animations, which the CSS rule can't stop): import
                        these, never svelte/transition or svelte/animate directly
    src/a11y/focus.ts   rememberFocus (restore focus when a dialog/panel closes), trapTab
```

Workspace packages export their TypeScript/Svelte **source** directly (no build step); each app's
bundler compiles them. `packages/ui/src/theme.css` declares `@source './components'` so apps pick
up classes used in shared components.

## Commands

```bash
pnpm install
pnpm dev:ext        # extension dev mode (opens a browser with it loaded, HMR)
pnpm dev:web        # web dashboard on http://localhost:5173
pnpm build          # build both apps (extension: Chrome; web: apps/web/build)
pnpm build:ext      # extension for Chrome, Edge and Firefox (.output/*)
pnpm deploy:web     # build the web app and upload it to Cloudflare Pages (Wrangler)
pnpm test           # Vitest (packages/core)
pnpm typecheck      # tsc -b (core) + svelte-check (ui, extension, web)
pnpm lint           # ESLint
pnpm format         # Prettier
pnpm icons          # regenerate icons and images from brand/ (commit the output)
```

## Rules

1. **Keep the bundle small.** Check the build size output when adding code. Prefer platform APIs
   over libraries; import narrowly so tree-shaking works (`packages/*` are `sideEffects: false`
   except CSS).
2. **No heavy dependencies.** No UI kits, date libraries, lodash, Google SDKs, state libraries, or
   analytics. A new runtime dependency needs a strong reason; dev-only tooling is fine.
3. **Animations under 200ms.** The theme sets the default transition to 150ms. Respect
   `prefers-reduced-motion` (handled globally in the theme).
4. **Offline-first.** IndexedDB is the source of truth for the UI. Every feature must work with no
   network; sync is a background reconciliation that may fail without losing data.
5. **Privacy: never send user data anywhere except the user's own Google Drive.** No telemetry, no
   analytics, no third-party APIs, no remote logging, no remote fonts/scripts. Scrapers read the
   current page only and never make network requests. The one remote script is Google Identity
   Services, loaded on the web app's /app page only, for sign-in.
6. `packages/core` contains no UI code and no framework imports (no Svelte, no DOM rendering).
   Platform-specific bits (e.g. getting an OAuth token) are injected by the apps.
7. Request the minimum extension permissions; add one only when a feature needs it.
8. **The app was renamed from Career Pocket to AppliCliq.** Identifiers that persist in users'
   browsers or Drive keep the old name and must never change: the IndexedDB name
   (`career-pocket`), the Drive file (`career-pocket.json`, legacy `pocket-career.json`),
   `career-pocket:*` storage keys, notification IDs, the Web Lock name, the ICS UID suffix, the
   Firefox add-on ID (`career-pocket@career-pocket`), the Chrome `key` and the OAuth client IDs.
   The AMO listing slug and the GitHub repo URL also still use the old name for now.

## Job data model

Defined in `packages/core/src/types.ts`:

```ts
type JobStatus =
  'saved' | 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected' | 'ghosted' | 'withdrawn';

type Job = {
  id: string;
  url: string;
  title: string;
  company: string;
  location?: string;
  workType?: 'remote' | 'hybrid' | 'onsite';
  salary?: { min?: number; max?: number; currency?: string; period?: 'hour' | 'month' | 'year' };
  source?: string;
  status: JobStatus;
  history: { status: JobStatus; at: number }[];
  notes?: string;
  tags?: string[];
  resumeVersion?: string;
  contact?: { name?: string; email?: string };
  interviewAt?: number;
  followUpAt?: number;
  descriptionSnapshot?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};
```

- All timestamps are epoch milliseconds.
- `history` gets a new entry whenever `status` changes (the repository does this).
- `updatedAt` is bumped on every write; it decides merges.

### Deletion rule (tombstones)

- Deleting a job **replaces it with a tombstone: `{ id, deletedAt }` only**. All other fields are
  dropped.
- The UI **hides tombstones** (`getJobs()` / `getJob()` / `getJobByUrl()` / `findSameCompany()` never return them).
- Tombstones are **purged after 30 days** (`TOMBSTONE_TTL_MS`), both locally
  (`purgeOldTombstones`) and during merges.
- Tombstones exist so a deletion on one device propagates through Drive sync instead of the job
  being resurrected by another device.

### Settings

`Settings` (`packages/core/src/settings.ts`) is one typed object with a `version` and an
`updatedAt`, grouped in sections (goals, automation, notifications, jobPages, appearance, regional,
labels, sync). It is stored in the `settings` table as two rows: `app` (synced keys) and `device`
(`DEVICE_KEYS`: notification settings and the page badge's on/position/sites, which never leave the
browser). Everything read from storage, Drive or a file goes through `sanitizeSettings`, which also
reads the old shape (top-level `theme`/`ghostedAfterDays`, 0 = off). `updatedAt` only moves when a
synced key changes. Status keys never change; `labels.statusLabels` only renames them for display.

### Sync / merge

The Drive file `career-pocket.json` in `appDataFolder` holds
`{ schemaVersion: 1, updatedAt, records, settings }` (`settings` = the synced part; files from
older versions lack it and it is added on the next upload)
(older files and exports used `version: 1`, still read). Sync = download, sanitize,
`mergeJobs(local, remote)` (per id, last write wins by `updatedAt` / `deletedAt`; a tombstone
wins a tie; equal-timestamp live versions are ordered by content so every device converges),
write locally in one transaction (`mergeIntoLocal`); settings merge the same way as a whole
(last write wins on `settings.updatedAt`, settings with a newer `version` are passed through
untouched); upload only if the merged set or settings differ from Drive, conditional on the downloaded ETag (`If-Match`; a 412 restarts the round). A file with a
newer `schemaVersion` is never overwritten. In the extension only the background syncs: on popup
open, 3 s after a change (`jobs-changed` message), every `sync.syncIntervalMinutes` (default 15)
and on start-up. The web app syncs on load, 3 s after a change, every `syncIntervalMinutes`, on `online` and when a tab returns to the foreground,
under a Web Lock so tabs don't race; its token (GIS, 1 h) needs a click to renew, and sign-out
clears the browser's local copy.
`exportJSON()` writes the same format; `importJSON()` merges it the same way.

Job URLs are stored normalized (`normalizeUrl`), so `getJobByUrl` is an indexed lookup.
