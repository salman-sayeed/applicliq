import { DRAFT_FIELD_LABELS, type DraftField, type ExtractedJob } from '@applicliq/core';
import type { StartPickerMessage } from './messages';
import { showPageToast } from './page-toast';

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

/**
 * Starts "pick from page" in the tab: injects the picker (needs `activeTab`, i.e. the popup or
 * sidebar was opened on this tab) and tells it which field to fill. False if the page refused.
 */
export async function startPicker(tabId: number, field: DraftField): Promise<boolean> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/picker.js'],
    });
    const message: StartPickerMessage = {
      type: 'applicliq:start-picker',
      field,
      label: DRAFT_FIELD_LABELS[field],
    };
    await browser.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}

/** Shows a toast on the page (see `showPageToast`); does nothing where the page refuses. */
export async function showToastInTab(tabId: number, text: string, ok = true): Promise<void> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: showPageToast,
      args: [text, ok],
    });
  } catch {
    // Pages the extension can't script (browser pages, the web store) get no toast.
  }
}
