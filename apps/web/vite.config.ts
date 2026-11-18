import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/** Google Identity Services (sign-in on /app) is the only remote origin the site talks to. */
const GIS = 'https://accounts.google.com/gsi/';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
      // Static files for Cloudflare Pages; unknown paths get the SPA 404 page.
      adapter: adapter({ fallback: '404.html' }),
      // Emitted as a <meta> tag with hashes of SvelteKit's inline scripts. `frame-ancestors`
      // can't go in a meta tag, so it's in static/_headers.
      csp: {
        mode: 'hash',
        directives: {
          'default-src': ['self'],
          'script-src': ['self', `${GIS}client`],
          'style-src': ['self', 'unsafe-inline', `${GIS}style`],
          'connect-src': [
            'self',
            'https://www.googleapis.com',
            'https://oauth2.googleapis.com',
            'https://accounts.google.com',
          ],
          'frame-src': [GIS],
          'img-src': ['self', 'data:'],
          'font-src': ['self'],
          'object-src': ['none'],
          'base-uri': ['self'],
          'form-action': ['self'],
        },
      },
    }),
  ],
  // Workspace packages ship TypeScript source, so Vite must transform them for SSR/prerender too.
  ssr: {
    noExternal: [/^@pocket-career\//],
  },
});
