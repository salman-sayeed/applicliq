export const SAVE_SHORTCUT_COMMAND = 'save-job';

export const GITHUB_URL = 'https://github.com/salman-sayeed/applicliq';
/** The website (web dashboard, install guide, privacy policy). */
export const SITE_URL = 'https://applicliq.pages.dev';
export const ISSUES_URL = `${GITHUB_URL}/issues/new`;

/**
 * Opens the dashboard extension page in a new tab, optionally on one job's details, on a view
 * (e.g. Insights) or with the introduction shown again.
 */
export async function openDashboard(
  jobId?: string,
  { onboarding = false, view }: { onboarding?: boolean; view?: 'insights' } = {},
): Promise<void> {
  const url = browser.runtime.getURL('/dashboard.html');
  const hash = jobId
    ? `#job=${encodeURIComponent(jobId)}`
    : view
      ? `#view=${view}`
      : onboarding
        ? '#onboarding'
        : '';
  await browser.tabs.create({ url: `${url}${hash}` });
}

/**
 * Opens the settings page (the extension's options page), reusing its tab if open. With a
 * `section` (e.g. 'import'), opens a tab on that section.
 */
export async function openSettings(section?: string): Promise<void> {
  if (!section) return browser.runtime.openOptionsPage();
  const url = browser.runtime.getURL('/options.html');
  await browser.tabs.create({ url: `${url}#${encodeURIComponent(section)}` });
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
