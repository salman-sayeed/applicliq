import { attrAt, blockAt, firstPathSegment, humanizeSlug, textAt } from '../dom';
import type { SiteAdapter } from '../types';

/** boards.greenhouse.io (classic) and job-boards.greenhouse.io (new layout). */
export const greenhouse: SiteAdapter = {
  id: 'greenhouse',
  matches: (url) => /(^|\.)greenhouse\.io$/.test(url.hostname),
  extract: (doc, url) => {
    const company =
      textAt(doc, ['.company-name', '.job__header .company'])?.replace(/^at\s+/i, '') ??
      attrAt(doc, ['.logo img', 'img.logo', '.image-container img'], 'alt')?.replace(
        /\s+logo$/i,
        '',
      );
    const slug = humanizeSlug(firstPathSegment(url));
    const location = textAt(doc, ['.job__location', '.location']);
    return {
      title: textAt(doc, [
        '.job__title h1',
        'h1.app-title',
        '.app-title',
        'h1.section-header',
        'h1',
      ]),
      company: company ?? slug,
      location,
      workplaceText: location,
      salaryText: textAt(doc, ['.pay-range', '.job__pay-range', '.pay-input']),
      description: blockAt(doc, ['.job__description', '#content', '.job-post-content']),
      guessed: company ? [] : ['company'],
    };
  },
};
