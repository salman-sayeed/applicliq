# Contributing to Career Pocket

Thanks for helping! Bug reports, site support for new job boards, fixes and docs are all welcome.

## Ground rules

Career Pocket stays small, private and offline-first. Before you start, read the **Rules** in
[CLAUDE.md](CLAUDE.md#rules). In short:

- **Privacy:** user data goes nowhere except the user's own Google Drive. No telemetry,
  analytics, third-party APIs, remote fonts or remote scripts.
- **Offline-first:** IndexedDB is the source of truth; every feature works with no network.
- **Small bundle, few dependencies:** prefer platform APIs. A new runtime dependency needs a strong
  reason (open an issue first). Dev-only tooling is fine.
- **Minimal permissions:** add an extension permission only when a feature needs it, and explain
  why in `apps/extension/wxt.config.ts` and [docs/store-listing.md](docs/store-listing.md).
- **Accessible:** everything works with the keyboard, has a visible focus ring and a label, and
  respects reduced motion (use the transitions from `packages/ui/src/motion.ts`, not
  `svelte/transition` directly). Animations stay under 200 ms.
- `packages/core` has no UI or framework code.

For anything larger than a bug fix, please open an issue first so we can agree on the approach.

## Setup

You need Node 22+ (see `.node-version`) and pnpm 10.

```bash
git clone https://github.com/salman-sayeed/careerpocket.git
cd careerpocket
pnpm install
pnpm dev:ext      # extension in a fresh Chrome profile, with hot reload
pnpm dev:web      # web dashboard on http://localhost:5173
```

Firefox: `pnpm --filter @career-pocket/extension dev:firefox` (needs Firefox installed).

Google Drive sync is optional for development. To try it, create your own OAuth client as described
in [docs/google-setup.md](docs/google-setup.md) and put its ID in `apps/extension/.env` and
`apps/web/.env` (copy the `.env.example` files). Never commit `.env` files.

## Before you open a pull request

```bash
pnpm format       # Prettier
pnpm lint
pnpm typecheck
pnpm test
```

CI runs the same checks (plus `pnpm format:check` and `pnpm build`) on every pull request.

- Keep pull requests focused: one fix or feature each.
- Add or update tests in `packages/core` for domain logic (merge, sync, scrapers, reminders).
- Check the build size output when you add code (`pnpm build`) and mention notable changes in the
  PR.
- For UI changes, add a screenshot and say how you tested keyboard navigation.

### Adding support for a job site

Scrapers read the current page only and never make network requests.

1. Add an adapter in `packages/core/src/scrapers/sites/` and register it in `sites/index.ts`.
2. Save a trimmed copy of a real posting's HTML in `packages/core/src/scrapers/__fixtures__/`
   (remove personal data).
3. Add a test that runs `extractJob` on the fixture.

JSON-LD (`JobPosting`) is tried first, so many sites need no adapter at all.

## Releasing

Maintainers only.

1. Make sure `main` is green.
2. Tag the release (the tag sets the extension version):

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

3. The **Release** workflow checks the code, builds the Chrome, Edge and Firefox zips (plus the
   Firefox sources zip, and the Chrome zip again as `career-pocket-chromium.zip`, which the
   website's manual install guide links to) and attaches them to a new GitHub Release with generated notes.
4. Upload the zips to the stores using [docs/store-listing.md](docs/store-listing.md).

The workflow reads the optional repository secrets `WXT_GOOGLE_CLIENT_ID_WEB` and
`WXT_GOOGLE_CLIENT_ID_CHROME` (Settings → Secrets and variables → Actions). Without them the
extension builds with sync turned off.

The web app deploys to Cloudflare Pages automatically on every push to `main`
([docs/deploy-web.md](docs/deploy-web.md)).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
