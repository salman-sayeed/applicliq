import type { FieldKey } from '../fields';
import { type AutofillPlatform, autofillPlatform } from '../sites';
import type { ControlKind, ScanResult, ScannedQuestion } from '../types';
import { detectConfirmation } from './confirm';
import {
  choiceLabelOf,
  cleanLabel,
  groupLabelOf,
  isGenericLabel,
  labelOf,
  visibleText,
} from './label';
import { isConsentQuestion, isHidden, neverFill } from './rules';

/**
 * Finds a page's application questions: each control (or group of choices) with its label, kind,
 * choices and current value. Platform adapters (Greenhouse, Lever, Ashby, Google Forms, Microsoft
 * Forms) know where each question's container and title are and which system fields are which;
 * anything else is read generically. Reads the page only.
 */

export type Choice = { label: string; el: HTMLElement };

/** A question and the elements that answer it (kept in the page; not serializable). */
export type QuestionRef = {
  question: ScannedQuestion;
  /** The input, select, textarea, dropdown, or the group holding the choices. */
  element: HTMLElement;
  choices: Choice[];
  /** Where to point the user (highlight, notes). */
  container: HTMLElement;
};

export type FormScan = { result: ScanResult; refs: Map<string, QuestionRef> };

export type ScanOptions = {
  /** Use layout (boxes, positions) to spot hidden fields. Off in test DOMs, which have none. */
  layout?: boolean;
};

type Raw = {
  kind: ControlKind;
  element: HTMLElement;
  choices: Choice[];
  label: string;
  multiple: boolean;
};

type Adapter = {
  platform: AutofillPlatform;
  /** Question containers, in page order (none: read controls one by one). */
  containers(doc: Document): Element[];
  /** A container's question text. */
  label(container: Element): string;
  /** A certain field for a control (system fields). */
  hint?(control: Element, container: Element | undefined): FieldKey | undefined;
  title?(doc: Document): string | undefined;
};

// --- Adapters ----------------------------------------------------------------------------------

const GREENHOUSE_IDS: Record<string, FieldKey> = {
  first_name: 'firstName',
  last_name: 'lastName',
  preferred_name: 'preferredName',
  email: 'email',
  phone: 'phone',
  'candidate-location': 'location',
  location: 'location',
  // Voluntary self-identification (US EEO) fields.
  gender: 'eeo',
  race: 'eeo',
  hispanic_ethnicity: 'eeo',
  veteran_status: 'eeo',
  disability_status: 'eeo',
};

/** job-boards.greenhouse.io (and the embed): one `.field-wrapper` per question, `label[for]`. */
const greenhouse: Adapter = {
  platform: 'greenhouse',
  containers: () => [],
  label: () => '',
  hint(control) {
    const id = control.id;
    // The country picker inside the phone fieldset sets the dialling code.
    if (id === 'country' && control.closest('.phone-input, fieldset')) return 'phoneCountry';
    if (GREENHOUSE_IDS[id]) return GREENHOUSE_IDS[id];
    // The classic board: name="job_application[first_name]".
    const name = control.getAttribute('name')?.match(/^job_application\[([a-z_]+)\]$/)?.[1];
    return name ? GREENHOUSE_IDS[name] : undefined;
  },
};

const LEVER_NAMES: Record<string, FieldKey> = {
  name: 'fullName',
  email: 'email',
  phone: 'phone',
  location: 'location',
  org: 'currentCompany',
  pronouns: 'pronouns',
  'urls[LinkedIn]': 'linkedin',
  'urls[GitHub]': 'github',
  'urls[Portfolio]': 'website',
  'urls[Other]': 'otherLink',
};

/** jobs.lever.co/…/apply: `li.application-question` with `.application-label`. */
const lever: Adapter = {
  platform: 'lever',
  containers: (doc) => [...doc.querySelectorAll('li.application-question')],
  label: (c) =>
    visibleText(
      c.querySelector('.application-label .text') ?? c.querySelector('.application-label'),
    ),
  hint: (control) => LEVER_NAMES[control.getAttribute('name') ?? ''],
};

const ASHBY_FIELDS: Record<string, FieldKey> = {
  _systemfield_name: 'fullName',
  _systemfield_email: 'email',
  _systemfield_location: 'location',
};

/** jobs.ashbyhq.com/…/application: `.ashby-application-form-field-entry` per question. */
const ashby: Adapter = {
  platform: 'ashby',
  containers: (doc) => [...doc.querySelectorAll('.ashby-application-form-field-entry')],
  label: (c) => visibleText(c.querySelector('.ashby-application-form-question-title')),
  hint(control, container) {
    const own = ASHBY_FIELDS[control.getAttribute('name') ?? control.id];
    if (own) return own;
    // The location typeahead has no id; its title's `for` names the system field.
    const target = container?.querySelector('label[for]')?.getAttribute('for') ?? '';
    return target === '_systemfield_location' ? 'location' : undefined;
  },
};

/** docs.google.com/forms: `[role=listitem]` with a `[role=heading]` per question. */
const googleForms: Adapter = {
  platform: 'googleForms',
  containers: (doc) =>
    [...doc.querySelectorAll('[role="listitem"]')].filter(
      (item) =>
        item.querySelector('[role="heading"]') && !item.parentElement?.closest('[role="listitem"]'),
    ),
  label: (c) => visibleText(c.querySelector('[role="heading"]')),
  title: (doc) =>
    visibleText(
      doc.querySelector('form [role="heading"][aria-level="1"], [role="heading"][aria-level="1"]'),
    ) || undefined,
};

/** forms.office.com / forms.cloud.microsoft: `[data-automation-id=questionItem]`. */
const microsoftForms: Adapter = {
  platform: 'microsoftForms',
  containers: (doc) => [...doc.querySelectorAll('[data-automation-id="questionItem"]')],
  label(c) {
    const heading = c.querySelector('[data-automation-id="questionTitle"] [role="heading"]');
    if (!heading) return '';
    const copy = heading.cloneNode(true) as Element;
    copy.querySelectorAll('[data-automation-id="questionOrdinal"]').forEach((n) => n.remove());
    return visibleText(copy);
  },
  title: (doc) => visibleText(doc.querySelector('[data-automation-id="formTitle"]')) || undefined,
};

const ADAPTERS: Record<AutofillPlatform, Adapter> = {
  greenhouse,
  lever,
  ashby,
  googleForms,
  microsoftForms,
};

/** The adapter for a page: by URL, or by markup (a board on a company's own domain). */
function adapterFor(doc: Document, url: URL): Adapter | undefined {
  const platform = autofillPlatform(url);
  if (platform) return ADAPTERS[platform];
  if (doc.querySelector('.ashby-application-form-field-entry')) return ashby;
  if (doc.querySelector('li.application-question')) return lever;
  if (doc.querySelector('#application-form .field-wrapper, #application_form')) return greenhouse;
  return undefined;
}

// --- Reading controls --------------------------------------------------------------------------

const CONTROLS =
  'input, select, textarea, [role="combobox"], [role="listbox"], [role="radio"], [role="checkbox"]';
const SKIPPED_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color',
  'search',
]);

const TEXT_KINDS: Record<string, ControlKind> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  date: 'date',
  month: 'date',
  'datetime-local': 'date',
};

function byDocumentOrder(a: Raw, b: Raw): number {
  if (a.element === b.element) return 0;
  return a.element.compareDocumentPosition(b.element) & 4 /* FOLLOWING */ ? -1 : 1;
}

function commonAncestor(elements: Element[]): HTMLElement {
  let node: Element | null = elements[0]!.parentElement;
  while (node && !elements.every((el) => node!.contains(el))) node = node.parentElement;
  return (node ?? elements[0]!.ownerDocument.body) as HTMLElement;
}

/** A choice the user can see (radios are often styled: their label is what shows). */
function visibleChoice(el: Element, options: ScanOptions): boolean {
  if (neverFill(el, { layout: false })) return false;
  if (!options.layout) return true;
  const label = el.closest('label') ?? el;
  return label.getClientRects().length > 0;
}

function isDateLike(el: Element): boolean {
  return (
    el.getAttribute('aria-haspopup') === 'dialog' ||
    !!el.closest('[data-automation-id="dateContainer"], .react-datepicker__input-container') ||
    /input-date|datepicker/i.test(el.getAttribute('class') ?? '')
  );
}

/** The questions inside `root`, one per control or group of choices. */
function collect(root: ParentNode, options: ScanOptions, seen: Set<Element>): Raw[] {
  const out: Raw[] = [];

  // Ashby's Yes / No buttons (with a hidden checkbox that holds the answer).
  for (const box of root.querySelectorAll('.ashby-application-form-input-yesno')) {
    if (seen.has(box)) continue;
    seen.add(box);
    box.querySelectorAll(CONTROLS).forEach((el) => seen.add(el));
    const buttons = [...box.querySelectorAll<HTMLElement>('button')].filter(
      (b) => !neverFill(b, options),
    );
    if (!buttons.length) continue;
    out.push({
      kind: 'yesno',
      element: box as HTMLElement,
      choices: buttons.map((el) => ({ label: cleanLabel(visibleText(el)), el })),
      label: '',
      multiple: false,
    });
  }

  for (const node of root.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (seen.has(node)) continue;
    seen.add(node);
    const role = node.getAttribute('role');

    if (node instanceof HTMLInputElement) {
      const type = node.type.toLowerCase();
      if (
        type === 'password' ||
        SKIPPED_TYPES.has(type) ||
        node.getAttribute('role') === 'searchbox'
      )
        continue;
      if (type === 'file') {
        if (neverFill(node, { layout: false }) === 'captcha') continue;
        out.push({
          kind: 'file',
          element: node,
          choices: [],
          label: labelOf(node),
          multiple: false,
        });
        continue;
      }
      if (type === 'radio' || type === 'checkbox') {
        const name = node.name;
        const group = name
          ? [
              ...(node.form ?? node.ownerDocument).querySelectorAll<HTMLInputElement>(
                `input[type="${type}"]`,
              ),
            ].filter((r) => r.name === name && root.contains(r))
          : [node];
        group.forEach((r) => seen.add(r));
        const groupBox = node.closest('[role="radiogroup"], [role="group"], fieldset');
        // The "Other" answer's text box belongs to the group (Microsoft Forms).
        groupBox
          ?.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])')
          .forEach((el) => seen.add(el));
        const visible = group.filter((r) => visibleChoice(r, options));
        const choices = visible
          .map((el) => ({ label: choiceLabelOf(el), el }))
          .filter((c) => c.label && !/^other( answer)?$/i.test(c.label));
        if (!choices.length) continue;
        const holder =
          (node.closest('[role="radiogroup"], [role="group"], fieldset') as HTMLElement | null) ??
          (group.length > 1
            ? commonAncestor(group)
            : (node.closest('label')?.parentElement ?? node.parentElement!));
        const single = type === 'checkbox' && group.length === 1 && !node.closest('fieldset');
        out.push({
          kind: type === 'radio' ? 'radio' : 'checkbox',
          element: holder,
          choices,
          label: single ? choices[0]!.label : groupLabelOf(holder, node),
          multiple: type === 'checkbox' && group.length > 1,
        });
        continue;
      }
      if (neverFill(node, options)) continue;
      if (role === 'combobox') {
        const kind = isDateLike(node) ? 'date' : 'dropdown';
        out.push({ kind, element: node, choices: [], label: labelOf(node), multiple: false });
        continue;
      }
      const kind = isDateLike(node) ? 'date' : (TEXT_KINDS[type] ?? 'text');
      out.push({ kind, element: node, choices: [], label: labelOf(node), multiple: false });
      continue;
    }

    if (node instanceof HTMLTextAreaElement) {
      if (neverFill(node, options)) continue;
      out.push({
        kind: 'textarea',
        element: node,
        choices: [],
        label: labelOf(node),
        multiple: false,
      });
      continue;
    }

    if (node instanceof HTMLSelectElement) {
      if (neverFill(node, options)) continue;
      const choices = [...node.options]
        .filter((o) => o.value !== '' && !o.disabled)
        .map((o) => ({ label: cleanLabel(o.text), el: o as unknown as HTMLElement }));
      out.push({
        kind: 'select',
        element: node,
        choices,
        label: labelOf(node),
        multiple: node.multiple,
      });
      continue;
    }

    // ARIA radios and checkboxes (Google Forms): grouped by their radiogroup or list.
    if (role === 'radio' || role === 'checkbox') {
      const holder = (node.closest(
        role === 'radio' ? '[role="radiogroup"]' : '[role="list"], [role="group"]',
      ) ?? node.parentElement) as HTMLElement;
      const group = [...holder.querySelectorAll<HTMLElement>(`[role="${role}"]`)].filter(
        (el) => !(el instanceof HTMLInputElement),
      );
      group.forEach((el) => seen.add(el));
      // Text boxes for "Other" answers belong to the group.
      holder.querySelectorAll('input, textarea').forEach((el) => seen.add(el));
      const choices = group
        .filter((el) => !neverFill(el, { layout: false }))
        .map((el) => ({ label: choiceLabelOf(el), el }))
        .filter((c) => c.label && c.label !== '__other_option__');
      if (!choices.length) continue;
      out.push({
        kind: role,
        element: holder,
        choices,
        label: groupLabelOf(holder, node),
        multiple: role === 'checkbox' && group.length > 1,
      });
      continue;
    }

    if (role === 'listbox') {
      if (neverFill(node, options)) continue;
      const choices = [...node.querySelectorAll<HTMLElement>('[role="option"]')]
        .map((el) => ({ label: cleanLabel(el.getAttribute('data-value') ?? visibleText(el)), el }))
        .filter((c, i, all) => c.label && all.findIndex((o) => o.label === c.label) === i);
      node.querySelectorAll('[role="option"]').forEach((el) => seen.add(el));
      out.push({ kind: 'dropdown', element: node, choices, label: labelOf(node), multiple: false });
      continue;
    }

    if (role === 'combobox') {
      if (neverFill(node, options)) continue;
      out.push({
        kind: 'dropdown',
        element: node,
        choices: [],
        label: labelOf(node),
        multiple: false,
      });
    }
  }
  return out.sort(byDocumentOrder);
}

// --- Current values ----------------------------------------------------------------------------

function currentValue(raw: Raw): string {
  const el = raw.element;
  switch (raw.kind) {
    case 'select': {
      const select = el as HTMLSelectElement;
      const picked = [...select.selectedOptions].filter((o) => o.value !== '');
      return picked.map((o) => cleanLabel(o.text)).join(', ');
    }
    case 'radio':
    case 'checkbox':
      return raw.choices
        .filter((c) =>
          c.el instanceof HTMLInputElement
            ? c.el.checked
            : c.el.getAttribute('aria-checked') === 'true',
        )
        .map((c) => c.label)
        .join(', ');
    case 'yesno':
      return raw.choices.find((c) => c.el.getAttribute('aria-pressed') === 'true')?.label ?? '';
    case 'dropdown': {
      if (el.getAttribute('role') === 'listbox') {
        return raw.choices.find((c) => c.el.getAttribute('aria-selected') === 'true')?.label ?? '';
      }
      // react-select shows the picked option next to its input.
      const control = el.closest('.select__control, [class*="-control"]');
      const single = control?.querySelector(
        '.select__single-value, [class*="singleValue"], .select__multi-value',
      );
      if (single) return cleanLabel(visibleText(single));
      if (el instanceof HTMLInputElement) return el.value.trim();
      const text = cleanLabel(visibleText(el));
      return isGenericLabel(text) ? '' : text;
    }
    case 'file':
      return '';
    default:
      return ((el as HTMLInputElement).value ?? '').trim();
  }
}

function isRequired(raw: Raw): boolean {
  const els = [raw.element, ...raw.choices.map((c) => c.el)];
  return els.some(
    (el) =>
      (el as HTMLInputElement).required === true || el.getAttribute('aria-required') === 'true',
  );
}

/** The box to highlight for a question. */
function containerOf(raw: Raw, adapterContainer: Element | undefined): HTMLElement {
  if (adapterContainer) return adapterContainer as HTMLElement;
  return (raw.element.closest(
    '.field-wrapper, .file-upload, li, fieldset, [role="listitem"], [data-automation-id="questionItem"]',
  ) ?? (raw.kind === 'file' ? raw.element.parentElement : raw.element)) as HTMLElement;
}

const FORM_FRAME =
  /greenhouse\.io|lever\.co|ashbyhq\.com|docs\.google\.com\/forms|forms\.office\.com|forms\.cloud\.microsoft/;

/** Reads the application form in `doc`. */
export function scanForm(doc: Document, url: URL, options: ScanOptions = {}): FormScan {
  const opts = { layout: options.layout ?? true };
  const adapter = adapterFor(doc, url);
  const seen = new Set<Element>();
  const found: { raw: Raw; container?: Element; containerLabel: string }[] = [];

  for (const container of adapter?.containers(doc) ?? []) {
    const raws = collect(container, opts, seen);
    const containerLabel = cleanLabel(adapter!.label(container));
    for (const raw of raws)
      found.push({ raw, container, containerLabel: raws.length === 1 ? containerLabel : '' });
  }
  // Anything outside the containers (or every control, without an adapter).
  for (const raw of collect(doc, opts, seen)) found.push({ raw, containerLabel: '' });
  found.sort((a, b) => byDocumentOrder(a.raw, b.raw));

  const refs = new Map<string, QuestionRef>();
  const questions: ScannedQuestion[] = [];
  for (const [index, { raw, container, containerLabel }] of found.entries()) {
    const label =
      containerLabel || raw.label || (container ? cleanLabel(adapter!.label(container)) : '');
    const hintSource =
      raw.kind === 'radio' || raw.kind === 'checkbox' ? raw.choices[0]?.el : raw.element;
    const hint = hintSource ? adapter?.hint?.(hintSource, container) : undefined;
    const options = raw.choices.map((c) => c.label);
    const input = raw.element instanceof HTMLInputElement ? raw.element : undefined;
    const question: ScannedQuestion = {
      id: `q${index}`,
      label,
      kind: raw.kind,
      options,
      multiple: raw.multiple,
      required: isRequired(raw),
      currentValue: currentValue(raw),
      ...(input ? { inputType: input.type.toLowerCase() } : {}),
      ...(input?.placeholder ? { placeholder: input.placeholder } : {}),
      // react-datepicker (Ashby) reads MM/dd/yyyy unless told otherwise; its placeholder says
      // "Pick date...".
      ...(raw.kind === 'date' && raw.element.closest('.react-datepicker__input-container')
        ? { dateFormat: 'MM/dd/yyyy' }
        : {}),
      ...(input?.autocomplete && input.autocomplete !== 'off'
        ? { autocomplete: input.autocomplete }
        : {}),
      ...(hint ? { hint } : {}),
      ...(raw.kind !== 'file' &&
      isConsentQuestion(label, raw.kind === 'checkbox' || raw.kind === 'radio' ? options : [])
        ? { consent: true }
        : {}),
    };
    questions.push(question);
    refs.set(question.id, {
      question,
      element: raw.element,
      choices: raw.choices,
      container: containerOf(raw, container),
    });
  }

  // A separate country-code picker means the phone number goes in without its code.
  if (questions.some((q) => q.hint === 'phoneCountry')) {
    for (const q of questions)
      if (q.hint === 'phone' || q.kind === 'tel') q.separateCountryCode = true;
  }

  const formFrames = [...doc.querySelectorAll('iframe[src]')]
    .map((f) => (f as HTMLIFrameElement).src)
    .filter((src) => FORM_FRAME.test(src));

  return {
    result: {
      url: url.href,
      ...(adapter ? { platform: adapter.platform } : {}),
      ...(adapter?.title?.(doc) ? { title: adapter.title(doc) } : {}),
      questions,
      formFrames,
      confirmation: detectConfirmation(doc, url),
    },
    refs,
  };
}

/** Whether a scan found something worth filling (two questions or more that aren't files). */
export function looksLikeApplicationForm(scan: ScanResult): boolean {
  return scan.questions.filter((q) => q.kind !== 'file').length >= 2;
}

export { isHidden };
