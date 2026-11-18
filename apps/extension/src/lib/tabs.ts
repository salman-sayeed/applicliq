import type { ExtractedJob } from '@pocket-career/core';

/** `action` in MV3, `browserAction` in Firefox MV2. */
export const actionApi = browser.action ?? browser.browserAction;

/** Pages the extension can read and save. */
export function isSavableUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//.test(url);
}

export async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Runs `extractJob` in the tab through the on-demand content script. Undefined when the page
 * cannot be scripted (browser pages, the web store, PDFs) or extraction failed.
 */
export async function extractFromTab(tabId: number): Promise<ExtractedJob | undefined> {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/extract.js'],
    });
    return (injection?.result as ExtractedJob | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Opens the popup; false where the browser refuses (e.g. no user gesture in Firefox). */
export async function openPopup(): Promise<boolean> {
  try {
    await actionApi.openPopup();
    return true;
  } catch {
    return false;
  }
}

/** Shows a short badge on the toolbar icon, cleared after `ms` (or kept when `ms` is 0). */
export async function flashBadge(text: string, color: string, title?: string, ms = 2500) {
  await actionApi.setBadgeBackgroundColor({ color });
  await actionApi.setBadgeText({ text });
  if (title) await actionApi.setTitle({ title });
  if (ms) setTimeout(() => void clearBadge(), ms);
}

export async function clearBadge() {
  await actionApi.setBadgeText({ text: '' });
  await actionApi.setTitle({ title: 'Pocket Career' });
}

/** Text of the link with this href in the tab (Chrome's context menu doesn't provide it). */
export async function readLinkText(tabId: number, href: string): Promise<string> {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      args: [href],
      func: (url: string) => {
        const link = [...document.querySelectorAll('a[href]')].find(
          (a) => (a as HTMLAnchorElement).href === url,
        );
        return (link?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
      },
    });
    return typeof injection?.result === 'string' ? injection.result : '';
  } catch {
    return '';
  }
}
