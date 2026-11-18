import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Pocket Career',
    description:
      'Track job applications from any job posting. Local-first, synced to your own Google Drive.',
    // Minimal permissions: no host access. `activeTab` grants the current tab only when the user
    // opens the popup, presses the shortcut or uses the context menu; `scripting` then injects
    // the extractor into that tab. `storage` holds the context-menu hand-off to the popup.
    permissions: ['activeTab', 'scripting', 'contextMenus', 'storage'],
    commands: {
      'save-job': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Save the job on this page (opens the popup if details are missing)',
      },
    },
  },
});
