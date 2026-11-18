/**
 * Hand-off from the "Save job to Pocket Career" context menu to the popup: the background
 * stores the link, the popup picks it up on open. Kept briefly in extension storage only.
 */
export type PendingLink = { url: string; title: string; at: number };

const KEY = 'pendingLink';
const MAX_AGE_MS = 10 * 60 * 1000;

export async function setPendingLink(link: Omit<PendingLink, 'at'>): Promise<void> {
  await browser.storage.local.set({ [KEY]: { ...link, at: Date.now() } satisfies PendingLink });
}

/** Returns and removes the pending link, if there is a recent one. */
export async function takePendingLink(): Promise<PendingLink | undefined> {
  const { [KEY]: link } = (await browser.storage.local.get(KEY)) as { [KEY]?: PendingLink };
  if (!link) return undefined;
  await browser.storage.local.remove(KEY);
  return Date.now() - link.at < MAX_AGE_MS ? link : undefined;
}
