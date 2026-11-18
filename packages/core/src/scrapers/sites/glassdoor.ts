import { blockAt, textAt } from '../dom';
import type { SiteAdapter } from '../types';

export const glassdoor: SiteAdapter = {
  id: 'glassdoor',
  matches: (url) => /(^|\.)glassdoor\.[a-z.]+$/.test(url.hostname),
  extract: (doc) => {
    const location = textAt(doc, ['[data-test="location"]', '[class*="JobDetails_location"]']);
    return {
      title: textAt(doc, [
        '[data-test="job-title"]',
        'h1[id^="jd-job-title"]',
        '[class*="JobDetails_jobTitle"]',
      ]),
      // "Acme Corp 4.1 ★" → "Acme Corp"
      company: textAt(doc, [
        '[data-test="employer-name"]',
        '[class*="EmployerProfile_employerName"]',
        '[class*="EmployerProfile_compactEmployerName"]',
      ])?.replace(/\s*\d(?:\.\d)?\s*★?$/, ''),
      location,
      workplaceText: location,
      salaryText: textAt(doc, [
        '[data-test="detailSalary"]',
        '[data-test="salary-estimate"]',
        '[class*="SalaryEstimate_salaryRange"]',
      ]),
      description: blockAt(doc, [
        '[class*="JobDetails_jobDescription"]',
        '[data-test="jobDescriptionContent"]',
        '.jobDescriptionContent',
        '#JobDescriptionContainer',
      ]),
    };
  },
};
