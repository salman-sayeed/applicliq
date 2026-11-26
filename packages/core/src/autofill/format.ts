import type { AutofillProfile } from './profile';

/**
 * Values formatted for the control they go into: a phone number with or without its country
 * code, a date in the order the field's placeholder shows, a salary as a bare number for a number
 * input or with currency and period for text.
 */

/** "+44 7700 900123", or "7700 900123" when the form has its own country-code picker. */
export function formatPhone(
  profile: Pick<AutofillProfile, 'phoneCountryCode' | 'phoneNumber'>,
  { withCountryCode = true }: { withCountryCode?: boolean } = {},
): string {
  const number = profile.phoneNumber.trim();
  if (!number) return '';
  const code = profile.phoneCountryCode.replace(/\D/g, '');
  if (number.startsWith('+')) {
    // Typed with its code already: drop it if the form asks for the code separately.
    if (withCountryCode || !code) return number;
    return number.replace(new RegExp(`^\\+${code}\\s*`), '').trim() || number;
  }
  if (!withCountryCode || !code) return number;
  // A national number's leading 0 (trunk prefix) goes with an international code: 07700 → 7700.
  return `+${code} ${number.replace(/^0+(?=\d)/, '')}`;
}

/** The date order a placeholder like "MM/DD/YYYY", "dd.mm.yyyy" or "M/d/yyyy" shows. */
export function dateOrderFromPlaceholder(
  placeholder: string | undefined,
): { order: 'mdy' | 'dmy' | 'ymd'; sep: string; pad: boolean } | undefined {
  const p = (placeholder ?? '').toLowerCase();
  const m = p.match(
    /\b(m{1,2}|d{1,2}|y{2,4})([/.\-\s])(m{1,2}|d{1,2}|y{2,4})\2(m{1,2}|d{1,2}|y{2,4})\b/,
  );
  if (!m) return undefined;
  const first = m[1]![0];
  const second = m[3]![0];
  const order = first === 'y' ? 'ymd' : first === 'd' ? 'dmy' : second === 'd' ? 'mdy' : 'dmy';
  return { order, sep: m[2]!, pad: m[1]!.length > 1 || m[3]!.length > 1 };
}

/**
 * An ISO date (`YYYY-MM-DD`) for a field: native date inputs take ISO; a text field follows its
 * placeholder ("M/d/yyyy" → "3/14/2027"), and with no hint gets ISO (unambiguous everywhere).
 */
export function formatDate(
  iso: string,
  { inputType, placeholder }: { inputType?: string; placeholder?: string } = {},
): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  if (inputType === 'date') return iso;
  if (inputType === 'month') return `${y}-${mo}`;
  const format = dateOrderFromPlaceholder(placeholder);
  if (!format) return iso;
  const month = format.pad ? mo : String(Number(mo));
  const day = format.pad ? d : String(Number(d));
  const parts =
    format.order === 'mdy'
      ? [month, day, y]
      : format.order === 'dmy'
        ? [day, month, y]
        : [y, month, day];
  return parts.join(format.sep);
}

const PERIOD_WORDS = { hour: 'per hour', month: 'per month', year: 'per year' } as const;

/**
 * Expected salary: "85000" for a number input, "85,000 EUR per year" for text (only the parts
 * the profile has).
 */
export function formatSalary(
  profile: Pick<AutofillProfile, 'salaryAmount' | 'salaryCurrency' | 'salaryPeriod'>,
  { numeric = false }: { numeric?: boolean } = {},
): string {
  const digits = profile.salaryAmount.replace(/[^\d.]/g, '');
  const amount = Number(digits);
  if (!digits || !Number.isFinite(amount)) return profile.salaryAmount.trim();
  if (numeric) return String(amount);
  const text = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return [
    text,
    profile.salaryCurrency,
    profile.salaryPeriod ? PERIOD_WORDS[profile.salaryPeriod] : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** "Ada Lovelace" from the profile's full name, or first + last. */
export function fullNameOf(
  profile: Pick<AutofillProfile, 'fullName' | 'firstName' | 'lastName'>,
): string {
  return (
    profile.fullName.trim() ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
  );
}

/** First name, from the profile or the first word of the full name. */
export function firstNameOf(profile: Pick<AutofillProfile, 'fullName' | 'firstName'>): string {
  return profile.firstName.trim() || profile.fullName.trim().split(/\s+/)[0] || '';
}

/** Last name, from the profile or what follows the first word of the full name. */
export function lastNameOf(profile: Pick<AutofillProfile, 'fullName' | 'lastName'>): string {
  return profile.lastName.trim() || profile.fullName.trim().split(/\s+/).slice(1).join(' ');
}

/** "Berlin, Germany" from city and country. */
export function locationOf(profile: Pick<AutofillProfile, 'city' | 'country'>): string {
  return [profile.city, profile.country]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
}
