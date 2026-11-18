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
    // Keep permissions minimal; add `identity` / `activeTab` when sync and scraping land.
    permissions: ['storage'],
  },
});
