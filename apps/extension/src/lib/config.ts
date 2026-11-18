export const SAVE_SHORTCUT_COMMAND = 'save-job';

/** Opens the dashboard extension page in a new tab, optionally on one job's details. */
export async function openDashboard(jobId?: string): Promise<void> {
  const url = browser.runtime.getURL('/dashboard.html');
  await browser.tabs.create({ url: jobId ? `${url}#job=${encodeURIComponent(jobId)}` : url });
}
