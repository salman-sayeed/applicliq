import { blockAt, textAt } from '../dom';
import type { SiteAdapter } from '../types';

/** Logged-in job view / search side panel first, then the public (logged-out) page. */
export const linkedin: SiteAdapter = {
  id: 'linkedin',
  matches: (url) => /(^|\.)linkedin\.com$/.test(url.hostname) && url.pathname.startsWith('/jobs'),
  canonicalUrl(url) {
    const id =
      url.searchParams.get('currentJobId') ??
      /\/jobs\/view\/(?:[^/]*-)?(\d+)/.exec(url.pathname)?.[1];
    return id && /^\d+$/.test(id) ? `https://www.linkedin.com/jobs/view/${id}/` : undefined;
  },
  extract: (doc) => ({
    title: textAt(doc, [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      'h1.top-card-layout__title',
      'h1.topcard__title',
    ]),
    company: textAt(doc, [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      'a.topcard__org-name-link',
      '.topcard__flavor a',
    ]),
    // "Berlin, Germany · 3 days ago · 120 applicants"
    location: textAt(doc, [
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
    ])
      ?.split('·')[0]
      ?.trim(),
    // "Berlin, Germany · 3 days ago · 120 applicants" (logged in) or "2 weeks ago" (public).
    postedText: textAt(doc, [
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.jobs-unified-top-card__posted-date',
      '.posted-time-ago__text',
    ]),
    workplaceText: textAt(doc, [
      '.job-details-jobs-unified-top-card__workplace-type',
      '.jobs-unified-top-card__workplace-type',
      '.job-details-fit-level-preferences',
      '.job-details-preferences-and-skills',
    ]),
    salaryText: textAt(doc, [
      '.compensation__salary',
      '.job-details-fit-level-preferences',
      '.job-details-preferences-and-skills',
    ]),
    description: blockAt(doc, [
      '.jobs-description__content .jobs-box__html-content',
      '#job-details',
      '.jobs-description-content__text',
      '.show-more-less-html__markup',
      '.description__text',
    ]),
  }),
};
