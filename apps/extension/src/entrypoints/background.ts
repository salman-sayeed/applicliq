import { flashBadge } from '@/lib/badge';
import { SAVE_SHORTCUT_COMMAND, openDashboard } from '@/lib/config';
import { repo } from '@/lib/db';
import type { BackgroundMessage } from '@/lib/messages';
import { DRAFT_FIELDS, type DraftField, isDraftField } from '@applicliq/core';
import { drafts } from '@/lib/draft';
import { applyOpenIn, toggleSidebar } from '@/lib/open-in';
import { setPendingLink } from '@/lib/pending-link';
import { setTabDraftField } from '@/lib/tab-draft';
import {
  ALARM_GHOST_CHECK,
  ALARM_SYNC,
  ensureAlarms,
  handleGoalNotificationClick,
  jobIdFromNotification,
  reconcilePageBadge,
  refresh,
  syncAndRefresh,
  syncSoon,
  updatePageBadge,
} from '@/lib/background';
import {
  actionApi,
  extractFromTab,
  getActiveTab,
  isSavableUrl,
  openPopup,
  readLinkText,
} from '@/lib/tabs';

const MENU_SAVE_LINK = 'save-link';
const MENU_SELECTION = 'selection';
/** Menu ids of the "Set as …" items under the selection menu: `set:title`, `set:notes`, … */
const MENU_SET_PREFIX = 'set:';

const SET_MENU_TITLES: Record<DraftField, string> = {
  title: 'Set as Title',
  company: 'Set as Company',
  location: 'Set as Location',
  salary: 'Set as Salary',
  notes: 'Append to Notes',
};

export default defineBackground(() => {
  // Menus survive restarts in Chrome but not in Firefox; recreating on every start covers both.
  void browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: MENU_SAVE_LINK,
      title: 'Save job to AppliCliq',
      contexts: ['link'],
    });
    // Selected text → a field of this page's draft (the popup shows it when opened).
    browser.contextMenus.create({
      id: MENU_SELECTION,
      title: 'AppliCliq',
      contexts: ['selection'],
    });
    for (const field of DRAFT_FIELDS) {
      browser.contextMenus.create({
        id: MENU_SET_PREFIX + field,
        parentId: MENU_SELECTION,
        title: SET_MENU_TITLES[field],
        contexts: ['selection'],
      });
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const menuId = String(info.menuItemId);
    if (menuId.startsWith(MENU_SET_PREFIX)) {
      const field = menuId.slice(MENU_SET_PREFIX.length);
      // `tab.url` needs access to the tab; the click's own `pageUrl` is always there.
      const url = tab?.url ?? info.pageUrl;
      if (isDraftField(field) && tab?.id !== undefined && isSavableUrl(url)) {
        const page = { id: tab.id, url, title: tab.title };
        void setTabDraftField(page, field, info.selectionText ?? '');
      }
      return;
    }
    if (menuId !== MENU_SAVE_LINK || !isSavableUrl(info.linkUrl)) return;
    const url = info.linkUrl;
    // The linked page isn't loaded, so only its URL and text are known: the popup asks for the
    // rest (company is required). Firefox gives the link text and only opens the popup within
    // the click itself, so it must not await first; Chrome needs the text read from the page.
    const firefoxLinkText = (info as { linkText?: string }).linkText;
    if (firefoxLinkText !== undefined) {
      void handOffLink(setPendingLink({ url, title: firefoxLinkText }), openPopup());
    } else {
      void (async () => {
        const title = tab?.id === undefined ? '' : await readLinkText(tab.id, url);
        await setPendingLink({ url, title });
        await handOffLink(Promise.resolve(), openPopup());
      })();
    }
  });

  browser.commands.onCommand.addListener((command, commandTab) => {
    if (command === SAVE_SHORTCUT_COMMAND) void saveFromShortcut(commandTab?.id);
  });

  // Listeners are registered synchronously on every start so events wake the background.
  // Ghosting runs on start-up (the 6-hour alarm may have been missed while the browser was
  // closed) and then every 6 hours; reminders and the goal badge follow every change. Drive
  // sync runs on start-up, every 15 minutes, 3 s after a change and when the popup opens.
  const onStart = () => {
    void drafts.purgeExpired().catch(() => {});
    void reconcilePageBadge();
    void refresh({ ghost: true });
    void syncAndRefresh();
  };
  browser.runtime.onInstalled.addListener(({ reason }) => {
    onStart();
    // First install: open the dashboard, which shows the introduction (goals, optional sign-in).
    if (reason === 'install') void openDashboard();
  });
  browser.runtime.onStartup.addListener(onStart);
  void ensureAlarms();
  // The toolbar button's popup / sidebar choice isn't kept across restarts everywhere.
  void repo.getSettings().then((s) => applyOpenIn(s.jobPages.openIn));
  // Firefox, "Open in: Sidebar": the button has no popup, so its click toggles the sidebar.
  // Must not await first: Firefox opens the sidebar only within the click.
  actionApi.onClicked.addListener(() => toggleSidebar());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_SYNC) void syncAndRefresh();
    else void refresh({ ghost: alarm.name === ALARM_GHOST_CHECK });
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return;
    const m = message as BackgroundMessage;
    if (m?.type === 'applicliq:jobs-changed') {
      void refresh();
      void repo.getSettings().then((s) => applyOpenIn(s.jobPages.openIn));
      syncSoon();
    } else if (m?.type === 'applicliq:picked') {
      // From the picker in the page's top frame; the tab's URL keys the draft.
      const tab = sender.tab;
      const url = tab?.url ?? sender.url;
      const valid = isDraftField(m.field) && typeof m.text === 'string';
      if (valid && tab?.id !== undefined && sender.frameId === 0 && isSavableUrl(url)) {
        void setTabDraftField({ id: tab.id, url, title: tab.title }, m.field, m.text);
      }
    } else if (m?.type === 'applicliq:sync-now') void syncAndRefresh();
    else if (m?.type === 'applicliq:open-job' && typeof m.jobId === 'string') {
      void openDashboard(m.jobId);
    }
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    if (handleGoalNotificationClick(notificationId)) return;
    const jobId = jobIdFromNotification(notificationId);
    if (!jobId) return;
    void openDashboard(jobId);
    void browser.notifications.clear(notificationId);
  });

  // The page badge setting follows the all-sites permission, which the browser can also change.
  browser.permissions.onAdded.addListener(() => void reconcilePageBadge());
  browser.permissions.onRemoved.addListener(() => void reconcilePageBadge());

  // Tab URLs are only visible with the optional all-sites permission (the page badge setting),
  // so without it this returns at once. SPA navigations report a new `url` without a reload.
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.url !== undefined || change.status === 'complete') {
      void updatePageBadge(tabId, tab.url);
    }
  });
});

/** If the popup couldn't open, a badge asks the user to click it to finish. */
async function handOffLink(stored: Promise<void>, opened: Promise<boolean>) {
  await stored;
  if (!(await opened)) await flashBadge('1', '#406db5', 'Click to finish saving the job link', 0);
}

/**
 * Alt+Shift+S: saves the job right away when the page gave a title and company and it isn't
 * saved yet; otherwise opens the popup (to fill in details or show the saved job).
 */
async function saveFromShortcut(tabId?: number) {
  const tab = tabId === undefined ? await getActiveTab() : { id: tabId };
  const extracted = tab?.id === undefined ? undefined : await extractFromTab(tab.id);
  const { job } = extracted ?? {};
  if (!job?.url || !job.title || !job.company || (await repo.getJobByUrl(job.url))) {
    if (!(await openPopup())) await flashBadge('!', '#d97706', 'Open AppliCliq to save');
    return;
  }
  const { automation } = await repo.getSettings();
  const saved = { ...job, url: job.url, title: job.title, company: job.company };
  if (!automation.saveDescriptionSnapshot) delete saved.descriptionSnapshot;
  await repo.addJob({ ...saved, status: automation.defaultSaveStatus });
  void refresh();
  syncSoon();
  await flashBadge('✓', '#16a34a', 'Saved to AppliCliq');
}
