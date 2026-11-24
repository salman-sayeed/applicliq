import { normalizeText } from './text';

/**
 * "Other keywords": 2–3 word phrases a job description repeats that aren't dictionary skills
 * ("customer journey", "supply chain planning"). Common words and generic job-ad words never
 * start or end one.
 */

export const MAX_KEYWORDS = 10;

// prettier-ignore
const STOPWORDS = new Set(`a about above across after again against all almost along also although always am among an and
another any anyone anything are around as at be became because become been before being below between both but by can
cannot could did do does doing done down during each either else etc even ever every few for from further get gets
getting give given go goes going good got great had has have having he her here hers him his how however i if in into
is it its itself just keep least less like likely make makes making many may me might more most much must my near
need needs neither never new next no nor not now of off often on once one only onto or other others our ours out over
own per perhaps please plus quite rather really same see seen several shall she should since so some such than that
the their theirs them then there these they this those though through throughout thus to together too toward towards
under until up upon us use used uses using very via was we well were what whatever when where whether which while who
whom whose why will with within without would yes yet you your yours yourself e.g i.e eg ie`.split(/\s+/));

/** Words in every job ad that say nothing about this one. */
// prettier-ignore
const GENERIC = new Set(`ability able across apply applicant applicants application applications background based
benefit benefits best candidate candidates career careers company companies competitive day days degree environment
equal excellent employer employment experience experienced experiences field fast familiarity global grow growth
help high highly ideal including individual job jobs join key knowledge level looking members minimum new offer
opportunity opportunities paced passion passionate people plus position preferred proven related required
requirement requirements responsibilities responsibility responsible role roles salary skill skills strong team
teams time understanding work working works world year years youll well-being bonus etc including include includes
qualifications qualification please must preferred plus range description status gender race religion orientation
disability veteran national origin age based applicants regardless consideration`.split(/\s+/));

const isNoise = (word: string) =>
  STOPWORDS.has(word) || GENERIC.has(word) || word.length < 2 || /^\d/.test(word);

/** Plural-insensitive form: "relationships" and "relationship" count as one. */
export function stem(word: string): string {
  return word.length > 3 && /[^su]s$/.test(word) && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/** Words between punctuation, as written (`segments(text, true)` lowercases them). */
function segments(text: string, lower = true): string[][] {
  const normalized = normalizeText(text);
  return (lower ? normalized.toLowerCase() : normalized)
    .split(/[.!?;:,()[\]{}"\n•·▪●◦|/\\]+/)
    .map((s) => (s.match(/[\p{L}][\p{L}'-]*/gu) ?? []).map((w) => w.replace(/'s$|'$/, '')));
}

export type Keyword = { phrase: string; count: number };

/**
 * The most repeated 2–3 word phrases (at least twice), most frequent first, at most
 * `MAX_KEYWORDS`. `skip` drops phrases that are (or contain) dictionary skills.
 */
export function extractKeywords(text: string, skip: (phrase: string) => boolean): Keyword[] {
  const counts = new Map<
    string,
    { count: number; forms: Map<string, number>; /** Always Capitalized: a name. */ name: boolean }
  >();
  for (const written of segments(text, false)) {
    const words = written.map((w) => w.toLowerCase());
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (isNoise(gram[0]!) || isNoise(gram.at(-1)!)) continue;
        // The middle word of three may be "of" or "and" ("return on investment").
        if (n === 3 && GENERIC.has(gram[1]!)) continue;
        const key = gram.map(stem).join(' ');
        const entry = counts.get(key) ?? { count: 0, forms: new Map(), name: true };
        const form = gram.join(' ');
        entry.count++;
        // "Harbor Payments", "Senior Frontend Engineer": the company or the job title.
        if (!written.slice(i, i + n).every((w) => /^\p{Lu}/u.test(w))) entry.name = false;
        entry.forms.set(form, (entry.forms.get(form) ?? 0) + 1);
        counts.set(key, entry);
      }
    }
  }
  const ranked = [...counts.entries()]
    .filter(([, e]) => e.count >= 2 && !e.name)
    .sort(([a, x], [b, y]) => y.count - x.count || b.split(' ').length - a.split(' ').length);
  const chosen: { key: string; keyword: Keyword }[] = [];
  for (const [key, entry] of ranked) {
    if (chosen.length >= MAX_KEYWORDS) break;
    // "supply chain" and "supply chain planning" are one keyword: keep the first ranked.
    const words = ` ${key} `;
    if (chosen.some((c) => ` ${c.key} `.includes(words) || words.includes(` ${c.key} `))) continue;
    const phrase = [...entry.forms.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    if (skip(phrase)) continue;
    chosen.push({ key, keyword: { phrase, count: entry.count } });
  }
  return chosen.map((c) => c.keyword);
}

/** Whether a text contains a phrase, plural-insensitively and ignoring punctuation. */
export function phraseIndex(text: string): (phrase: string) => boolean {
  const words = segments(text).flat().map(stem);
  const haystack = ` ${words.join(' ')} `;
  return (phrase) => {
    const needle = phrase
      .toLowerCase()
      .split(/\s+/)
      .map((w) => stem(w.replace(/'s$|'$/, '')))
      .join(' ');
    return haystack.includes(` ${needle} `);
  };
}
