/**
 * What Autofill never touches: hidden fields (including honeypots, traps for bots that fill
 * every field), password fields, CAPTCHAs, disabled or read-only fields. File inputs are never
 * filled either; they're reported so the page can point at them. Fields that already have a value
 * are left alone unless the user asks to overwrite (decided in the plan).
 */

const CAPTCHA = /captcha|recaptcha|hcaptcha|h-captcha|turnstile|cf-chl|arkose|funcaptcha/i;
const HONEYPOT =
  /honey ?pot|\bhp[_-]|bot[_-]?(field|check|trap)|leave[_-]?(this[_-]?)?blank|do[_-]?not[_-]?fill|fax_only|^url_?confirm$/i;

function attrs(el: Element): string {
  return [
    el.id,
    el.getAttribute('name'),
    el.getAttribute('class'),
    el.getAttribute('data-sitekey') ? 'captcha' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** A CAPTCHA widget or its response field (the element or one of its close ancestors). */
export function isCaptcha(el: Element): boolean {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    if (CAPTCHA.test(attrs(node))) return true;
  }
  return false;
}

/** A field named or labelled like a bot trap. */
export function isHoneypot(el: Element): boolean {
  if (HONEYPOT.test(attrs(el))) return true;
  const label = el.getAttribute('aria-label') ?? '';
  return /leave (this )?(field )?(blank|empty)|do not fill/i.test(label);
}

/**
 * Hidden from the user: `type=hidden`, `hidden`, `aria-hidden`, `display:none` or
 * `visibility:hidden` on it or an ancestor. With `layout` (a real browser, not a test DOM), also
 * anything with no box or placed far off-screen (a common honeypot trick).
 */
export function isHidden(el: Element, { layout = true }: { layout?: boolean } = {}): boolean {
  if (el instanceof HTMLInputElement && el.type === 'hidden') return true;
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return true;
    const style = view?.getComputedStyle(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  }
  if (layout && typeof (el as HTMLElement).getBoundingClientRect === 'function') {
    if (!el.getClientRects().length) return true;
    const rect = el.getBoundingClientRect();
    if (rect.right < -500 || rect.bottom < -500) return true;
  }
  return false;
}

export function isDisabled(el: Element): boolean {
  return (
    (el as HTMLInputElement).disabled === true ||
    (el as HTMLInputElement).readOnly === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('aria-readonly') === 'true' ||
    !!el.closest('fieldset[disabled]')
  );
}

export type SkipReason = 'hidden' | 'honeypot' | 'captcha' | 'password' | 'disabled';

/** Why a control must never be filled, or undefined when it may be. Files are handled apart. */
export function neverFill(el: Element, options: { layout?: boolean } = {}): SkipReason | undefined {
  if (el instanceof HTMLInputElement && el.type === 'password') return 'password';
  if (isCaptcha(el)) return 'captcha';
  if (isHoneypot(el)) return 'honeypot';
  if (isHidden(el, options)) return 'hidden';
  if (isDisabled(el)) return 'disabled';
  return undefined;
}

/** Consent, terms and attestations: always the user's to answer, even with a saved answer. */
const CONSENT =
  /\b(consent|i agree|agree to|agreement to|acknowledge|acknowledgement|terms and conditions|terms of (use|service)|privacy (policy|notice)|certify|attest|attestation|i confirm|i understand|accurate and complete|true and complete)\b/i;

export function isConsentQuestion(label: string, options: readonly string[] = []): boolean {
  return CONSENT.test(label) || options.some((o) => CONSENT.test(o));
}
