import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

const ICONS = {
  16: '/icon/16.png',
  32: '/icon/32.png',
  48: '/icon/48.png',
  96: '/icon/96.png',
  128: '/icon/128.png',
};

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// Public half of the project's extension key. With it in the manifest, every unpacked install
// (the GitHub release zips, `pnpm dev`) gets the same ID, kijhchopbdlfbjogdeclceledkbbjkbj, so
// one Google redirect URI covers everyone. It is public by design; the private .pem never leaves
// the maintainer's machine. Forks can use their own with WXT_CHROME_EXTENSION_KEY.
const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3ZThMsiwnSJbuni2hvAgTEftbnef4VmxG0RpPVGwztG/l2DXObe0Vc0CqL6Jt05HDRPp91J/nccIVV12WeH6Uqe0PfCZ94FWyCIAXAs2F1rVM4c2evCxoSv5P+o+ti6y+sCJw03Pk6Q5t7kcdtbVQdUSB5CTq/1KmWg38zwlHFv5NR2VI/paHldgup+FK7C9ItoYovoYKpi2AAntsrxD+Hiz1XEdfC2hVOzb6i28HnyaAzUp4kbzPGphFcHh1NsIj+A3WDFFNAJYQ9ZeXqljGOCB7ptcLW2S5J6ZqMn3Jl3LMhJJrQBpvYrkTXDu9M5nC8kD2ux/RePkrRGVZCjoOwIDAQAB';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  zip: {
    artifactTemplate: 'applicliq-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'applicliq-{{version}}-sources.zip',
    // addons.mozilla.org reviewers rebuild the add-on from this zip, so it holds the whole
    // monorepo (shared packages, lockfile), minus build output and local secrets.
    sourcesRoot: '../..',
    includeSources: [
      '**/*',
      '.gitignore',
      '.node-version',
      '.npmrc',
      '.prettierrc',
      'apps/extension/.env.example',
    ],
    excludeSources: [
      '**/node_modules/**',
      '**/.env',
      '**/.env.*.local',
      '**/.env.local',
      '.claude/**',
      '.github/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/.svelte-kit/**',
      '**/build/**',
      '**/*.zip',
      '**/*.pem',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser, manifestVersion, mode }) => {
    // OAuth client IDs etc. come from apps/extension/.env (see .env.example and
    // docs/google-setup.md). Without them the extension builds fine and sync stays off.
    const env = loadEnv(mode, process.cwd(), 'WXT_');
    return {
      name: 'AppliCliq',
      short_name: 'AppliCliq',
      description:
        'Track job applications from any job posting. Local-first, synced to your own Google Drive.',
      // Minimal permissions: no host access. `activeTab` grants the current tab only when the user
      // opens the popup, presses the shortcut or uses the context menu; `scripting` then injects
      // the extractor (and the "pick from page" helper) into that tab. `storage` holds the
      // context-menu hand-off to the popup, form drafts (session storage) and which reminders
      // were shown; `alarms` runs the ghost check and reminders; `notifications` shows
      // follow-up and interview reminders. WXT adds `sidePanel` on Chromium for the sidebar.
      // `identity` signs in to Google for Drive sync (drive.appdata scope only).
      permissions: [
        'activeTab',
        'scripting',
        'contextMenus',
        'storage',
        'alarms',
        'notifications',
        'identity',
      ],
      // Chrome signs in with `identity.getAuthToken`, which reads the client ID from here. Edge
      // and Firefox use `launchWebAuthFlow` with the web client ID instead (read in the code).
      ...(browser === 'chrome' && env.WXT_GOOGLE_CLIENT_ID_CHROME
        ? { oauth2: { client_id: env.WXT_GOOGLE_CLIENT_ID_CHROME, scopes: [DRIVE_SCOPE] } }
        : {}),
      // Pins the Chromium extension ID (Chrome, Edge, Brave...) so it matches the Google redirect
      // URI. Store uploads leave it out (WXT_STORE_BUILD=true): a store assigns its own ID.
      ...(browser !== 'firefox' && env.WXT_STORE_BUILD !== 'true'
        ? { key: env.WXT_CHROME_EXTENSION_KEY || EXTENSION_KEY }
        : {}),
      // A fixed add-on ID keeps Firefox's identity redirect URL stable across installs.
      // `data_collection_permissions` (required by addons.mozilla.org for new add-ons): nothing is
      // sent to the developers or any third party; optional sync writes only to the user's own
      // Google Drive, which they turn on themselves.
      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
                // Kept from the Career Pocket days: renaming it would make Firefox treat it as a new add-on and change the
                // Google redirect URL.
                id: 'career-pocket@career-pocket',
                data_collection_permissions: { required: ['none'] },
              },
            },
          }
        : {}),
      // All-sites access only for the opt-in saved-job page badge (dashboard toggle): it lets the
      // background see tab URLs and inject the badge into pages of saved jobs. MV2 (Firefox) has
      // no `optional_host_permissions`; origins go in `optional_permissions` there.
      ...(manifestVersion === 3
        ? { optional_host_permissions: ['<all_urls>'] }
        : { optional_permissions: ['<all_urls>'] }),
      // Generated from brand/ by scripts/generate-icons.ts (`pnpm icons`). The toolbar icon is set
      // on the popup entrypoint (popup/index.html), which WXT writes to `action` (MV3) or
      // `browser_action` (Firefox MV2).
      icons: ICONS,
      commands: {
        'save-job': {
          suggested_key: { default: 'Alt+Shift+S' },
          description: 'Save the job on this page (opens the popup if details are missing)',
        },
      },
    };
  },
});
