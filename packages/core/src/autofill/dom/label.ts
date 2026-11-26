/**
 * The question a control asks, read the way assistive technology would: `aria-labelledby`,
 * `<label for>`, a wrapping `<label>`, `aria-label`, the fieldset's legend, a placeholder, or
 * the text just before it.
 */

/** Text an element shows, whitespace collapsed (aria-hidden parts like "*" left out). */
export function visibleText(node: Node | null | undefined): string {
  if (!node) return '';
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) parts.push(n.textContent ?? '');
    else if (n.nodeType === 1) {
      const el = n as Element;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'svg') return;
      if (
        el.getAttribute('aria-hidden') === 'true' &&
        el.textContent?.trim().length &&
        el.textContent.trim().length <= 2
      ) {
        return; // "*", "✱"
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'OPTION') return;
      el.childNodes.forEach(walk);
      if (/^(P|DIV|LI|BR|H\d)$/.test(tag)) parts.push(' ');
    }
  };
  walk(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** "First Name *" → "First Name"; "1. Email" → "Email"; trailing colons go too. */
export function cleanLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[*✱]+/g, ' ')
    .replace(/^\s*\d{1,3}\s*[.)]\s+/, '')
    .replace(/\s*:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** aria-labels that say nothing about the question. */
const GENERIC =
  /^(single line text|multi(ple)? line text|your answer|enter your answer|type here|start typing|answer|text|other response|other answer|date picker|pick date|select|choose|select\.{3}|search|attach)\.?\.{0,3}$/i;

export function isGenericLabel(text: string): boolean {
  return !text.trim() || GENERIC.test(text.trim());
}

function byIds(doc: Document, ids: string | null, self?: Element): string {
  if (!ids) return '';
  const els = ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id))
    .filter((el): el is HTMLElement => !!el && el !== self);
  // Parts hidden from view ("Single line text." type notes) only when nothing else names it.
  const shown = els.filter((el) => el.getAttribute('aria-hidden') !== 'true');
  return (shown.length ? shown : els)
    .map((el) => visibleText(el))
    .filter(Boolean)
    .join(' ');
}

function labelForId(doc: Document, id: string): HTMLLabelElement | undefined {
  if (!id) return undefined;
  for (const label of doc.querySelectorAll('label')) if (label.htmlFor === id) return label;
  return undefined;
}

const FORM_CONTROL =
  'input, select, textarea, [role="combobox"], [role="radio"], [role="checkbox"], [role="listbox"]';

/** The text just before an element: a previous sibling, or one of its ancestors' (3 levels). */
function precedingText(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    let prev = node.previousElementSibling;
    while (prev) {
      // Another question's control: its text isn't this one's label.
      if (prev.matches(FORM_CONTROL) || prev.querySelector(FORM_CONTROL)) return '';
      const text = visibleText(prev);
      if (text && text.length <= 300) return text;
      if (text) return '';
      prev = prev.previousElementSibling;
    }
  }
  return '';
}

/** The question for one control. */
export function labelOf(el: Element): string {
  const doc = el.ownerDocument;
  const candidates = [
    () => byIds(doc, el.getAttribute('aria-labelledby'), el),
    () => visibleText(labelForId(doc, el.id)),
    () => {
      const wrap = el.closest('label');
      return wrap ? visibleText(wrap) : '';
    },
    () => el.getAttribute('aria-label') ?? '',
    () => {
      // A group that names its parts (Greenhouse's resume upload: "Resume/CV" + "Attach").
      const group = el.closest('[role="group"][aria-labelledby]');
      return group ? byIds(doc, group.getAttribute('aria-labelledby'), el) : '';
    },
    () => visibleText(el.closest('fieldset')?.querySelector('legend')),
    () => el.getAttribute('placeholder') ?? '',
    () => el.getAttribute('title') ?? '',
    () => precedingText(el),
  ];
  for (const read of candidates) {
    const text = cleanLabel(read());
    if (text && !isGenericLabel(text)) return text.slice(0, 500);
  }
  return '';
}

/** The question for a group of choices (radios, checkboxes): its group's label or legend. */
export function groupLabelOf(group: Element, firstChoice: Element): string {
  const doc = group.ownerDocument;
  const candidates = [
    () => byIds(doc, group.getAttribute('aria-labelledby'), group),
    () => group.getAttribute('aria-label') ?? '',
    () => visibleText(firstChoice.closest('fieldset')?.querySelector('legend')),
    () => precedingText(group),
  ];
  for (const read of candidates) {
    const text = cleanLabel(read());
    if (text && !isGenericLabel(text)) return text.slice(0, 500);
  }
  return '';
}

/** A choice's own text: its label, aria-label, data-value, or value. */
export function choiceLabelOf(el: Element): string {
  const doc = el.ownerDocument;
  const text =
    byIds(doc, el.getAttribute('aria-labelledby'), el) ||
    el.getAttribute('aria-label') ||
    el.getAttribute('data-value') ||
    el.getAttribute('data-answer-value') ||
    visibleText(labelForId(doc, el.id)) ||
    visibleText(el.closest('label')) ||
    (el as HTMLInputElement).value ||
    visibleText(el);
  return cleanLabel(text ?? '');
}
