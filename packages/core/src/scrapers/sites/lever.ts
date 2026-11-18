import { attrAt, blockAt, firstPathSegment, humanizeSlug, textAt } from '../dom';
import { cleanText } from '../text';
import type { SiteAdapter } from '../types';

export const lever: SiteAdapter = {
  id: 'lever',
  matches: (url) => /(^|\.)lever\.co$/.test(url.hostname),
  extract: (doc, url) => {
    // The page title is "Acme - Senior Engineer"; the logo's alt text is the company too.
    const fromTitle = cleanText(doc.title)?.split(/\s+[-–]\s+/)[0];
    const company =
      attrAt(doc, ['.main-header-logo img'], 'alt')?.replace(/\s+logo$/i, '') ?? fromTitle;
    const location = textAt(doc, [
      '.posting-categories .location',
      '.posting-category.location',
      '.sort-by-location',
    ]);
    return {
      title: textAt(doc, [
        '.posting-headline h2',
        '.posting-header h2',
        '[data-qa="posting-name"]',
      ]),
      company: company ?? humanizeSlug(firstPathSegment(url)),
      location,
      workplaceText:
        textAt(doc, ['.posting-categories .workplaceTypes', '.workplaceTypes']) ?? location,
      salaryText: textAt(doc, ['[data-qa="salary-range"] div', '[data-qa="salary-range"]']),
      description: blockAt(
        doc,
        ['.section-wrapper.page-full-width', '[data-qa="job-description"]'],
        '.last-section-apply, [data-qa="salary-range"]',
      ),
      guessed: company ? [] : ['company'],
    };
  },
};
