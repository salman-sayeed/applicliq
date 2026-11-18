# Pocket Career

A free, open-source, lightweight job application tracker.

- **Browser extension** (Chrome, Edge, Firefox): save a job posting from the page you're on and
  track it from _saved_ to _offer_.
- **Web dashboard**: a static site to review and manage everything you've saved.
- **Private by design**: no account, no server, no tracking. Your data is stored in your browser
  (IndexedDB) and synced to a hidden app folder in **your own** Google Drive. Nothing is sent
  anywhere else.

> Status: early development. The extension popup and dashboard are placeholders.

## Install

The extension isn't in the browser stores yet. Until it is, build it from source (see
[Getting started](#getting-started)) and load it unpacked. The web dashboard needs no install.

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
pnpm --filter @pocket-career/extension build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select
`apps/extension/.output/chrome-mv3`.

Other browsers: `pnpm build:ext` builds Chrome, Edge (`.output/edge-mv3`) and Firefox
(`.output/firefox-mv2`). Use `pnpm --filter @pocket-career/extension zip` (or `zip:firefox`,
`zip:edge`) for store uploads.

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

Issues and pull requests are welcome. Please keep the project's rules in mind: small bundle, no
heavy dependencies, offline-first, and no user data leaves the user's devices except to their own
Google Drive. Run `pnpm lint && pnpm typecheck && pnpm test` before opening a PR.

## License

[MIT](LICENSE)
