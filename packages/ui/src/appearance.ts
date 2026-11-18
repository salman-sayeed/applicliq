import type { Settings } from '@pocket-career/core';

type Appearance = Settings['appearance'];

const CACHE_KEY = 'pocket-career:appearance';

/**
 * Puts the appearance settings on <html> (see theme.css) and remembers them, so the next page
 * load can apply them before the settings come out of IndexedDB (no flash of the wrong theme).
 */
export function applyAppearance(appearance: Appearance, root = document.documentElement): void {
  const { theme, accentColor, reduceMotion, density } = appearance;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.dataset.accent = accentColor;
  root.dataset.density = density;
  if (reduceMotion) root.dataset.reduceMotion = '';
  else delete root.dataset.reduceMotion;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage unavailable: the theme still applies once settings load.
  }
}

/** Applies the appearance from the last visit, if known. Call before mounting. */
export function applyCachedAppearance(root = document.documentElement): void {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Appearance | null;
    if (cached && typeof cached === 'object') applyAppearance(cached, root);
  } catch {
    // Nothing cached.
  }
}

/** Whether animations should run (setting and system preference). */
export function motionAllowed(appearance: Appearance): boolean {
  if (appearance.reduceMotion) return false;
  return !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
