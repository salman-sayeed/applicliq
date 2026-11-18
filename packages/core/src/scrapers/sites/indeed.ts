import { blockAt, textAt } from '../dom';
import type { SiteAdapter } from '../types';

const LOCATION = [
  '[data-testid="inlineHeader-companyLocation"]',
  '[data-testid="job-location"]',
  '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
  '#jobLocationText',
];

export const indeed: SiteAdapter = {
  id: 'indeed',
  matches: (url) => /(^|\.)indeed\.[a-z.]+$/.test(url.hostname),
  canonicalUrl(url) {
    const jk = url.searchParams.get('jk') ?? url.searchParams.get('vjk');
    return jk ? `${url.origin}/viewjob?jk=${encodeURIComponent(jk)}` : undefined;
  },
  extract: (doc) => {
    // Indeed's location line doubles as the workplace: "Remote", "Hybrid work in Berlin".
    const location = textAt(doc, LOCATION);
    return {
      title: textAt(doc, [
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        'h1.jobsearch-JobInfoHeader-title',
        '.jobsearch-JobInfoHeader-title',
      ])?.replace(/\s*-\s*job post$/i, ''),
      company: textAt(doc, [
        '[data-testid="inlineHeader-companyName"] a',
        '[data-testid="inlineHeader-companyName"]',
        '[data-company-name="true"]',
        '.jobsearch-CompanyInfoContainer a',
      ]),
      location: location?.replace(/^(hybrid work|remote|on-?site)\s+in\s+/i, ''),
      workplaceText: location,
      salaryText: textAt(doc, [
        '#salaryInfoAndJobType',
        '[data-testid="jobsearch-OtherJobDetailsContainer"]',
        '.jobsearch-JobMetadataHeader-item',
      ]),
      description: blockAt(doc, ['#jobDescriptionText', '.jobsearch-jobDescriptionText']),
    };
  },
};
