<p align="center"><img src="docs/logo.png" alt="" width="96" /></p>

# Career Pocket

<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/career-pocket/"><img src="https://img.shields.io/badge/Get_the_add--on_for_Firefox-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Get the add-on for Firefox"></a>
</p>
<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/career-pocket/"><img src="https://img.shields.io/amo/v/career-pocket" alt="Firefox Add-ons version"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/career-pocket/"><img src="https://img.shields.io/amo/users/career-pocket" alt="Firefox Add-ons users"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/career-pocket/"><img src="https://img.shields.io/amo/rating/career-pocket" alt="Firefox Add-ons rating"></a>
</p>

A free, open-source, lightweight job application tracker.

- **Browser extension** (Chrome, Edge, Firefox): save a job posting from the page you're on and
  track it from _saved_ to _offer_.
- **Web dashboard**: a static site to review and manage everything you've saved.
- **Private by design**: no account, no server, no tracking. Your data is stored in your browser
  (IndexedDB) and synced to a hidden app folder in **your own** Google Drive. Nothing is sent
  anywhere else.

## Install

- **Web dashboard:** https://career-pocket.pages.dev (no install).
- **Extension:** download the Chrome, Edge or Firefox zip from the latest
  [GitHub Release](https://github.com/salman-sayeed/careerpocket/releases) and load it unpacked,
  or build it from source (see [Getting started](#getting-started)).
  - Chrome, Brave, Edge and other Chromium browsers: unzip the `-chrome.zip` (or `-edge.zip`),
    open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the
    unzipped folder. These zips pin the extension ID, so Google Drive sync works.
  - Firefox: install it from
    [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/career-pocket/).

## How it fits together

One codebase, two things you ship:

```
                 packages/core  (data model, storage, merge, Drive sync, scrapers)
                 packages/ui    (shared components + theme)
                    │                         │
        ┌───────────┘                         └───────────┐
        ▼                                                 ▼
 apps/extension                                     apps/web
 installed from the Chrome / Edge / Firefox         static site on Cloudflare Pages
 stores; saves jobs while you browse                full dashboard in any browser
        │                                                 │
        └──────────► your Google Drive (appDataFolder) ◄──┘
```

- The **extension** and the **website** are built from the same repo and share the same code for
  data, sync and UI, so they always agree on the data format.
- They are published separately: the extension goes to the browser stores, the website to
  Cloudflare Pages.
- They don't talk to each other or to any server of ours. Each keeps its own local copy
  (IndexedDB) and both sync through the user's own Google Drive, so a job saved in the extension
  shows up on the website after sign-in, and vice versa.
- The website works on its own (e.g. on a phone or a computer without the extension); the
  extension adds one-click saving from job pages.

## Getting started

Requires Node 22+ and pnpm 10.

```bash
git clone https://github.com/salman-sayeed/careerpocket.git
cd careerpocket
pnpm install
```

### Extension

```bash
pnpm dev:ext
```

This starts WXT in dev mode and opens Chrome with the extension loaded. To load a production
build manually instead:

```bash
pnpm --filter @career-pocket/extension build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select
`apps/extension/.output/chrome-mv3`.

Other browsers: `pnpm build:ext` builds Chrome, Edge (`.output/edge-mv3`) and Firefox
(`.output/firefox-mv2`). Use `pnpm --filter @career-pocket/extension zip` (or `zip:firefox`,
`zip:edge`) for store uploads; tagging a version does this in CI and publishes a GitHub Release
(see [CONTRIBUTING.md](CONTRIBUTING.md#releasing)).

### Web dashboard

```bash
pnpm dev:web
```

Open http://localhost:5173. `pnpm build` writes the static site to `apps/web/build`. For Drive
sync, put the Web OAuth client ID in `apps/web/.env` (see [docs/google-setup.md](docs/google-setup.md)).

Deploying to Cloudflare Pages: see [docs/deploy-web.md](docs/deploy-web.md).

## Scripts

| Command          | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev:ext`   | Extension dev mode with hot reload             |
| `pnpm dev:web`   | Dashboard dev server                           |
| `pnpm build`     | Build the extension (Chrome) and the dashboard |
| `pnpm build:ext` | Build the extension for Chrome, Edge, Firefox  |
| `pnpm test`      | Unit tests (Vitest)                            |
| `pnpm typecheck` | `tsc -b` + `svelte-check`                      |
| `pnpm lint`      | ESLint                                         |
| `pnpm format`    | Prettier                                       |

## Project layout

```
apps/extension    WXT + Svelte 5 + Tailwind v4 browser extension
apps/web          SvelteKit (adapter-static) dashboard
packages/core     types, IndexedDB storage (Dexie), merge, Drive sync, scrapers
packages/ui       shared Svelte components and Tailwind theme
```

See [CLAUDE.md](CLAUDE.md) for the data model, sync design and project rules.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the
project's rules, how to add support for a job site, and how releases work.

## License

[MIT](LICENSE)
