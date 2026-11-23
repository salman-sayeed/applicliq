import type { OpenInMode } from '@applicliq/core';
import { actionApi } from './tabs';

/** Firefox's `sidebarAction` (not in the Chromium-based types). */
type SidebarAction = { open(): Promise<void>; toggle?(): Promise<void> };

const sidebarAction = (browser as unknown as { sidebarAction?: SidebarAction }).sidebarAction;
const sidePanel = (browser as Partial<Pick<typeof browser, 'sidePanel'>>).sidePanel;

/** Chrome / Edge (`side_panel`) and Firefox (`sidebar_action`) have one; older browsers don't. */
export const sidebarSupported = !!(sidebarAction || sidePanel);

const manifest = browser.runtime.getManifest();
const POPUP_PATH =
  manifest.action?.default_popup ?? manifest.browser_action?.default_popup ?? 'popup.html';

/**
 * Makes the toolbar button open the popup or the sidebar (the "Open AppliCliq in" setting).
 * The button state isn't kept across restarts everywhere, so the background calls this on
 * every start and whenever settings change.
 */
export async function applyOpenIn(mode: OpenInMode): Promise<void> {
  const sidebar = mode === 'sidebar' && sidebarSupported;
  await actionApi.setPopup({ popup: sidebar ? '' : POPUP_PATH });
  // Chrome opens the panel itself; Firefox gets `action.onClicked` (see `toggleSidebar`).
  await sidePanel?.setPanelBehavior({ openPanelOnActionClick: sidebar }).catch(() => {});
}

/**
 * Opens the sidebar. Must be called synchronously inside a click (or toolbar button) handler:
 * browsers only open it for a user gesture.
 */
export function openSidebar(windowId: number | undefined): Promise<void> {
  if (sidePanel) {
    return windowId === undefined ? Promise.reject() : sidePanel.open({ windowId });
  }
  return sidebarAction ? sidebarAction.open() : Promise.reject();
}

/** Firefox, toolbar button with no popup: show or hide the sidebar. */
export function toggleSidebar(): void {
  if (!sidebarAction) return;
  void (sidebarAction.toggle ? sidebarAction.toggle() : sidebarAction.open()).catch(() => {});
}
