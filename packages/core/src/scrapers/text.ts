import type { Salary, SalaryPeriod, WorkType } from '../types';

/** Upper bound for `descriptionSnapshot`, in UTF-8 bytes. */
export const MAX_DESCRIPTION_BYTES = 20 * 1024;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'button']);
const PARAGRAPH = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'pre']);
const BLOCK = new Set([
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'li',
  'tr',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'form',
  'fieldset',
  'hr',
]);

/** Collapses whitespace; returns undefined for empty strings. */
export function cleanText(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

// Private-use markers for block boundaries, resolved to newlines once the walk is done.
const BREAK = '\uE000';
const PARAGRAPH_BREAK = '\uE001';

/** Adjacent boundaries collapse to one newline; a paragraph or two `<br>`s make a blank line. */
function resolveBreaks(text: string): string {
  return text
    .replace(/[\s\uE000\uE001]*[\n\uE000\uE001][\s\uE000\uE001]*/g, (run) =>
      run.includes(PARAGRAPH_BREAK) || (run.match(/\n/g)?.length ?? 0) > 1 ? '\n\n' : '\n',
    )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();
}

/**
 * Plain text of an element, keeping paragraph and list structure (`• ` bullets).
 * Elements matching `skip` (e.g. apply buttons) are left out.
 */
export function elementToText(root: Node, skip?: string): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === TEXT_NODE) {
      out.push((node.nodeValue ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag) || el.getAttribute('aria-hidden') === 'true') return;
    if (skip && el.matches(skip)) return;
    if (tag === 'br') {
      out.push('\n');
      return;
    }
    const sep = PARAGRAPH.has(tag) ? PARAGRAPH_BREAK : BLOCK.has(tag) ? BREAK : '';
    out.push(sep);
    if (tag === 'li') out.push('• ');
    for (const child of el.childNodes) walk(child);
    out.push(sep);
  };
  walk(root);
  return resolveBreaks(out.join(''));
}

/**
 * Converts an HTML fragment (e.g. a JSON-LD description) to plain text. Parsed in an inert
 * document, so nothing in it runs or loads. Handles HTML that was entity-escaped once more
 * (`&lt;p&gt;`), which many job boards emit, and plain text with its own line breaks.
 */
export function htmlToText(html: string, doc: Document): string {
  const parse = (source: string) => {
    const inert = doc.implementation.createHTMLDocument('');
    inert.body.innerHTML = source;
    return inert.body;
  };
  let body = parse(html);
  if (body.children.length === 0) {
    const text = body.textContent ?? '';
    if (!/<[a-z][\s\S]*>/i.test(text)) return resolveBreaks(text);
    body = parse(text);
  }
  return elementToText(body);
}

/** Truncates to at most `maxBytes` of UTF-8 without splitting a character. */
export function truncateUtf8(text: string, maxBytes: number = MAX_DESCRIPTION_BYTES): string {
  const buffer = new Uint8Array(maxBytes);
  const { read } = new TextEncoder().encodeInto(text, buffer);
  return read >= text.length ? text : text.slice(0, read).trimEnd();
}

/**
 * Work type from short text such as a location line or a "workplace" badge
 * ("Remote", "Hybrid work in Berlin", "On-site").
 */
export function detectWorkType(text: string | undefined): WorkType | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  if (/\b(not|no|non)[\s-]remote\b/.test(t)) return undefined;
  if (/\b(remote|work from home|wfh|telecommut\w*)\b/.test(t)) return 'remote';
  if (/\b(on[\s-]?site|in[\s-]office|in[\s-]person|work (at|from) office)\b/.test(t)) {
    return 'onsite';
  }
  return undefined;
}

/**
 * Work type from a long description. Only explicit phrases count, since descriptions mention
 * "remote" in passing ("remote-friendly tools", "not a remote role").
 */
export function detectWorkTypeInDescription(text: string | undefined): WorkType | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (
    /\bhybrid\s+(role|position|job|work|working|schedule|model|arrangement|setup)\b/.test(t) ||
    /\b\d\s+days?\s+(a|per)\s+week\s+(in|at)\s+(the\s+|our\s+)?office\b/.test(t)
  ) {
    return 'hybrid';
  }
  const negatedRemote = /\b(not|no|non)[\s-](a\s+)?(fully\s+)?remote\b/.test(t);
  if (
    !negatedRemote &&
    (/(fully|completely|100%)\s+remote\b/.test(t) ||
      /\bremote[\s-](first|position|role|job|opportunity)\b/.test(t) ||
      /\bthis (is a|role is|position is|job is)( fully)? remote\b/.test(t) ||
      /\bwork from home\b/.test(t))
  ) {
    return 'remote';
  }
  if (
    /\b(on[\s-]?site|in[\s-]office|in[\s-]person)\s+(role|position|job|work)\b/.test(t) ||
    /\bthis (is an?|role is|position is|job is) (on[\s-]?site|in[\s-]office)\b/.test(t)
  ) {
    return 'onsite';
  }
  return undefined;
}

/** Currency markers, most specific first (`CA$` must win over `$`). */
const CURRENCY_PATTERNS: [string, RegExp][] = [
  ['CAD', /\bCA?\$|\bCAD\b/],
  ['AUD', /\bAU?\$|\bAUD\b/],
  ['NZD', /\bNZ\$|\bNZD\b/],
  ['SGD', /\bS\$|\bSGD\b/],
  ['HKD', /\bHK\$|\bHKD\b/],
  ['BRL', /\bR\$|\bBRL\b/],
  ['USD', /\bUS\$|\bUSD\b/],
  ['EUR', /€|\bEUR\b|\beuros?\b/i],
  ['GBP', /£|\bGBP\b/],
  ['INR', /₹|\bINR\b|\bRs\.?\s?\d/],
  ['BDT', /৳|\bBDT\b|\bTk\.?\s?\d|\btaka\b/i],
  ['JPY', /¥|\bJPY\b/],
  ['KRW', /₩|\bKRW\b/],
  ['NGN', /₦|\bNGN\b/],
  ['PHP', /₱/],
  ['CHF', /\bCHF\b/],
  ['PLN', /zł|\bPLN\b/],
  ['TRY', /₺/],
  ['AED', /\bAED\b/],
  ['SEK', /\bSEK\b/],
];

/** Which dollar a bare `$` most likely means, from the site's host. */
function dollarFor(hostname: string | undefined): string {
  const host = hostname?.toLowerCase() ?? '';
  if (/(^|\.)ca\.|\.ca$/.test(host)) return 'CAD';
  if (/(^|\.)au\.|\.au$/.test(host)) return 'AUD';
  if (/(^|\.)nz\.|\.nz$/.test(host)) return 'NZD';
  if (/(^|\.)sg\.|\.sg$/.test(host)) return 'SGD';
  return 'USD';
}

/** ISO 4217 code of the first currency mentioned in the text, if any. */
export function detectCurrency(text: string | undefined, hostname?: string): string | undefined {
  if (!text) return undefined;
  let best: { code: string; index: number } | undefined;
  for (const [code, pattern] of CURRENCY_PATTERNS) {
    const index = text.search(pattern);
    if (index >= 0 && (!best || index < best.index)) best = { code, index };
  }
  const dollar = text.search(/\$\s?\d/);
  if (dollar >= 0 && (!best || dollar < best.index)) {
    // A specific dollar ("CA$") starts before its "$", so it already won above.
    return dollarFor(hostname);
  }
  return best?.code;
}

function detectPeriod(text: string): SalaryPeriod | undefined {
  const t = text.toLowerCase();
  if (/\b(hour|hourly|hr)\b|\/\s?h\b/.test(t)) return 'hour';
  if (/\b(month|monthly|mo)\b/.test(t)) return 'month';
  if (/\b(year|yearly|annual|annually|annum|yr|p\.?a)\b|\/\s?y\b/.test(t)) return 'year';
  return undefined;
}

const AMOUNT = /(\d{1,3}(?:[,.\s]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d+)?)\s*(k|lakh|lac)?\b/gi;
const GROUPED = /^(\d{1,3}(?:[,.\s]\d{3})+)(?:\.\d{1,2})?$/;

/**
 * Parses a short salary line: "$120,000 - $150,000 a year", "€60k–80k", "Tk. 30000 - 40000
 * (Monthly)", "$45/hr". Returns undefined if it has no amount (e.g. "Negotiable").
 */
export function parseSalary(text: string | undefined, hostname?: string): Salary | undefined {
  if (!text) return undefined;
  const amounts = [...text.matchAll(AMOUNT)].map((m) => {
    const digits = m[1]!;
    // "1,234,567" / "1.234.567" / "1 234 567" are grouped (cents dropped); "12.5" is a decimal.
    const grouped = GROUPED.exec(digits)?.[1];
    const value = grouped ? Number(grouped.replace(/[,.\s]/g, '')) : Number(digits);
    const suffix = m[2]?.toLowerCase();
    const factor = suffix === 'k' ? 1_000 : suffix ? 100_000 : 1;
    return { value, factor, start: m.index, end: m.index + m[0].length };
  });
  const usable = amounts.filter((a) => a.value > 0);
  const first = usable[0];
  if (!first) return undefined;

  const second = usable[1];
  const gap = second ? text.slice(first.end, second.start) : '';
  const isRange = !!second && gap.length <= 12 && /[-–—]|\bto\b/i.test(gap) && !/\d/.test(gap);
  // "60-80k": the suffix on the upper bound applies to both.
  const firstFactor =
    isRange && first.factor === 1 && second.factor > 1 && first.value < 1_000
      ? second.factor
      : first.factor;

  const min = first.value * firstFactor;
  const max = isRange ? second.value * second.factor : min;
  const salary: Salary = { min, max };
  const currency = detectCurrency(text, hostname);
  const period = detectPeriod(text);
  if (currency) salary.currency = currency;
  if (period) salary.period = period;
  return salary;
}
