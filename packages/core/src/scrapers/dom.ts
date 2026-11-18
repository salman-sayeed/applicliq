import { cleanText, elementToText } from './text';

function* matches(doc: ParentNode, selectors: string[]): Generator<Element> {
  for (const selector of selectors) {
    let found: NodeListOf<Element>;
    try {
      found = doc.querySelectorAll(selector);
    } catch {
      continue; // An invalid selector must not break extraction.
    }
    yield* found;
  }
}

/** Single-line text of the first non-empty element matching any selector, in order. */
export function textAt(doc: ParentNode, selectors: string[]): string | undefined {
  for (const el of matches(doc, selectors)) {
    const text = cleanText(el.textContent);
    if (text) return text;
  }
  return undefined;
}

/** Multi-line text (paragraphs, bullets) of the first non-empty match. */
export function blockAt(doc: ParentNode, selectors: string[], skip?: string): string | undefined {
  for (const el of matches(doc, selectors)) {
    const text = elementToText(el, skip);
    if (text) return text;
  }
  return undefined;
}

/** Joins every element matched by the first selector that matches anything. */
export function blocksAt(doc: ParentNode, selectors: string[], skip?: string): string | undefined {
  for (const selector of selectors) {
    const parts = [...matches(doc, [selector])]
      .map((el) => elementToText(el, skip))
      .filter(Boolean);
    if (parts.length) return parts.join('\n\n');
  }
  return undefined;
}

export function attrAt(doc: ParentNode, selectors: string[], attr: string): string | undefined {
  for (const el of matches(doc, selectors)) {
    const value = cleanText(el.getAttribute(attr));
    if (value) return value;
  }
  return undefined;
}

export function metaContent(doc: Document, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = attrAt(doc, [`meta[property="${name}"]`, `meta[name="${name}"]`], 'content');
    if (value) return value;
  }
  return undefined;
}

/** "acme-corp" → "Acme Corp". */
export function humanizeSlug(slug: string | undefined): string | undefined {
  const words = slug
    ?.split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1));
  return words?.length ? words.join(' ') : undefined;
}

/** First path segment of a URL, if any. */
export function firstPathSegment(url: URL): string | undefined {
  return url.pathname.split('/').find(Boolean);
}
