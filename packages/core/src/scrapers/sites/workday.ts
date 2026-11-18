import { blockAt, humanizeSlug, textAt } from '../dom';
import type { SiteAdapter } from '../types';

/**
 * Workday career sites ({tenant}.wd5.myworkdayjobs.com). Markup is keyed by
 * `data-automation-id`; the company is usually in JSON-LD, else guessed from the tenant.
 */
export const workday: SiteAdapter = {
  id: 'workday',
  matches: (url) => /(^|\.)(myworkdayjobs|myworkdaysite)\.com$/.test(url.hostname),
  extract: (doc, url) => ({
    title: textAt(doc, ['[data-automation-id="jobPostingHeader"]']),
    company: humanizeSlug(url.hostname.split('.')[0]),
    location: textAt(doc, [
      '[data-automation-id="locations"] dd',
      '[data-automation-id="locations"]',
    ]),
    workplaceText: textAt(doc, [
      '[data-automation-id="remoteType"] dd',
      '[data-automation-id="remoteType"]',
    ]),
    description: blockAt(doc, ['[data-automation-id="jobPostingDescription"]']),
    guessed: ['company'],
  }),
};
