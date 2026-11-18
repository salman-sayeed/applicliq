/**
 * Where "Open dashboard" points. Set `WXT_DASHBOARD_URL` (e.g. in `.env.production`) to the
 * deployed Cloudflare Pages URL; dev builds default to the local SvelteKit server.
 */
export const DASHBOARD_URL: string = import.meta.env.WXT_DASHBOARD_URL || 'http://localhost:5173/';

export const SAVE_SHORTCUT_COMMAND = 'save-job';
