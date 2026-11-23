import { DRAFT_FIELD_LABELS, type DraftField, draftFrom, setDraftField } from '@applicliq/core';
import { repo } from './db';
import { drafts, showDraftBadge } from './draft';
import { extractFromTab, showToastInTab } from './tabs';

let queue: Promise<void> = Promise.resolve();

/**
 * Writes text picked on a page (context menu or picker) into that page's draft, creating the
 * draft from the page's extracted details if there is none yet. Then marks the tab's toolbar
 * badge and confirms with a toast on the page. Runs one at a time, so quick picks don't race.
 */
export function setTabDraftField(
  tab: { id: number; url: string; title?: string },
  field: DraftField,
  text: string,
): Promise<void> {
  const run = queue.then(() => apply(tab, field, text));
  queue = run.catch(() => {});
  return run;
}

async function apply(
  tab: { id: number; url: string; title?: string },
  field: DraftField,
  text: string,
) {
  let draft = await drafts.get(tab.url);
  if (!draft) {
    const [settings, extracted] = await Promise.all([repo.getSettings(), extractFromTab(tab.id)]);
    const url = extracted?.job.url ?? tab.url;
    draft = draftFrom(extracted?.job ?? { title: tab.title ?? '' }, url, settings.regional);
  }
  const label = DRAFT_FIELD_LABELS[field];
  const next = setDraftField(draft, field, text, new URL(tab.url).hostname);
  if (!next) {
    const reason =
      field === 'salary' ? 'No salary amount in that text' : `Nothing to set as ${label}`;
    await showToastInTab(tab.id, reason, false);
    return;
  }
  await drafts.save(tab.url, next);
  await Promise.all([
    showDraftBadge(tab.id),
    showToastInTab(tab.id, field === 'notes' ? 'Added to Notes' : `${label} set`),
  ]);
}
