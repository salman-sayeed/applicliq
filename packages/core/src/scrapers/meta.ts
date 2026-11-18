import { metaContent } from './dom';
import { cleanText } from './text';
import type { ExtractedFields } from './types';

/** Site names that are job boards, never the hiring company. */
const JOB_BOARDS =
  /^(linkedin|indeed|glassdoor|bdjobs|wellfound|angellist|greenhouse|lever|workday|monster|ziprecruiter)\b/i;

/** Splits "Senior Engineer at Acme • Berlin" and "Acme hiring Senior Engineer in Berlin". */
function splitTitle(
  raw: string,
  linkedIn: boolean,
): Pick<ExtractedFields, 'title' | 'company' | 'location'> {
  // Plain "X hiring Y" is LinkedIn's format; elsewhere it could be a title ("Hiring Manager").
  const hiringWord = linkedIn ? '(?:is\\s+)?hiring' : 'is\\s+hiring';
  const hiring = new RegExp(
    `^(.+?)\\s+${hiringWord}\\s+(?:an?\\s+)?(.+?)(?:\\s+in\\s+(.+))?$`,
    'i',
  ).exec(raw);
  if (hiring) return { company: hiring[1], title: hiring[2], location: hiring[3] };
  const at = /^(.+?)\s+at\s+(.+?)(?:\s+[•·]\s+(.+))?$/.exec(raw);
  if (at) return { title: at[1], company: at[2], location: at[3] };
  return { title: raw };
}

/**
 * Last-resort fields from Open Graph / Twitter / standard meta tags and `<title>`.
 * Titles are noisy ("Engineer - Acme | Careers"), so callers trust these the least.
 */
export function extractMeta(doc: Document): ExtractedFields | undefined {
  const siteName = metaContent(doc, 'og:site_name', 'application-name');
  let raw = metaContent(doc, 'og:title', 'twitter:title') ?? cleanText(doc.title);
  const linkedIn = /linkedin/i.test(`${siteName} ${raw}`);
  const description = metaContent(doc, 'og:description', 'twitter:description', 'description');
  if (!raw && !description) return undefined;

  if (raw) {
    // Drop a trailing " | Site" / " - Site" (the site name, or anything after a pipe).
    const parts = raw.split(/\s+[|–—-]\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1]!;
      const isSite =
        (siteName && last.toLowerCase().includes(siteName.toLowerCase())) ||
        JOB_BOARDS.test(last) ||
        /\b(careers?|jobs?)\b/i.test(last);
      if (isSite || raw.includes('|')) raw = parts.slice(0, -1).join(' - ');
    }
  }
  const fields: ExtractedFields = raw ? splitTitle(raw, linkedIn) : {};
  if (!fields.company && siteName && !JOB_BOARDS.test(siteName)) fields.company = siteName;
  if (description) fields.description = description;
  return fields;
}
