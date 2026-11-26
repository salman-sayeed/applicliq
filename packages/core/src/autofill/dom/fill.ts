import { type OptionKind, pickOption } from '../options';
import type { QuestionRef } from './scan';
import { cleanLabel, visibleText } from './label';

/**
 * Writes answers into a page's form the way typing and clicking would, so React and other
 * frameworks notice: the element's native value setter, then `input`, `change` and `blur`.
 * Choices are clicked; custom dropdowns (react-select, Google Forms, Microsoft Forms) are opened,
 * searched and picked from. Nothing here ever submits a form.
 */

/** Undoes one filled question; false when it can't be put back exactly. */
export type Undo = () => Promise<boolean>;

export type FillOutcome =
  { ok: true; undo: Undo } | { ok: false; reason: 'gone' | 'no-option' | 'not-applied' };

export type FillTiming = {
  /** How long to wait for a dropdown's options (ms). */
  optionTimeout?: number;
  /** Polling step while waiting (ms). */
  step?: number;
  /** How long a widget gets to react to a press before the next way is tried (ms). */
  settle?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  read: () => T | undefined,
  timeout: number,
  step: number,
): Promise<T | undefined> {
  const end = Date.now() + timeout;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() >= end) return undefined;
    await sleep(step);
  }
}

function fire(el: Element, type: string, init: EventInit = { bubbles: true }) {
  const view = el.ownerDocument.defaultView;
  const Ctor =
    type === 'blur' || type === 'focus' || type === 'focusout' || type === 'focusin'
      ? (view?.FocusEvent ?? FocusEvent)
      : type.startsWith('mouse') || type === 'click'
        ? (view?.MouseEvent ?? MouseEvent)
        : (view?.Event ?? Event);
  el.dispatchEvent(new Ctor(type, { cancelable: true, ...init }));
}

/** Sets `value` through the prototype's setter (what typing does), not the instance's. */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const view = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const proto =
    el instanceof (view?.HTMLTextAreaElement ?? HTMLTextAreaElement)
      ? (view?.HTMLTextAreaElement ?? HTMLTextAreaElement).prototype
      : el instanceof (view?.HTMLSelectElement ?? HTMLSelectElement)
        ? (view?.HTMLSelectElement ?? HTMLSelectElement).prototype
        : (view?.HTMLInputElement ?? HTMLInputElement).prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/** Puts text in a field and tells the page, as typing then leaving the field would. */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  fire(el, 'focus', { bubbles: false });
  fire(el, 'focusin');
  setNativeValue(el, value);
  fire(el, 'input');
  fire(el, 'change');
  fire(el, 'blur', { bubbles: false });
  fire(el, 'focusout');
}

/**
 * Where a real click on `el` lands: the innermost element at its centre (Google Forms only
 * reacts when the event comes from inside its widgets), or `el` itself when that point is
 * covered by something else or there's no layout.
 */
function clickTarget(el: Element): { target: Element; x: number; y: number } {
  const doc = el.ownerDocument;
  const rect = el.getBoundingClientRect?.();
  if (!rect || !rect.width || !rect.height || typeof doc.elementFromPoint !== 'function') {
    return { target: el, x: 0, y: 0 };
  }
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = doc.elementFromPoint(x, y);
  return { target: hit && el.contains(hit) ? hit : el, x, y };
}

/** Pointer and mouse down/up as a real press makes them (view, buttons, position); no click. */
function pointerPress(el: Element) {
  const { target, x, y } = clickTarget(el);
  const view = el.ownerDocument.defaultView;
  const Pointer =
    view?.PointerEvent ?? (typeof PointerEvent === 'undefined' ? undefined : PointerEvent);
  const Mouse = view?.MouseEvent ?? MouseEvent;
  const init = (down: boolean) => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: down ? 1 : 0,
    clientX: x,
    clientY: y,
    ...(view ? { view } : {}),
  });
  if (Pointer)
    target.dispatchEvent(new Pointer('pointerdown', { ...init(true), pointerType: 'mouse' }));
  target.dispatchEvent(new Mouse('mousedown', init(true)));
  if (Pointer)
    target.dispatchEvent(new Pointer('pointerup', { ...init(false), pointerType: 'mouse' }));
  target.dispatchEvent(new Mouse('mouseup', init(false)));
}

/** How long a widget gets to react before the next way of pressing is tried (ms). */
const SETTLE_MS = 350;

/**
 * Presses a custom widget once, the way it listens: widgets react to different parts of a click
 * (Greenhouse's dropdowns open on pointer-down, Google Forms' choices toggle on either the
 * pointer events or the click, react-select picks on click). So: pointer/mouse down and up, check
 * `done`, and only if nothing happened, a click. Never both, so a toggle isn't undone.
 */
async function activate(el: Element, done: () => boolean, settle = SETTLE_MS): Promise<boolean> {
  pointerPress(el);
  await sleep(settle);
  if (done()) return true;
  (clickTarget(el).target as HTMLElement).click();
  await sleep(settle);
  return done();
}

function isShown(el: Element): boolean {
  // Test DOMs have no layout: everything counts as shown there.
  if (typeof el.getClientRects !== 'function') return true;
  const rects = el.getClientRects();
  const view = el.ownerDocument.defaultView;
  const noLayout = view?.navigator?.userAgent?.includes('HappyDOM') ?? false;
  return noLayout || rects.length > 0;
}

function textOfOption(el: Element): string {
  return cleanLabel(
    el.getAttribute('data-value') || el.getAttribute('aria-label') || visibleText(el),
  );
}

const OPTION_SELECTOR = '[role="option"], .select__option';

/** The options a just-opened dropdown shows, matched against `value`. */
function findOption(
  doc: Document,
  value: string,
  kind: OptionKind,
  within?: Element | null,
): HTMLElement | undefined {
  const scope: ParentNode = within ?? doc;
  const shown = [...scope.querySelectorAll<HTMLElement>(OPTION_SELECTOR)].filter(
    (o) => isShown(o) && o.getAttribute('aria-disabled') !== 'true' && textOfOption(o),
  );
  if (!shown.length) return undefined;
  const picked = pickOption(value, shown.map(textOfOption), kind);
  if (!picked) return undefined;
  // Several copies (Google Forms keeps one in the closed list): the last is the open popup's.
  return shown.filter((o) => textOfOption(o) === picked).pop();
}

/** The listbox a combobox controls, if it says. */
function controlledList(el: Element): Element | null {
  const id = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
  return id ? el.ownerDocument.getElementById(id) : null;
}

// --- Per kind -----------------------------------------------------------------------------------

function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): FillOutcome {
  const before = el.value;
  typeInto(el, value);
  return {
    ok: true,
    undo: async () => {
      if (!el.isConnected) return false;
      typeInto(el, before);
      return true;
    },
  };
}

function fillSelect(el: HTMLSelectElement, value: string): FillOutcome {
  const options = [...el.options].filter((o) => o.value !== '' && !o.disabled);
  const picked = pickOption(
    value,
    options.map((o) => cleanLabel(o.text)),
  );
  const option = options.find((o) => cleanLabel(o.text) === picked);
  if (!option) return { ok: false, reason: 'no-option' };
  const before = el.value;
  fire(el, 'focus', { bubbles: false });
  setNativeValue(el, option.value);
  fire(el, 'input');
  fire(el, 'change');
  fire(el, 'blur', { bubbles: false });
  return {
    ok: true,
    undo: async () => {
      if (!el.isConnected) return false;
      setNativeValue(el, before);
      fire(el, 'input');
      fire(el, 'change');
      return true;
    },
  };
}

/** Flips a choice: a click for native inputs; for ARIA ones, whichever press they answer to. */
async function toggle(el: HTMLElement): Promise<void> {
  const before = isChecked(el);
  if (el instanceof HTMLInputElement) el.click();
  else await activate(el, () => isChecked(el) !== before);
}

const isChecked = (el: Element) =>
  el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true';

async function fillChoices(
  ref: QuestionRef,
  values: string[],
  multiple: boolean,
): Promise<FillOutcome> {
  const labels = ref.choices.map((c) => c.label);
  const targets = values
    .map((v) => pickOption(v, labels))
    .filter((v): v is string => !!v)
    .map((label) => ref.choices.find((c) => c.label === label)!)
    .slice(0, multiple ? undefined : 1);
  if (!targets.length) return { ok: false, reason: 'no-option' };
  const before = ref.choices.filter((c) => isChecked(c.el));
  const clicked: HTMLElement[] = [];
  for (const { el } of targets) {
    if (isChecked(el)) continue;
    await toggle(el);
    clicked.push(el);
  }
  return {
    ok: true,
    undo: async () => {
      if (!ref.element.isConnected) return false;
      if (multiple) {
        for (const el of clicked) if (isChecked(el)) await toggle(el);
        return true;
      }
      const previous = before[0]?.el;
      if (previous) {
        if (!isChecked(previous)) await toggle(previous);
        return true;
      }
      // A single choice can't be unticked by clicking; native radios can be reset directly.
      const only = clicked[0];
      if (only instanceof HTMLInputElement && only.type === 'radio') {
        only.checked = false;
        fire(only, 'change');
        return true;
      }
      if (only instanceof HTMLInputElement && only.type === 'checkbox') {
        only.click();
        return true;
      }
      return false;
    },
  };
}

async function fillYesNo(ref: QuestionRef, value: string): Promise<FillOutcome> {
  const picked = pickOption(
    value,
    ref.choices.map((c) => c.label),
    'yesno',
  );
  const choice = ref.choices.find((c) => c.label === picked);
  if (!choice) return { ok: false, reason: 'no-option' };
  const before = ref.choices.find((c) => c.el.getAttribute('aria-pressed') === 'true');
  const pressed = (c: { el: HTMLElement }) => () => c.el.getAttribute('aria-pressed') === 'true';
  if (before !== choice) await activate(choice.el, pressed(choice));
  return {
    ok: true,
    undo: async () => {
      if (!ref.element.isConnected) return false;
      if (before && before !== choice) {
        await activate(before.el, pressed(before));
        return true;
      }
      return before === choice;
    },
  };
}

/** Opens a custom dropdown, searches when it has a search box, and picks the option. */
async function fillDropdown(
  ref: QuestionRef,
  value: string,
  kind: OptionKind,
  timing: Required<FillTiming>,
): Promise<FillOutcome> {
  const el = ref.element;
  const doc = el.ownerDocument;
  const Key = doc.defaultView?.KeyboardEvent ?? KeyboardEvent;
  const searchable = el instanceof HTMLInputElement;
  const find = () =>
    findOption(doc, value, kind, controlledList(el)) ?? findOption(doc, value, kind);
  const wait = (ms: number) => waitFor(find, ms, timing.step);

  let option: HTMLElement | undefined;
  const listShown = () =>
    el.getAttribute('aria-expanded') === 'true' ||
    [...doc.querySelectorAll(OPTION_SELECTOR)].some(
      (o) => isShown(o) && o.closest('[role="listbox"]') !== el,
    );
  if (searchable) {
    // Open the list the way a click does, then search in it.
    await activate(el, listShown, timing.settle);
    el.focus();
    fire(el, 'focusin');
    // Search with the text first (type-ahead lists, long country lists)…
    if (kind === 'text' || kind === 'country' || kind === 'yesno') {
      setNativeValue(el, value);
      fire(el, 'input');
      option = await wait(timing.optionTimeout);
    }
    // …then the whole list (number ranges, "Decline to self-identify", wording that differs).
    if (!option) {
      setNativeValue(el, '');
      fire(el, 'input');
      el.dispatchEvent(new Key('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
      option = await wait(Math.min(timing.optionTimeout, 1500));
    }
  } else {
    await activate(el, listShown, timing.settle);
    option = await wait(timing.optionTimeout);
  }
  if (!option) {
    // Leave it as it was: no half-typed search text, no list left open.
    if (searchable) {
      setNativeValue(el, '');
      fire(el, 'input');
    }
    el.dispatchEvent(new Key('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    if (searchable) fire(el, 'blur', { bubbles: false });
    return { ok: false, reason: 'no-option' };
  }
  const picked = option;
  // A listbox (Google Forms) says which option is selected; other lists close when one is picked.
  const isListbox = el.getAttribute('role') === 'listbox';
  const chosen = await activate(
    picked,
    () =>
      picked.getAttribute('aria-selected') === 'true' ||
      (!isListbox &&
        (!picked.isConnected || !isShown(picked) || el.getAttribute('aria-expanded') === 'false')),
    timing.settle,
  );
  if (!chosen && isListbox) return { ok: false, reason: 'not-applied' };
  if (searchable) fire(el, 'blur', { bubbles: false });
  return {
    ok: true,
    // Custom dropdowns have no reliable way back to the earlier choice: reported to the user.
    undo: async () => false,
  };
}

/**
 * Fills one question. `values` is for checkbox groups; otherwise `value` is the text or the
 * option to pick.
 */
export async function fillQuestion(
  ref: QuestionRef,
  {
    value,
    values,
    optionKind = 'text',
  }: { value: string; values?: string[]; optionKind?: OptionKind },
  timing: FillTiming = {},
): Promise<FillOutcome> {
  const t = {
    optionTimeout: timing.optionTimeout ?? 2500,
    step: timing.step ?? 50,
    settle: timing.settle ?? SETTLE_MS,
  };
  if (!ref.element.isConnected) return { ok: false, reason: 'gone' };
  const el = ref.element;
  switch (ref.question.kind) {
    case 'file':
      return { ok: false, reason: 'not-applied' };
    case 'select':
      return fillSelect(el as HTMLSelectElement, value);
    case 'radio':
      return fillChoices(ref, [value], false);
    case 'checkbox':
      return fillChoices(ref, values?.length ? values : [value], ref.question.multiple);
    case 'yesno':
      return fillYesNo(ref, value);
    case 'dropdown':
      return fillDropdown(ref, value, optionKind, t);
    default:
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        return fillText(el, value);
      return { ok: false, reason: 'not-applied' };
  }
}
