import { type Job, isAutofillEnabled, isProfileEmpty, normalizeUrl } from '@applicliq/core';
import { repo } from './db';
import type { AutofillButtonReply, AutofillConfirmedReply, BackgroundMessage } from './messages';
import { openPopup } from './tabs';

/**
 * The background's side of Autofill: which tab's form was filled for which job, "Mark as
 * applied?" when the confirmation page shows, saving answers offered on the page, and the
 * floating button's clicks. The tab → job links live in session storage (gone with the browser).
 */

const LINKS_KEY = 'autofill-tabs';
type Links = Record<string, { jobId?: string; at: number }>;

async function readLinks(): Promise<Links> {
  const stored = await browser.storage.session.get(LINKS_KEY).catch(() => ({}));
  return ((stored as Record<string, unknown>)[LINKS_KEY] as Links | undefined) ?? {};
}

async function writeLinks(links: Links): Promise<void> {
  // Links older than a day are dropped.
  const day = Date.now() - 24 * 60 * 60 * 1000;
  const kept = Object.fromEntries(Object.entries(links).filter(([, l]) => l.at > day));
  await browser.storage.session.set({ [LINKS_KEY]: kept }).catch(() => {});
}

export async function linkTab(tabId: number, jobId: string | undefined): Promise<void> {
  const links = await readLinks();
  links[tabId] = { jobId, at: Date.now() };
  await writeLinks(links);
}

export async function forgetTab(tabId: number): Promise<void> {
  const links = await readLinks();
  if (!(tabId in links)) return;
  delete links[tabId];
  await writeLinks(links);
}

/** Tabs with a filled form: checked for the confirmation page when they load. */
export async function isLinkedTab(tabId: number): Promise<boolean> {
  return String(tabId) in (await readLinks());
}

/** "Senior Engineer at Acme". */
const jobName = (job: Job) => [job.title, job.company].filter(Boolean).join(' at ');

/** The saved job a form page belongs to: its URL, or the posting's (…/apply, …/application). */
export async function jobForUrl(url: string | undefined): Promise<Job | undefined> {
  if (!url) return undefined;
  const candidates = [
    url,
    url.replace(/\/(apply|application)\/?(\?.*)?$/, ''),
    url.replace(/\/confirmation\/?$/, ''),
  ];
  for (const candidate of new Set(candidates)) {
    const job = await repo.getJobByUrl(normalizeUrl(candidate)).catch(() => undefined);
    if (job) return job;
  }
  return undefined;
}

async function linkedJob(tabId: number | undefined): Promise<Job | undefined> {
  if (tabId === undefined) return undefined;
  const link = (await readLinks())[tabId];
  return link?.jobId ? repo.getJob(link.jobId) : undefined;
}

async function markApplied(job: Job, onChange: () => void): Promise<void> {
  if (job.status === 'saved') {
    await repo.updateJob(job.id, { status: 'applied' });
    onChange();
  }
}

/**
 * Handles Autofill's messages. Returns the reply (a promise) for the ones that have one, or
 * undefined for messages that aren't Autofill's.
 */
export function handleAutofillMessage(
  message: BackgroundMessage,
  sender: { tab?: { id?: number; url?: string }; url?: string },
  onChange: () => void,
): Promise<unknown> | undefined {
  switch (message.type) {
    case 'applicliq:autofill-filled':
      return linkTab(message.tabId, message.jobId).then(() => undefined);

    case 'applicliq:autofill-confirmed':
      return (async (): Promise<AutofillConfirmedReply> => {
        const job = await linkedJob(sender.tab?.id);
        // Only a job still at "Saved": one already applied (or further along) stays as it is.
        if (!job || job.status !== 'saved') return { action: 'none' };
        const settings = await repo.getSettings();
        if (settings.autofill.markAppliedAutomatically) {
          await markApplied(job, onChange);
          return { action: 'done', jobName: jobName(job) };
        }
        return { action: 'ask', jobName: jobName(job) };
      })();

    case 'applicliq:autofill-mark-applied':
      return (async () => {
        const job = await linkedJob(sender.tab?.id);
        if (job) await markApplied(job, onChange);
      })();

    case 'applicliq:autofill-save-answer':
      return (async () => {
        if (!isAutofillEnabled(await repo.getSettings())) return;
        if (typeof message.question !== 'string' || typeof message.answer !== 'string') return;
        await repo.addSavedAnswer({ question: message.question, answer: message.answer });
        onChange();
      })();

    case 'applicliq:autofill-button':
      return (async (): Promise<AutofillButtonReply> => {
        const settings = await repo.getSettings();
        if (!isAutofillEnabled(settings)) return { action: 'open-toolbar' };
        const profile = await repo.getAutofillProfile();
        const answers = await repo.getSavedAnswers();
        if (isProfileEmpty(profile) && !answers.length) return { action: 'empty-profile' };
        if (settings.autofill.skipPreview) {
          const tabId = sender.tab?.id;
          if (tabId !== undefined) {
            const job = await jobForUrl(sender.tab?.url ?? sender.url);
            await linkTab(tabId, job?.id);
          }
          return {
            action: 'fill',
            profile,
            answers,
            eeo: settings.autofill.eeo,
            offerToSaveAnswers: settings.autofill.offerToSaveAnswers,
          };
        }
        return (await openPopup()) ? { action: 'opened' } : { action: 'open-toolbar' };
      })();

    default:
      return undefined;
  }
}

/** A tab with a filled form finished loading: look for the confirmation page there. */
export async function checkTabForConfirmation(tabId: number): Promise<void> {
  if (!(await isLinkedTab(tabId))) return;
  try {
    // Works while the browser still lets AppliCliq into the tab (the same site as the form, or
    // the on-page button's access); otherwise there's nothing to do.
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['/content-scripts/autofill.js'],
    });
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      args: [{ type: 'check-confirmation' }],
      func: (cmd: unknown) => {
        const agent = (
          globalThis as unknown as Record<string, { run(c: unknown): Promise<unknown> } | undefined>
        ).__applicliqAutofill;
        return agent?.run(cmd);
      },
    });
  } catch {
    // No access any more.
  }
}
