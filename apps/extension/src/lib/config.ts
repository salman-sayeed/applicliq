export const SAVE_SHORTCUT_COMMAND = 'save-job';

export const GITHUB_URL = 'https://github.com/salman-sayeed/careerpocket';
export const ISSUES_URL = `${GITHUB_URL}/issues/new`;

/**
 * Opens the dashboard extension page in a new tab, optionally on one job's details or with the
 * introduction shown again.
 */
export async function openDashboard(jobId?: string, { onboarding = false } = {}): Promise<void> {
  const url = browser.runtime.getURL('/dashboard.html');
  const hash = jobId ? `#job=${encodeURIComponent(jobId)}` : onboarding ? '#onboarding' : '';
  await browser.tabs.create({ url: `${url}${hash}` });
}

/** Opens the settings page (the extension's options page), reusing its tab if open. */
export async function openSettings(): Promise<void> {
  await browser.runtime.openOptionsPage();
}

/** The save shortcut as the browser shows it, e.g. "Alt+Shift+S"; undefined if unset. */
export async function getSaveShortcut(): Promise<string | undefined> {
  const commands = await browser.commands.getAll();
  return commands.find((c) => c.name === SAVE_SHORTCUT_COMMAND)?.shortcut || undefined;
}

/** Opens the browser's own keyboard shortcut settings (they can't be changed from code). */
export async function openShortcutSettings(): Promise<void> {
  const commands = browser.commands as { openShortcutSettings?: () => Promise<void> };
  if (commands.openShortcutSettings) return commands.openShortcutSettings();
  const edge = import.meta.env.BROWSER === 'edge' || navigator.userAgent.includes('Edg/');
  await browser.tabs.create({
    url: edge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts',
  });
}
