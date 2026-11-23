/**
 * Generates the README's "Get it" cards: SVG images that look like the website's store cards
 * (apps/web/src/lib/StoreGrid.svelte), in a light and a dark version for GitHub's
 * `<picture>` + `prefers-color-scheme`. A README can't use CSS, so the cards are images.
 *
 *   pnpm readme:cards
 *
 * Writes docs/readme/<name>-{light,dark}.svg. Keep STORES in step with apps/web/src/lib/config.ts
 * (that file imports .svg modules, so it can't be imported here).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'apps/web/src/lib/assets/stores');
const OUT = join(ROOT, 'docs/readme');

type Store = { id: string; name: string; icon: string; live: boolean };

const STORES: Store[] = [
  { id: 'firefox', name: 'Firefox Add-ons', icon: 'firefoxbrowser', live: true },
  { id: 'firefox-android', name: 'Firefox for Android', icon: 'firefoxbrowser', live: true },
  { id: 'chrome', name: 'Chrome Web Store', icon: 'googlechrome', live: false },
  { id: 'edge', name: 'Microsoft Edge Add-ons', icon: 'microsoftedge', live: false },
  { id: 'opera', name: 'Opera Add-ons', icon: 'opera', live: false },
  { id: 'safari', name: 'Safari', icon: 'safari', live: false },
];

/** The site's theme tokens (packages/ui/src/theme.css). */
const THEMES = {
  light: {
    surface: '#ffffff',
    muted: '#f4f4f5',
    ink: '#18181b',
    inkMuted: '#71717a',
    line: '#e4e4e7',
    dot: '#10b981',
  },
  dark: {
    surface: '#18181b',
    muted: '#27272a',
    ink: '#f4f4f5',
    inkMuted: '#a1a1aa',
    line: '#3f3f46',
    dot: '#10b981',
  },
} as const;
type Theme = (typeof THEMES)[keyof typeof THEMES];

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const W = 300;
const H = 80;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A store icon (24×24 viewBox) as a nested <svg> at (x, y), `size` px square. */
function icon(name: string, x: number, y: number, size: number): string {
  const src = readFileSync(join(ICONS, `${name}.svg`), 'utf8');
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24">${inner}</svg>`;
}

function card(store: Store, t: Theme): string {
  const dim = store.live ? '' : ' opacity="0.6"';
  const iconFilter = store.live ? '' : ' filter="url(#soon)"';
  const status = store.live
    ? `<circle cx="78" cy="54" r="3" fill="${t.dot}"/>` +
      `<text x="87" y="58.5" font-size="13" fill="${t.inkMuted}">Available</text>`
    : `<g${dim}><rect x="72" y="43" width="88" height="22" rx="11" fill="${t.muted}"/>` +
      `<text x="116" y="58" font-size="12.5" text-anchor="middle" fill="${t.inkMuted}">Coming soon</text></g>`;
  const arrow = store.live
    ? `<path d="M${W - 36} 34h8v8M${W - 28} 34l-11 11" fill="none" stroke="${t.inkMuted}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <title>${escape(store.name)}: ${store.live ? 'available' : 'coming soon'}</title>
  <defs><filter id="soon"><feColorMatrix type="saturate" values="0.4"/></filter></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.surface}" stroke="${t.line}"/>
  <g${dim}${iconFilter}>${icon(store.icon, 18, 20, 40)}</g>
  <text x="72" y="36" font-size="15.5" font-weight="500" fill="${t.ink}"${dim}>${escape(store.name)}</text>
  ${status}
  ${arrow}
</svg>
`;
}

/** An outline button like the site's "Install manually" link. */
function button(label: string, width: number, t: Theme): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44" viewBox="0 0 ${width} 44" font-family="${FONT}">
  <title>${escape(label)}</title>
  <rect x="0.5" y="0.5" width="${width - 1}" height="43" rx="8" fill="${t.surface}" stroke="${t.line}"/>
  <text x="${width / 2}" y="27.5" font-size="14.5" font-weight="500" text-anchor="middle" fill="${t.ink}">${escape(label)}</text>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
for (const [mode, theme] of Object.entries(THEMES)) {
  for (const store of STORES)
    writeFileSync(join(OUT, `${store.id}-${mode}.svg`), card(store, theme));
  writeFileSync(
    join(OUT, `install-manually-${mode}.svg`),
    button('Install manually on Chrome, Brave, Edge or Opera', 380, theme),
  );
  writeFileSync(
    join(OUT, `web-dashboard-${mode}.svg`),
    button('Open the web dashboard →', 230, theme),
  );
}
console.log(`Wrote ${(STORES.length + 2) * 2} cards to docs/readme/`);
