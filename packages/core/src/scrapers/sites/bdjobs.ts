import { blockAt, blocksAt, textAt } from '../dom';
import type { SiteAdapter } from '../types';

/** Bangladesh's largest job board. Salaries are in taka, usually monthly. */
export const bdjobs: SiteAdapter = {
  id: 'bdjobs',
  matches: (url) => /(^|\.)bdjobs\.com$/.test(url.hostname),
  defaultCurrency: 'BDT',
  extract: (doc) => {
    const location = textAt(doc, ['.job_loc p', '.job_loc', '.job-location', '.location']);
    return {
      title: textAt(doc, ['.job-title', '.jtitle', 'h1']),
      company: textAt(doc, ['.company-name', '.cname', '.comp-name']),
      location,
      workplaceText: blockAt(doc, ['.job_nature', '.job-nature']) ?? location,
      salaryText: textAt(doc, ['.salary_range li', '.salary_range', '.salary-range', '.salary']),
      // The posting is split into sections (context, responsibilities, requirements, ...).
      description: blocksAt(doc, [
        '.jobcontent',
        '.job_des, .job_req, .edu_req, .exp_req, .job_nature, .job_loc, .salary_range, .oth_ben',
        '.job-details',
      ]),
    };
  },
};
