import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  zip: {
    artifactTemplate: 'career-pocket-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'career-pocket-{{version}}-sources.zip',
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
      name: 'Career Pocket',
      description:
        'Track job applications from any job posting. Local-first, synced to your own Google Drive.',
      // Minimal permissions: no host access. `activeTab` grants the current tab only when the user
      // opens the popup, presses the shortcut or uses the context menu; `scripting` then injects
      // the extractor into that tab. `storage` holds the context-menu hand-off to the popup and
      // which reminders were shown; `alarms` runs the ghost check and reminders; `notifications`
      // shows follow-up and interview reminders.
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
      // Pins the Chrome extension ID in development so it matches the OAuth client's item ID.
      // Left out of production builds: the Chrome Web Store rejects packages with a `key`.
      ...(browser === 'chrome' && mode === 'development' && env.WXT_CHROME_EXTENSION_KEY
        ? { key: env.WXT_CHROME_EXTENSION_KEY }
        : {}),
      // A fixed add-on ID keeps Firefox's identity redirect URL stable across installs.
      // `data_collection_permissions` (required by addons.mozilla.org for new add-ons): nothing is
      // sent to the developers or any third party; optional sync writes only to the user's own
      // Google Drive, which they turn on themselves.
      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
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
      commands: {
        'save-job': {
          suggested_key: { default: 'Alt+Shift+S' },
          description: 'Save the job on this page (opens the popup if details are missing)',
        },
      },
    };
  },
});
