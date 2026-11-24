import { PERIOD_PHRASES, type ShareCardData } from '@applicliq/core';

/**
 * Draws the share card (a PNG made in the browser, nothing uploaded). Numbers only: company
 * names and job titles are never part of `ShareCardData`.
 */

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;
export const SHARE_SITE = 'applicliq.pages.dev';

export type ShareTheme = 'light' | 'dark';

const THEMES = {
  light: { bg: '#ffffff', panel: '#f4f4f5', ink: '#18181b', muted: '#71717a', line: '#e4e4e7' },
  dark: { bg: '#18181b', panel: '#27272a', ink: '#f4f4f5', muted: '#a1a1aa', line: '#3f3f46' },
} as const;
const ACCENT = { light: '#406db5', dark: '#7b9dd6' } as const;
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Loads the logo; resolves undefined if it can't (the card is drawn without it). */
export function loadLogo(url: string | undefined): Promise<HTMLImageElement | undefined> {
  if (!url) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

export function drawShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  { theme = 'light', logo }: { theme?: ShareTheme; logo?: HTMLImageElement } = {},
): void {
  const W = SHARE_CARD_WIDTH;
  const H = SHARE_CARD_HEIGHT;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const c = THEMES[theme];
  const accent = ACCENT[theme];

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 10);

  const pad = 72;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = c.muted;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText('MY JOB SEARCH', pad, 108);
  ctx.fillStyle = c.ink;
  ctx.font = `700 56px ${FONT}`;
  const phrase = PERIOD_PHRASES[data.period];
  ctx.fillText(phrase.charAt(0).toUpperCase() + phrase.slice(1), pad, 172);

  // Four tiles: applications, responses, interviews, offers.
  const tiles: [string, number][] = [
    ['Applications', data.stats.applications],
    ['Responses', data.stats.responses],
    ['Interviews', data.stats.interviews],
    ['Offers', data.stats.offers],
  ];
  const gap = 24;
  const tileW = (W - pad * 2 - gap * 3) / 4;
  const tileY = 218;
  const tileH = 170;
  tiles.forEach(([label, value], i) => {
    const x = pad + i * (tileW + gap);
    ctx.fillStyle = c.panel;
    roundRect(ctx, x, tileY, tileW, tileH, 20);
    ctx.fill();
    ctx.fillStyle = i === 0 ? accent : c.ink;
    ctx.font = `700 76px ${FONT}`;
    ctx.fillText(String(value), x + 28, tileY + 100);
    ctx.fillStyle = c.muted;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(label, x + 28, tileY + 142);
  });

  // Streak and goal, side by side under the tiles.
  const y = tileY + tileH + 64;
  let x = pad;
  ctx.font = `600 30px ${FONT}`;
  if (data.streak !== undefined) {
    ctx.fillStyle = c.ink;
    const text = `🔥 ${data.streak}-day streak`;
    ctx.fillText(text, x, y);
    x += ctx.measureText(text).width + 56;
  }
  if (data.goal) {
    const label = `${data.goal.count} / ${data.goal.goal} ${data.period === 'week' ? 'weekly' : 'monthly'} goal`;
    ctx.fillStyle = c.ink;
    ctx.fillText(label, x, y);
    const barX = x + ctx.measureText(label).width + 24;
    const barW = Math.max(0, Math.min(320, W - pad - barX));
    if (barW > 40) {
      ctx.fillStyle = c.line;
      roundRect(ctx, barX, y - 22, barW, 16, 8);
      ctx.fill();
      const ratio = Math.min(1, data.goal.goal > 0 ? data.goal.count / data.goal.goal : 0);
      if (ratio > 0) {
        ctx.fillStyle = accent;
        roundRect(ctx, barX, y - 22, Math.max(16, barW * ratio), 16, 8);
        ctx.fill();
      }
    }
  }

  // Footer: logo and site.
  const footY = H - 56;
  ctx.fillStyle = c.line;
  ctx.fillRect(pad, footY - 44, W - pad * 2, 2);
  let fx = pad;
  if (logo) {
    ctx.drawImage(logo, fx, footY - 26, 36, 36);
    fx += 48;
  }
  ctx.fillStyle = c.ink;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText('AppliCliq', fx, footY);
  ctx.fillStyle = c.muted;
  ctx.font = `500 24px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(SHARE_SITE, W - pad, footY);
  ctx.textAlign = 'left';
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png'),
  );
}
