/**
 * Text handling for Resume match: tokens that keep the punctuation skills are spelled with
 * ("C++", "C#", ".NET", "Node.js", "R&D"), and where sentences and lines start (short, ambiguous
 * skills like "Go" or "R" need context).
 */

export type Token = {
  /** Lowercased, as matched against the dictionary. */
  norm: string;
  /** As written: strict terms must be capitalized ("Go", not "go"). */
  raw: string;
  /** First token of a sentence, line or list item. */
  start: boolean;
  /** On a Title Case line ("Ready To Go Above And Beyond"): capitals say nothing there. */
  title: boolean;
  /** Index of the line it is on (sections are per line). */
  line: number;
  /** Where it starts in that line. */
  col: number;
};

/**
 * A word: letters/digits, then letters, digits, `+`, `#`, `&` (C++, C#, R&D, P&L), with inner
 * dots kept (node.js, asp.net), or a leading dot when nothing is glued in front (.NET).
 * Hyphens and slashes separate tokens: "CI/CD" is `ci` `cd`, like the dictionary's spelling.
 */
const TOKEN = /\.?[\p{L}\p{N}][\p{L}\p{N}+#&]*(?:\.[\p{L}\p{N}][\p{L}\p{N}+#&]*)*/gu;
const BREAK = /[.!?;:•·▪●◦•*|]|\n/;

export function normalizeText(text: string): string {
  return (
    text
      .normalize('NFKC')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[‐-―−]/g, '-')
      // `<br>`-less HTML snapshots sometimes glue list items with tabs or non-breaking spaces.
      .replace(/[\t\u00a0]/g, ' ')
  );
}

/** Lines that look like Title Case Headings: most words capitalized. */
function isTitleCase(line: string): boolean {
  const words = line.match(/\p{L}[\p{L}'-]*/gu) ?? [];
  if (words.length < 3) return false;
  const upper = words.filter((w) => /^\p{Lu}/u.test(w)).length;
  return upper / words.length >= 0.7;
}

/** Splits text into tokens, with the line each one is on and whether it starts a sentence. */
export function tokenize(input: string): Token[] {
  const text = normalizeText(input);
  const tokens: Token[] = [];
  let line = 0;
  let lineStart = 0;
  let titleLine = isTitleCase(text.slice(0, lineEnd(text, 0)));
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index;
    const gap = text.slice(last, at);
    for (let i = gap.indexOf('\n'); i !== -1; i = gap.indexOf('\n', i + 1)) {
      line++;
      lineStart = last + i + 1;
    }
    if (gap.includes('\n')) titleLine = isTitleCase(text.slice(lineStart, lineEnd(text, at)));
    // Dots are only kept inside a word, so "Java." at the end of a sentence is `java`.
    const raw = match[0];
    tokens.push({
      norm: raw.toLowerCase(),
      raw,
      start: tokens.length === 0 || BREAK.test(gap),
      title: titleLine,
      line,
      col: at - lineStart,
    });
    last = at + match[0].length;
  }
  return tokens;
}

function lineEnd(text: string, from: number): number {
  const end = text.indexOf('\n', from);
  return end === -1 ? text.length : end;
}

/** Splits text into lines (sections are detected line by line). */
export function splitLines(text: string): string[] {
  return normalizeText(text).split('\n');
}
