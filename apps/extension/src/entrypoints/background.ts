import { SAVE_SHORTCUT_COMMAND } from '@/lib/config';
import { repo } from '@/lib/db';
import { setPendingLink } from '@/lib/pending-link';
import {
  extractFromTab,
  flashBadge,
  getActiveTab,
  isSavableUrl,
  openPopup,
  readLinkText,
} from '@/lib/tabs';

const MENU_SAVE_LINK = 'save-link';

export default defineBackground(() => {
  // Menus survive restarts in Chrome but not in Firefox; recreating on every start covers both.
  void browser.contextMenus.removeAll().then(() =>
    browser.contextMenus.create({
      id: MENU_SAVE_LINK,
      title: 'Save job to Pocket Career',
      contexts: ['link'],
    }),
  );

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_SAVE_LINK || !isSavableUrl(info.linkUrl)) return;
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
});

/** If the popup couldn't open, a badge asks the user to click it to finish. */
async function handOffLink(stored: Promise<void>, opened: Promise<boolean>) {
  await stored;
  if (!(await opened)) await flashBadge('1', '#4f46e5', 'Click to finish saving the job link', 0);
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
    if (!(await openPopup())) await flashBadge('!', '#d97706', 'Open Pocket Career to save');
    return;
  }
  await repo.addJob({ ...job, url: job.url, title: job.title, company: job.company });
  await flashBadge('✓', '#16a34a', 'Saved to Pocket Career');
}
