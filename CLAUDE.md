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
                        page badge, injected by background), picker.content.ts ("pick from page"),
                        autofill.content.ts (Autofill agent, injected into all frames on demand),
                        autofill-button.content.ts (optional on-page button, registered at runtime)
    src/components/     JobPanel (save form + per-page draft, tab following in the sidebar),
                        JobForm, SavedJob, RecentJobs, form.css
    src/lib/draft.ts    form drafts in storage.session (per page URL, 24 h), toolbar "•" badge
    src/lib/tab-draft.ts  writes selected / picked page text into a tab's draft, page toast
    src/lib/open-in.ts  toolbar button opens popup or sidebar (side_panel / sidebar_action)
    src/lib/background.ts  auto-ghosting, reminders (quiet hours, goal nudge, offer deadlines),
                        weekly recap, goal badge, page badge (with Heads up notes)
    src/lib/google-auth.ts launchWebAuthFlow (Web client); getAuthToken on Chrome if only a Chrome client
    src/lib/sync.ts     background sync runner, encryption controller + key store (storage.session)
    src/lib/sync-status.ts  sync status in extension storage (popup and badge read it, no Drive code)
    src/lib/features.ts feature permissions: request on enable, remove on disable, start-up check
                        (sub-toggles with their own permissions too)
    src/lib/autofill*.ts  autofill.ts (popup: inject/scan/fill/undo per frame, button registration),
                        autofill-agent.ts (in-page agent), autofill-page.ts (shadow-DOM UI),
                        autofill-background.ts (tab → job links, Mark as applied, saved answers)
    src/components/AutofillPanel.svelte  preview + fill + undo (lazy, in JobPanel)
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
scripts/generate-readme-cards.ts  `pnpm readme:cards`: the README's store cards as light/dark SVGs
                        (docs/readme/), styled like apps/web/src/lib/StoreGrid.svelte
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
    src/routes/(site)/install/  install guide: one Chromium guide (addresses table, visitor's browser
                        highlighted), Firefox and Safari cards (shown first on those browsers)
    src/lib/session.svelte.ts  sign-in / sign-out shared by /app and /app/settings
    src/lib/google-auth.ts  Google Identity Services token client (loaded only on /app)
    src/lib/sync.svelte.ts  IndexedDB repo, dashboard adapter, sync runner + triggers
    static/_headers     Cloudflare headers; the CSP is a meta tag from vite.config.ts
packages/
  core/                 domain logic, NO UI code
    src/types.ts        Job model, statuses, tombstones
    src/settings.ts     Settings schema + defaults + validation (SETTINGS_SCHEMA), synced vs device
                        keys (DEVICE_KEYS), settings merge
    src/features.ts     feature registry (FEATURES): id, name, description, defaultEnabled,
                        permissions, syncScope, platforms, implemented, subToggles;
                        isFeatureEnabled, isHelperEnabled, isWeeklyRecapEnabled
    src/smart/          Smart helpers, pure: red-flags (Heads up notes, posting dates), duplicates
                        (company/title normalizing, Dice similarity, mergeDuplicateJobs), templates
                        (follow-up templates, placeholders, mailto, needs-follow-up), offers
                        (pay per month/year, compareOffers with a user-typed rate)
    src/autofill/       Autofill. profile.ts + sites.ts in the main entry (profile, saved answers,
                        records, AUTOFILL_ORIGINS); the engine is `@applicliq/core/autofill` (lazy):
                        normalize, fields (synonym table, confidence), format (phone/date/salary),
                        options (pick an option), answers, plan (preview), dom/ (scan + adapters,
                        fill, rules = never-fill, confirm). __fixtures__: real forms per platform
    src/resumes.ts      resume records (sanitize, word count), resumeSyncEnabled, linkResumeLabels
                        (resumeVersion → resumeId migration), pickResume, copyName
    src/match/          Resume match, pure, imported as `@applicliq/core/match` (lazy, not in the
                        main index): skills.json (~1,090 skills with aliases and a category, `!` =
                        strict: capitalized and in context), text (tokens keep C++/C#/.NET/Node.js),
                        dictionary (index, findSkills), sections (required vs nice-to-have per line),
                        keywords ("other keywords", 2–3 word phrases), match (analyzeJob,
                        matchResume, summary). __fixtures__: 5 job descriptions with expected results
    src/insights.ts     response rates, reply times (median), period stats, weekly recap, share
                        card data and post text
    src/import/         job import: csv-parse (delimiter / header detection), fields (column
                        guessing, status values, dates), linkedin (export .zip/.csv, fflate loaded
                        lazily), review (rows → drafts, duplicates, import batches);
                        __fixtures__ holds a synthetic LinkedIn file (never commit a real export)
    src/storage.ts      Dexie DB (jobs, settings) + repository: CRUD, URL/company lookup, settings,
                        import/export
    src/csv.ts          jobsToCsv (spreadsheet export)
    src/draft.ts        save-form Draft, setDraftField (salary text parsing), createDraftStore
    src/reminders.ts    auto-ghost selection, due reminders (follow-up, interview, offer deadline),
                        job summary, goal badge text, weekly times (recap)
    src/merge.ts        mergeJobs: last-write-wins merge, tombstone purge
    src/url.ts          normalizeUrl (strips hash + tracking params) for duplicate detection
    src/validate.ts     sanitizeRecord(s) for untrusted data (Drive file, imports)
    src/sync/           Drive appDataFolder client (fetch, ETags) + sync orchestration;
                        encryption.ts: encrypted sync flows (enable, unlock, change passphrase,
                        reset recovery code, disable), shared by the extension and the website
    src/crypto/         envelope.ts (Web Crypto only: AES-256-GCM, PBKDF2, HKDF, recovery codes,
                        file validation), key-store.ts (unlocked key in IndexedDB or memory)
    src/scrapers/       extractJob(doc, url): JSON-LD > site adapters (sites/) > meta tags;
                        HTML fixtures in __fixtures__ (excluded from Prettier)
  ui/                   shared Svelte components + Tailwind theme
    src/theme.css       @theme tokens; import after `tailwindcss` in each app
    src/components/     Button, StatusBadge, ...
    src/dashboard/      shared Dashboard (list, kanban, detail panel, onboarding) and SyncMenu.
                        smart/: HelpersPanel (needs follow-up, possible duplicates), FollowUpDialog
                        and CompareOffers (both lazy), OfferSection; insights/: InsightsView (lazy),
                        RateBars, ShareCard + share-card.ts (canvas PNG). Talks to
                        storage only through a DashboardAdapter prop, never extension/platform APIs,
                        so the extension page and the web app can both mount it. Pages that render
                        it add `@source` for this folder in their CSS.
    src/settings/       shared SettingsPage (section nav, auto-save). Platform bits come in through a
                        SettingsPlatform prop; extension-only sections are disabled on the web.
                        sections/FeaturesSection: a card per implemented feature, with its
                        sub-toggles; sections/HelpersSection: Smart helpers options and templates
    src/import/         Settings → Import (LinkedIn, CSV mapping, review, undo, history); loaded
                        with a dynamic import. Pages that render settings add `@source` for it
    src/match/          ResumeMatch.svelte (the "Resume match" section: popup, sidebar, job panel;
                        exported as `@applicliq/ui/resume-match`, always loaded with import()),
                        run-match.ts + match.worker.ts (long texts in a web worker). Pages that render
                        it add `@source` for it. sections/ResumesSection: Settings → Resumes
    src/encryption/     Settings → Sync & data → Encryption (EncryptionPanel, lazy), UnlockForm,
                        UnlockDialog (web /app), passphrase fields, recovery code step. Pages that
                        render settings add `@source` for it
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
pnpm readme:cards   # regenerate the README store cards (docs/readme/*.svg) after a store change
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
8. **Every optional feature goes through the feature registry** (`packages/core/src/features.ts`):
   register it (`implemented: false` keeps a planned one hidden and off), make it toggleable in
   Settings → Features, and check it with `isFeatureEnabled(settings, id)`, `prefs.feature(id)`
   in the UI or `repo.isFeatureEnabled(id)`. Its browser permissions go in the manifest as
   `optional_permissions` / `optional_host_permissions` only, are requested from the click that
   turns it on (`permissions.request()`; a refusal leaves it off), and are removed when it is
   turned off (unless another feature or the page badge still needs them). The extension turns a
   feature off at start-up when its permission is gone, and Settings → Features says so. Features
   that need permissions are `syncScope: 'device'`. Load feature code lazily (dynamic `import()`)
   so the popup stays small.
9. **The app was renamed from Career Pocket to AppliCliq.** Identifiers that persist in users'
   browsers or Drive keep the old name and must never change: the IndexedDB name
   (`career-pocket`), the Drive file (`career-pocket.json`, legacy `pocket-career.json`),
   `career-pocket:*` storage keys, notification IDs, the Web Lock name, the ICS UID suffix, the
   Firefox add-on ID (`career-pocket@career-pocket`), the Chrome `key` and the OAuth client IDs.
   The AMO listing slug also still uses the old name for now.

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
  resumeId?: string; // Resume.id (Settings → Resumes)
  resumeVersion?: string; // legacy free-text label, kept when no resume of that name exists
  contact?: { name?: string; email?: string };
  interviewAt?: number;
  followUpAt?: number;
  descriptionSnapshot?: string;
  alternateUrls?: string[]; // other postings of a merged duplicate; getJobByUrl matches them
  offer?: {
    base?: number;
    currency?: string;
    period?: 'month' | 'year';
    bonus?: string;
    equity?: string;
    benefits?: string[];
    startDate?: number;
    deadline?: number;
    pros?: string;
    cons?: string;
  };
  importedAt?: number; // set by an import: when it ran (the "imported" flag)
  importBatchId?: string; // the import that added it, for undo
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};
```

- All timestamps are epoch milliseconds.
- `history` gets a new entry whenever `status` changes (the repository does this).
- `updatedAt` is bumped on every write; it decides merges.

### Imports

`repo.importJobs(drafts)` adds a batch in one transaction, each job with `importBatchId` and
`importedAt`. The date applied becomes `createdAt` and the `applied` history entry; a later status
is recorded at the import time. `repo.undoImport(batchId)` deletes the batch's live jobs as
tombstones (so it syncs); past imports are derived from live jobs (`importBatches`). Imported
applications count toward stats but not toward goals or streaks (`goalAppliedAt`), and the
ghosting clock starts at `importedAt`. Duplicates: same normalized URL, or same company + title
with dates within 3 days. LinkedIn imports use source `linkedin` (the scraper's id).

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
labels, sync, helpers, insights, resumes, autofill, features). It is stored in the `settings` table as two rows: `app` (synced keys) and `device`
(`DEVICE_KEYS`: notification settings, the weekly recap's switch/day/time, the page badge's
on/position/sites and device-scoped feature switches, which never leave the
browser). `helpers` holds the Smart helpers' sub-toggles and options, `notDuplicatePairs` (`idA|idB`,
sorted) and `followUpTemplates`, all synced. Everything read from storage, Drive or a file goes through `sanitizeSettings`, which also
reads the old shape (top-level `theme`/`ghostedAfterDays`, 0 = off). `updatedAt` only moves when a
synced key changes. Status keys never change; `labels.statusLabels` only renames them for display.

### Sync / merge

The Drive file `career-pocket.json` in `appDataFolder` holds
`{ schemaVersion: 2, updatedAt, records, settings }` (2 added `alternateUrls` and `offer`;
version 1 files are read as they are) (`settings` = the synced part; files from
older versions lack it and it is added on the next upload)
(older files and exports used `version: 1`, still read). Sync = download, sanitize,
`mergeJobs(local, remote)` (per id, last write wins by `updatedAt` / `deletedAt`; a tombstone
wins a tie; equal-timestamp live versions are ordered by content so every device converges),
write locally in one transaction (`mergeIntoLocal`); settings merge the same way as a whole
(last write wins on `settings.updatedAt`, settings with a newer `version` are passed through
untouched); upload only if the merged set or settings differ from Drive, conditional on the downloaded ETag (`If-Match`; a 412 restarts the round). A file with a
newer `schemaVersion` is never overwritten. In the extension only the background syncs: on popup
open, 3 s after a change (`jobs-changed` message), every `sync.syncIntervalMinutes` (default 15)
and on start-up. Any file this version can't read (unknown format, newer `schemaVersion`, a
duplicate it can't parse) stops the sync with "Update AppliCliq to keep syncing" and is never
overwritten or deleted. The web app syncs on load, 3 s after a change, every `syncIntervalMinutes`, on `online` and when a tab returns to the foreground,
under a Web Lock so tabs don't race; its token (GIS, 1 h) needs a click to renew, and sign-out
clears the browser's local copy.
`exportJSON()` writes the same format; `importJSON()` merges it the same way.

Job URLs are stored normalized (`normalizeUrl`), so `getJobByUrl` is an indexed lookup (Dexie
version 3 also indexes `*alternateUrls`).

### Encrypted sync

Feature `encryptedSync` (default off, synced, no permissions), switched only from Settings → Sync
& data → Encryption (the Features card links there: both ways need a passphrase). Web Crypto only,
no crypto libraries.

- **Files.** The encrypted data lives in its own file, `applicliq.enc.json`
  (`ENCRYPTED_SYNC_FILE_NAME`), and `career-pocket.json` is replaced by a marker
  `{ schemaVersion: 3, encrypted: true, updatedAt, records: [] }`. Why: released versions only
  ever look at `career-pocket.json` / `pocket-career.json`. They stop on a file they can't read
  (never overwrite it), but if those files were missing they would see an empty Drive and upload
  their jobs in plain text. The marker keeps the file there; its `schemaVersion` 3 is above what
  any of them supports (v1.x: 1, before encryption: 2) and the empty `records` makes them reach
  their "newer version, update to keep syncing" branch instead of "not an AppliCliq file".
- **Mode.** Drive is encrypted when the primary `career-pocket.json` is the marker, or when only
  the encrypted file exists (the marker is recreated). A plain file next to an encrypted one is
  folded in and replaced by the marker, unless its synced settings are newer and say
  `encryptedSync: false` (turned off elsewhere; the encrypted file is a leftover). Encryption on
  locally with an empty Drive is an error, never a plain upload.
- **Format** (`crypto/envelope.ts`): `{ format: 'applicliq-encrypted', version: 1, schemaVersion,
kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt }, wrappedKeys: { passphrase:
{ iv, data }, recovery: { salt, iv, data } }, iv, ciphertext }`, binary as base64. A random
  256-bit data key encrypts the whole plain snapshot (records, tombstones, synced settings) with
  AES-256-GCM and a new 12-byte IV per upload. The key is wrapped (AES-GCM, with AAD naming the
  slot) by a PBKDF2 key from the passphrase (min 10 characters) and by an HKDF key from the
  recovery code (128 random bits, 26 base32 characters + 2 check characters, 7 groups of 4).
  Changing the passphrase or resetting the code only re-wraps the key. `parseEncryptedFile`
  validates everything; a newer `version` or `schemaVersion` stops sync with "update".
- **Keys** (`crypto/key-store.ts`): "Remember on this device" (default) keeps a non-extractable
  `CryptoKey` in IndexedDB `applicliq-keys`; off keeps the raw key in memory only (extension:
  `storage.session`; website: the page, so a reload asks again). "Lock now" and sign-out forget
  it. No key → `SyncError('locked')`: nothing merged or uploaded, local data stays usable; the
  extension shows a 🔒 toolbar badge and "Sync paused · Unlock" in the popup, the website an
  unlock dialog. A stored key that no longer opens the file (encryption set up again) is
  forgotten. Passphrases and recovery codes are never stored, logged or put in errors; forms clear
  them after use.
- **Flows** (`sync/encryption.ts`, `createEncryptionController`): enable syncs plain data first,
  uploads the encrypted file, then writes the marker (ETag-conditional); disable decrypts, merges,
  writes a plain `career-pocket.json` over the marker, deletes the encrypted file. Every Drive
  write is conditional on the ETag just downloaded. Manual test plan:
  [docs/encryption-testing.md](docs/encryption-testing.md).

### Resumes and Resume match

Feature `resumeMatch` (default on, synced, no permissions). Settings saved before it existed
(no `resumes` section) read it as on: the stored `false` was the planned feature's placeholder.

- **Resumes**: Dexie table `resumes` (version 4) `{ id, name, text, createdAt, updatedAt,
deletedAt? }`, tombstones and merge exactly like jobs (`mergeRecords`). Repo: add / update
  (rename, text) / duplicate / delete / restore (undo), `watchResumes`. Settings → Resumes edits
  them; `settings.resumes` = `{ sync: boolean | null, defaultResumeId, ignoredSkills }`, all synced.
- **Sync**: `resumes` in the Drive snapshot (and in the encrypted payload) only when
  `resumeSyncEnabled(settings)`: `resumes.sync`, or when null, whether encrypted sync is on. Off:
  nothing is read from Drive and the next upload leaves them out (removing them). Decided after
  the settings merge. `schemaVersion` stays 2: older versions drop the field when they upload, and
  the next sync from a device with resume sync on puts it back. Exports always include resumes.
- **Migration**: `Job.resumeId` replaces the free-text `resumeVersion`. When a resume is added or
  renamed (or jobs are imported), jobs whose label names it (case-insensitive) are linked and lose
  the label (`linkResumeVersions`); others keep it, shown as "Label from before".
  `labels.resumeVersions` is no longer edited anywhere.
- **Matching** (`@applicliq/core/match`): whole-token matching against the dictionary, longest
  spelling first; strict terms ("Go", "R", "Excel", "Spring") need a capital and context (mid
  sentence, in a list of skills, or before "developer"/"language"…). Headings and inline cues
  ("is a plus", "ideally") mark skills nice-to-have; unclear = required; required anywhere wins.
  Result: required/nice matched and missing, other keywords found/missing, the ignored ones and a
  summary ("Matches 12 of 16 required skills"), never a score. The UI loads the component, the
  matcher and the dictionary lazily; texts over 40k characters go to a web worker
  (`worker.format: 'es'` in both Vite configs).

### Autofill

Feature `autofill` (default off, device, no permissions of its own: "Autofill this form" uses
`activeTab` + `scripting`, already required). Supported: Greenhouse (`job-boards.greenhouse.io`,
`boards.greenhouse.io` (redirects), `job-boards.eu.greenhouse.io`), Lever (`jobs.lever.co`,
`jobs.eu.lever.co`), Ashby (`jobs.ashbyhq.com`), Google Forms (`docs.google.com/forms`),
Microsoft Forms (`forms.office.com`, which redirects to `forms.cloud.microsoft`). `AUTOFILL_ORIGINS`
lists them; other sites are read generically.

- **Data**: Dexie table `autofill` (version 5): one profile row (`id: 'profile'`) and saved answers
  (`kind: 'answer'`), tombstones and merge like resumes. In the Drive snapshot (and encrypted
  payload) as `autofill` only when `settings.autofill.syncProfile` (default off; turning it on
  without encryption shows a warning). Backups include it. EEO answers are never stored:
  `settings.autofill.eeo` is `skip` or `decline`.
- **Flow**: the popup injects the agent into all frames, scans (adapters per platform, generic
  labels otherwise), builds a plan (`buildPlan`: high ≥ 0.75 filled, medium ≥ 0.5 "Suggested"),
  previews it (skippable), fills with native setters + input/change/blur, custom widgets via a
  verified press (`activate`: pointer events, then click only if nothing happened), Undo.
  Never: submit, CAPTCHAs, hidden/honeypot/password/disabled fields, file inputs (pointed at),
  consent/attestation questions, fields with values (unless "Overwrite").
- **Linking / applied**: job boards save the job on Fill; forms link to a saved job
  (`alternateUrls`) or prefill a new one. Fill records tab → job in session storage; the
  confirmation page (`dom/confirm.ts`) asks "Mark as applied?" (or marks it, setting on). Without
  access to see that page, `markAppliedOnFill` (setting) marks it on Fill.
- **Button**: sub-toggle `autofill.showButton` (device key) requests `AUTOFILL_ORIGINS` and makes the
  background register `autofill-button.js` (all frames) with `scripting.registerContentScripts`.
- Manual test plan: [docs/autofill-testing.md](docs/autofill-testing.md).

### Smart helpers and Insights

Both are features (default on) with sub-toggles in `settings.helpers` / `settings.insights`;
check a part with `isHelperEnabled(settings, 'redFlags' | 'duplicates' | 'followUps' | 'offers')`
or `isWeeklyRecapEnabled(settings)`. No new permissions: the page badge's notes use the access it
already has; clipboard and downloads come from clicks. Duplicates: same normalized company
(legal forms stripped), title Dice similarity ≥ 0.8, created within 60 days;
`repo.mergeDuplicates(keepId, otherId)` folds one into the other and tombstones it. Offer
amounts are never converted with live rates. Insights count imported applications, but status
changes an import recorded at import time are not used as reply dates. Insights, the compare
view and the follow-up dialog load with dynamic `import()`.
