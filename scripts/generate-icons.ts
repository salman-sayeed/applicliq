/**
 * Generates every AppliCliq icon and image from the source logo in brand/.
 *
 *   pnpm icons
 *
 * Source: brand/applicliq-logo.svg if it exists, otherwise brand/applicliq-logo.png (a large,
 * transparent PNG). The transparent margin is trimmed first, so the mark fills each icon.
 * Outputs are committed; run this again only when the logo changes.
 *
 * - Extension: apps/extension/public/icon/{16,32,48,96,128}.png (manifest + toolbar icons)
 * - Website (apps/web/static): favicon.svg, favicon.ico (16/32/48), apple-touch-icon.png (180),
 *   icon-192.png, icon-512.png, icon-maskable-192.png, icon-maskable-512.png,
 *   manifest.webmanifest, og-image.png (1200x630)
 * - Logo images: apps/web/src/lib/assets/logo.png (site/app headers), docs/logo.png (README)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_SOURCE = join(ROOT, 'brand/applicliq-logo.svg');
const PNG_SOURCE = join(ROOT, 'brand/applicliq-logo.png');
const EXT_ICONS = join(ROOT, 'apps/extension/public/icon');
const WEB_STATIC = join(ROOT, 'apps/web/static');

/** Colours picked from the logo (see packages/ui/src/theme.css). */
const BRAND_BLUE = '#406db5';
const BRAND_CRIMSON = '#bd4961';
const INK = '#18181b';
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const NAME = 'AppliCliq';
const TAGLINE = 'Job Application Tracker';

/** The logo with its transparent margin trimmed, as a high-resolution PNG buffer. */
async function loadMark(): Promise<Buffer> {
  const input = existsSync(SVG_SOURCE)
    ? sharp(readFileSync(SVG_SOURCE), { density: 600 })
    : sharp(readFileSync(PNG_SOURCE));
  return input.trim({ threshold: 1 }).png().toBuffer();
}

/**
 * A square icon: the mark centred inside `size`, with `padding` (fraction of the size) on every
 * side, over `background`.
 */
async function square(
  mark: Buffer,
  size: number,
  { padding = 0.04, background = CLEAR } = {},
): Promise<Buffer> {
  const inner = Math.max(1, Math.round(size * (1 - 2 * padding)));
  const fitted = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: CLEAR, kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: fitted, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An .ico file with PNG-encoded images (supported by every current browser). */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

function write(path: string, data: Buffer | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(
    `  ${path.slice(ROOT.length + 1)} (${(Buffer.byteLength(data) / 1024).toFixed(1)} KB)`,
  );
}

async function main(): Promise<void> {
  const mark = await loadMark();
  console.log('Generating icons from', existsSync(SVG_SOURCE) ? SVG_SOURCE : PNG_SOURCE);

  // Extension (manifest `icons` and the toolbar `action.default_icon`). Small sizes get almost no
  // padding so the mark stays legible at 16 px.
  for (const size of [16, 32, 48, 96, 128]) {
    write(
      join(EXT_ICONS, `${size}.png`),
      await square(mark, size, { padding: size <= 32 ? 0 : 0.04 }),
    );
  }

  // Favicons.
  if (existsSync(SVG_SOURCE)) {
    write(join(WEB_STATIC, 'favicon.svg'), readFileSync(SVG_SOURCE));
  } else {
    // No vector logo yet: an SVG wrapper around a crisp PNG, so browsers that prefer
    // `favicon.svg` still get a sharp icon at any zoom level up to 4x.
    const png = await square(mark, 128, { padding: 0 });
    write(
      join(WEB_STATIC, 'favicon.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
        `<image width="32" height="32" href="data:image/png;base64,${png.toString('base64')}"/>` +
        `</svg>\n`,
    );
  }
  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, png: await square(mark, size, { padding: 0 }) });
  }
  write(join(WEB_STATIC, 'favicon.ico'), ico(icoImages));

  // iOS home screen: opaque (iOS fills transparency with black), with breathing room.
  write(
    join(WEB_STATIC, 'apple-touch-icon.png'),
    await square(mark, 180, { padding: 0.12, background: WHITE }),
  );

  // Web app manifest icons. Maskable ones keep the mark inside the central 80 % safe zone.
  for (const size of [192, 512]) {
    write(join(WEB_STATIC, `icon-${size}.png`), await square(mark, size, { padding: 0.06 }));
    write(
      join(WEB_STATIC, `icon-maskable-${size}.png`),
      await square(mark, size, { padding: 0.2, background: WHITE }),
    );
  }
  const manifest = {
    name: `${NAME} – ${TAGLINE}`,
    short_name: NAME,
    description:
      'A free, private job application tracker. Your data stays in your browser and your own Google Drive.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: BRAND_BLUE,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  write(join(WEB_STATIC, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

  // Open Graph / social preview image.
  const W = 1200;
  const H = 630;
  const LOGO = 260;
  const logo = await square(mark, LOGO, { padding: 0 });
  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#ffffff"/>
      <rect y="${H - 14}" width="${W / 2}" height="14" fill="${BRAND_CRIMSON}"/>
      <rect x="${W / 2}" y="${H - 14}" width="${W / 2}" height="14" fill="${BRAND_BLUE}"/>
      <text x="${W / 2}" y="470" text-anchor="middle" font-size="64" fill="${INK}"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"><tspan font-weight="700"
        >${NAME}</tspan><tspan dx="18" font-weight="400" fill="#52525b">– ${TAGLINE}</tspan></text>
    </svg>`,
  );
  write(
    join(WEB_STATIC, 'og-image.png'),
    await sharp(text)
      .composite([{ input: logo, left: (W - LOGO) / 2, top: 110 }])
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  // Logo images used in the site/app headers and the README.
  write(join(ROOT, 'apps/web/src/lib/assets/logo.png'), await square(mark, 128, { padding: 0 }));
  write(join(ROOT, 'docs/logo.png'), await square(mark, 256, { padding: 0 }));
}

await main();
