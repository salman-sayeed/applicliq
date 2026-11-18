import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ manifestVersion }) => ({
    name: 'Pocket Career',
    description:
      'Track job applications from any job posting. Local-first, synced to your own Google Drive.',
    // Minimal permissions: no host access. `activeTab` grants the current tab only when the user
    // opens the popup, presses the shortcut or uses the context menu; `scripting` then injects
    // the extractor into that tab. `storage` holds the context-menu hand-off to the popup and
    // which reminders were shown; `alarms` runs the ghost check and reminders; `notifications`
    // shows follow-up and interview reminders.
    permissions: ['activeTab', 'scripting', 'contextMenus', 'storage', 'alarms', 'notifications'],
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
  }),
});
