import { normalizeLabel, significantTokens } from './normalize';

/**
 * Picking the option of a select, radio group, dropdown or yes/no buttons that says what the
 * profile says: exact text first, then yes/no, number ranges, country spellings and partial text.
 */

const COUNTRY_ALIASES: string[][] = [
  ['united states', 'united states of america', 'usa', 'us', 'u s', 'u s a', 'america'],
  ['united kingdom', 'uk', 'u k', 'great britain', 'britain', 'england'],
  ['united arab emirates', 'uae'],
  ['netherlands', 'the netherlands', 'holland'],
  ['south korea', 'korea republic of', 'republic of korea', 'korea'],
  ['czech republic', 'czechia'],
  ['russia', 'russian federation'],
  ['turkey', 'turkiye'],
  ['viet nam', 'vietnam'],
];

function aliasesOf(value: string): string[] {
  const n = normalizeLabel(value);
  return COUNTRY_ALIASES.find((group) => group.includes(n)) ?? [n];
}

const YES = /^(yes|y|true|i am|i do|i will|i can|i have|i would|im)\b/;
const NO =
  /^(no|n|false|i am not|im not|i do not|i dont|i will not|i wont|i cannot|i cant|i have not|i havent|i would not|not)\b/;

/** Whether an option reads as a "yes" or "no" answer. */
export function yesNoOf(option: string): 'yes' | 'no' | undefined {
  const n = normalizeLabel(option);
  // Check "no" first: "not" also starts with "no".
  if (NO.test(n)) return 'no';
  if (YES.test(n)) return 'yes';
  return undefined;
}

/** An option that declines to answer ("Decline to self-identify", "I don't wish to answer"…). */
export const DECLINE_OPTION =
  /\b(decline|declined|dont wish|do not wish|prefer not|not to (say|disclose|answer|specify|self identify)|choose not|rather not|not wish to|wish not)\b/;

export function findDeclineOption(options: readonly string[]): string | undefined {
  return options.find((o) => DECLINE_OPTION.test(normalizeLabel(o)));
}

/** Numbers in a range option: "3-5 years" → [3, 5], "10+ years" → [10, ∞], "Less than 1" → [0, 1). */
function rangeOf(option: string): [number, number] | undefined {
  const n = normalizeLabel(option).replace(/(\d)\s*\+/g, '$1 plus');
  const nums = [...n.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!nums.length) return undefined;
  if (/\b(less than|under|fewer than|below|up to)\b/.test(n)) return [0, nums[0]! - 1e-9];
  if (/\b(plus|more than|over|or more|above|at least)\b/.test(n)) return [nums[0]!, Infinity];
  if (nums.length >= 2) return [nums[0]!, nums[1]!];
  return [nums[0]!, nums[0]!];
}

/** "Select...", "Choose", "Please select one": not answers. */
const PLACEHOLDER_OPTION = /^(please )?(select|choose|pick)( one| an? option| an answer)?\W*$/i;

/** How a value is read against options; `decline` picks the decline-to-answer option. */
export type OptionKind = 'text' | 'yesno' | 'number' | 'country' | 'decline';

/**
 * The option matching `value`, or undefined. `kind` says how to read the value: a yes/no
 * answer, a number to place in a range, a country with other spellings, or plain text.
 */
export function pickOption(
  value: string,
  options: readonly string[],
  kind: OptionKind = 'text',
): string | undefined {
  const usable = options.filter((o) => o.trim() && !PLACEHOLDER_OPTION.test(o.trim()));
  if (kind === 'decline') return findDeclineOption(usable);
  if (!value.trim() || !usable.length) return undefined;
  const target = normalizeLabel(value);
  const exact = usable.find((o) => normalizeLabel(o) === target);
  if (exact) return exact;

  if (kind === 'yesno') {
    const want =
      target === 'yes' || target === 'true'
        ? 'yes'
        : target === 'no' || target === 'false'
          ? 'no'
          : undefined;
    if (want) return usable.find((o) => yesNoOf(o) === want);
  }

  if (kind === 'number') {
    const n = Number(value.replace(/[^\d.]/g, ''));
    if (Number.isFinite(n)) {
      const hit = usable.find((o) => {
        const r = rangeOf(o);
        return r && n >= r[0] && n <= r[1];
      });
      if (hit) return hit;
    }
  }

  if (kind === 'country' || kind === 'text') {
    const names = aliasesOf(value);
    const byAlias = usable.find((o) => {
      const n = normalizeLabel(o);
      // "United Kingdom +44" / "Germany (+49)" in phone-code pickers.
      const name = n.replace(/\s*\+?\d+$/, '').trim();
      return names.includes(n) || names.includes(name);
    });
    if (byAlias) return byAlias;
  }

  // Partial text: the option that covers most of the value's words, with the fewest extra ones
  // ("London, United Kingdom" → "London, Greater London, England, United Kingdom", not
  // "United Kingdom"; "LinkedIn" → "LinkedIn (job post)").
  let best: string | undefined;
  let bestScore = 0.7;
  for (const o of usable) {
    const score = overlapScore(value, o);
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return best;
}

/** How well an option covers a value: mostly recall (value words found), some precision. */
function overlapScore(value: string, option: string): number {
  const v = wordSet(value);
  const o = wordSet(option);
  if (!v.size || !o.size) return 0;
  let shared = 0;
  for (const w of v) if (o.has(w)) shared++;
  return (shared / v.size) * 0.7 + (shared / o.size) * 0.3;
}

function wordSet(text: string): Set<string> {
  return new Set(
    significantTokens(normalizeLabel(text)).map((w) =>
      w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w,
    ),
  );
}
