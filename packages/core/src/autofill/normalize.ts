/**
 * Question labels as the matcher compares them: lowercase, accents and punctuation gone,
 * required markers and filler ("please", "(optional)") dropped, whitespace collapsed.
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'have',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'please',
  'the',
  'this',
  'to',
  'us',
  'we',
  'what',
  'which',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

/** "First Name *" → "first name"; "E-mail address (required)" → "e mail address". */
export function normalizeLabel(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/\((?:optional|required|if applicable)\)/g, ' ')
    .replace(/\brequired( question| field)?\b/g, ' ')
    .replace(/[^\p{L}\p{N}#+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words of a normalized label. */
export function tokens(normalized: string): string[] {
  return normalized ? normalized.split(' ') : [];
}

/** Words that carry meaning (stopwords left out). */
export function significantTokens(normalized: string): string[] {
  return tokens(normalized).filter((t) => !STOPWORDS.has(t));
}

/** Whether `phrase` (normalized) appears in `text` (normalized) as whole words. */
export function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

/** Whether every word of `phrase` appears in `text`, in any order. */
export function containsAllWords(text: string, phrase: string): boolean {
  const words = new Set(tokens(text));
  return tokens(phrase).every((w) => words.has(w));
}

/** Dice coefficient of two word sets (0–1), stopwords left out. */
export function wordSimilarity(a: string, b: string): number {
  const x = new Set(significantTokens(normalizeLabel(a)).map(stem));
  const y = new Set(significantTokens(normalizeLabel(b)).map(stem));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return (2 * shared) / (x.size + y.size);
}

/** A crude stem so "looking" ≈ "look", "roles" ≈ "role". */
function stem(word: string): string {
  return word.length > 4 ? word.replace(/(ing|ed|es|s)$/, '') : word;
}
