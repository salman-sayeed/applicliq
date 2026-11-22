<p align="center"><img src="docs/logo.png" alt="" width="80" /></p>

<h1 align="center">Career Pocket</h1>

<p align="center">A free, open-source job application tracker that lives in your browser.</p>

<p align="center">
  <img src="docs/screenshots/store/dashboard-list.png" alt="The Career Pocket dashboard: a list of job applications with status, location and salary, and one job's details open in a side panel." width="800" />
</p>

## Get it

<a href="https://addons.mozilla.org/en-US/firefox/addon/career-pocket/"><img src="apps/web/src/lib/assets/stores/firefoxbrowser.svg" alt="" width="18" /> Firefox</a> ·
<a href="https://addons.mozilla.org/en-US/firefox/addon/career-pocket/"><img src="apps/web/src/lib/assets/stores/firefoxbrowser.svg" alt="" width="18" /> Firefox for Android</a> ·
<img src="docs/stores/googlechrome-soon.svg" alt="" width="18" /> Chrome (soon) ·
<img src="docs/stores/microsoftedge-soon.svg" alt="" width="18" /> Edge (soon) ·
<img src="docs/stores/opera-soon.svg" alt="" width="18" /> Opera (soon) ·
<img src="docs/stores/safari-soon.svg" alt="" width="18" /> Safari (soon)

Chrome, Brave, Edge or Opera today: follow the
[manual install guide](https://career-pocket.pages.dev/install). No install needed for the
[web dashboard](https://career-pocket.pages.dev/app).

## Features

- Save a job from any posting in one click (or Alt+Shift+S); title, company, location and salary
  fill themselves in.
- Track each application from saved to offer in a list, a kanban board, or stats with weekly goals.
- Follow-up and interview reminders; quiet applications are marked ghosted after three weeks.
- A badge on job pages you already saved, and a note when you've applied to a company before.
- Works offline. Export to JSON or CSV any time.

## Privacy

- Your jobs are stored in your browser. There is no Career Pocket server or account.
- Sync is optional: it uses a hidden app folder in your own Google Drive, which Career Pocket can't
  see outside of.
- No analytics, no tracking, no ads. See the [privacy policy](https://career-pocket.pages.dev/privacy).

## How to use

1. Install the extension and pin it to the toolbar.
2. Open a job posting and click the Career Pocket icon. Check the details and save.
3. Open the dashboard to update statuses, add notes and set reminders.
4. Optional: turn on Google Drive sync in Settings to see your jobs in other browsers and on
   [the website](https://career-pocket.pages.dev/app).

## Development

Requires Node 22+ and pnpm 10.

```bash
git clone https://github.com/salman-sayeed/careerpocket.git
cd careerpocket
pnpm install
pnpm dev:ext   # extension with hot reload (opens Chrome)
pnpm dev:web   # website and web dashboard on http://localhost:5173
```

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm build`     | Build the extension (Chrome) and the website     |
| `pnpm build:ext` | Build the extension for Chrome, Edge and Firefox |
| `pnpm test`      | Unit tests (Vitest)                              |
| `pnpm typecheck` | `tsc -b` + `svelte-check`                        |
| `pnpm lint`      | ESLint                                           |
| `pnpm format`    | Prettier                                         |

```
apps/extension    browser extension (WXT, Svelte 5, Tailwind)
apps/web          website and web dashboard (SvelteKit, static, Cloudflare Pages)
packages/core     data model, storage, merge, Drive sync, job-page scrapers
packages/ui       shared Svelte components and theme
```

Drive sync needs your own OAuth client IDs: see [docs/google-setup.md](docs/google-setup.md).
Store links and their status live in [`apps/web/src/lib/config.ts`](apps/web/src/lib/config.ts);
update the "Get it" row above when a store goes live. [CLAUDE.md](CLAUDE.md) covers the data
model, sync design and project rules.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Support

Career Pocket is free. If it helped you, you can buy me a coffee ☕

- Buy me a coffee: _link coming soon_
- Crypto: _wallet address coming soon_

<!-- Keep these in step with SUPPORT in apps/web/src/lib/config.ts, which the website's Support section reads. -->
