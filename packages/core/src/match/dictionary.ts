import { type Token, tokenize } from './text';

/**
 * The skills dictionary (`skills.json`, loaded lazily). Each category lists entries; an entry is
 * a name, or `[name, ...aliases]`. A spelling starting with `!` is *strict*: short or everyday
 * words ("Go", "R", "Swift", "Excel") match only when capitalized and in context (mid-sentence,
 * next to other skills, or followed by "language", "developer"…), never at the start of an
 * ordinary sentence or as a lowercase word. The name is matched too, unless it is strict.
 */
export type SkillsFile = {
  version: number;
  categories: Record<string, (string | string[])[]>;
};

export type Skill = {
  /** Display name, e.g. "Node.js". */
  name: string;
  category: string;
  /** Every spelling that matches it, lowercased (without the `!`). */
  aliases: string[];
};

type Term = { tokens: string[]; skill: number; strict: boolean };

export type SkillIndex = {
  skills: Skill[];
  /** Terms by their first token, longest first. */
  byFirst: Map<string, Term[]>;
  /** Every token that appears in a term (a dotted word not in here is split at its dots). */
  known: Set<string>;
};

/** Words after a strict term that show it is a skill: "Go developer", "R programming". */
const CONTEXT_AFTER = new Set([
  'language',
  'languages',
  'lang',
  'programming',
  'developer',
  'developers',
  'engineer',
  'engineers',
  'development',
  'code',
  'experience',
  'skills',
  'framework',
  'stack',
  'services',
  'scripting',
]);

/** How far (in tokens) another skill makes a list: "Python, Go, Rust". */
const LIST_WINDOW = 4;

const tokensOf = (spelling: string) => tokenize(spelling).map((t) => t.norm);

export function buildSkillIndex(file: SkillsFile): SkillIndex {
  const skills: Skill[] = [];
  const byFirst = new Map<string, Term[]>();
  const known = new Set<string>();
  const add = (tokens: string[], skill: number, strict: boolean) => {
    if (!tokens.length) return;
    const list = byFirst.get(tokens[0]!) ?? [];
    if (list.some((t) => t.skill === skill && t.tokens.join(' ') === tokens.join(' '))) return;
    list.push({ tokens, skill, strict });
    byFirst.set(tokens[0]!, list);
    tokens.forEach((t) => known.add(t));
  };
  for (const [category, entries] of Object.entries(file.categories)) {
    for (const entry of entries) {
      const [first, ...rest] = Array.isArray(entry) ? entry : [entry];
      if (!first) continue;
      const name = first.replace(/^!/, '');
      const index = skills.length;
      const spellings = [first, ...rest];
      skills.push({
        name,
        category,
        aliases: [...new Set(spellings.map((s) => s.replace(/^!/, '').toLowerCase()))],
      });
      for (const spelling of spellings) {
        const strict = spelling.startsWith('!');
        const tokens = tokensOf(spelling.replace(/^!/, ''));
        add(tokens, index, strict);
        // Plurals: "REST APIs" for "REST API", "design systems" for "design system".
        const last = tokens.at(-1)!;
        if (!strict && /^[a-z]{3,}$/.test(last) && !last.endsWith('s')) {
          add([...tokens.slice(0, -1), `${last}s`], index, false);
        }
      }
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  return { skills, byFirst, known };
}

/** A dictionary skill found in a text, at a token position. */
export type SkillHit = { skill: number; at: number; line: number; col: number };

/** "react.strong" (a missing space after a full stop) becomes `react` `strong`. */
function splitUnknownDotted(tokens: Token[], known: Set<string>): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    if (!token.norm.includes('.', 1) || known.has(token.norm)) {
      out.push(token);
      continue;
    }
    const lead = token.norm.startsWith('.') ? '.' : '';
    const rawParts = token.raw.slice(lead.length).split('.');
    rawParts.forEach((raw, i) => {
      const part = (i === 0 ? lead : '') + raw;
      out.push({ ...token, raw: part, norm: part.toLowerCase(), start: token.start || i > 0 });
    });
  }
  return out;
}

/**
 * Every dictionary skill in `text`, whole words only and longest spelling first ("React Native"
 * before "React"). Strict terms need a capital and context (see `SkillsFile`).
 */
export function findSkills(text: string, index: SkillIndex): SkillHit[] {
  const tokens = splitUnknownDotted(tokenize(text), index.known);
  const hits: (SkillHit & { strict: boolean; len: number })[] = [];
  for (let i = 0; i < tokens.length;) {
    const match = index.byFirst.get(tokens[i]!.norm)?.find((term) => fits(term, tokens, i));
    if (!match) {
      i++;
      continue;
    }
    hits.push({
      skill: match.skill,
      at: i,
      line: tokens[i]!.line,
      col: tokens[i]!.col,
      strict: match.strict,
      len: match.tokens.length,
    });
    i += match.tokens.length;
  }
  return hits
    .filter((hit) => !hit.strict || inContext(hit, hits, tokens))
    .map(({ skill, at, line, col }) => ({ skill, at, line, col }));
}

function fits(term: Term, tokens: Token[], i: number): boolean {
  for (let k = 0; k < term.tokens.length; k++) {
    const token = tokens[i + k];
    if (!token || token.norm !== term.tokens[k]) return false;
    // A term never spans two sentences.
    if (k > 0 && token.start) return false;
    // Strict terms are written with a capital: "Go", "R", "Excel" (not "go", "excel").
    if (term.strict && k === 0 && !/\p{Lu}/u.test(token.raw)) return false;
  }
  return true;
}

function inContext(
  hit: { at: number; len: number },
  hits: readonly { at: number; strict: boolean }[],
  tokens: Token[],
): boolean {
  const next = tokens[hit.at + hit.len];
  if (next && !next.start && CONTEXT_AFTER.has(next.norm)) return true;
  // Another skill close by: a list ("Python, Go and Rust").
  if (hits.some((h) => h.at !== hit.at && Math.abs(h.at - hit.at) <= LIST_WINDOW)) return true;
  // Mid-sentence, capitalized: "experience with Go".
  const token = tokens[hit.at]!;
  if (token.start || token.title) return false;
  // A lone letter after a capitalized word is a label: "Section R", "Vitamin C", "Plan B".
  const before = tokens[hit.at - 1];
  return !(token.norm.length === 1 && before && /^\p{Lu}/u.test(before.raw));
}
