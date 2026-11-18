import { blockAt, textAt } from '../dom';
import type { SiteAdapter } from '../types';

/** Formerly AngelList Talent. */
export const wellfound: SiteAdapter = {
  id: 'wellfound',
  matches: (url) => /(^|\.)(wellfound\.com|angel\.co)$/.test(url.hostname),
  extract: (doc) => {
    const location = textAt(doc, ['a[href^="/location/"]', '[class*="location" i] a']);
    return {
      title: textAt(doc, ['[data-test="JobListing-title"]', 'h1[class*="title" i]', 'h1']),
      company: textAt(doc, [
        '[data-test="StartupHeader-name"]',
        'a[href^="/company/"] [class*="name" i]',
        'a[href^="/company/"]',
      ]),
      location,
      workplaceText: textAt(doc, ['[class*="remote" i]', '[class*="workplace" i]']) ?? location,
      // "$120k – $160k • 0.1% – 0.5%"
      salaryText: textAt(doc, ['[class*="compensation" i]', '[class*="salary" i]']),
      description: blockAt(doc, ['[data-test="JobDescription"]', '[class*="description" i]']),
    };
  },
};
