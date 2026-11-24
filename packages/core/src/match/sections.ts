import { splitLines } from './text';

/**
 * Required vs nice-to-have, line by line. A heading ("Requirements", "Nice to have:",
 * "Preferred qualifications") sets the kind for the lines under it, until the next heading.
 * A line can also say it for itself ("Experience with Rust is a plus"). Unclear → required.
 */
export type Importance = 'required' | 'nice';

const FILLER =
  '(?:(?:minimum|basic|required|key|core|technical|preferred|desired|additional|bonus|your|our|the|must)\\s+)*';

/** Heading words for nice-to-have sections (checked first: "Preferred qualifications"). */
const NICE =
  "nice[- ]to[- ]haves?|(?:it )?would be (?:great|nice|a plus)(?: if you(?: have)?)?|bonus(?: points)?|pluses|(?:it'?s )?a plus|preferred(?: qualifications| skills| experience| requirements)?|desired(?: qualifications| skills| experience)?|desirable|good[- ]to[- ]haves?|extra credit|even better|great if(?: you have)?|you'?ll stand out|stand out|optional|additional (?:qualifications|skills)";

/** Heading words for required sections. */
const REQUIRED =
  "requirements?|required(?: skills| qualifications| experience)?|must[- ]haves?|qualifications?|skills(?: (?:and|&) (?:experience|qualifications))?|experience(?: (?:and|&) (?:skills|qualifications))?|competenc(?:y|ies)|what (?:you'?ll|you will|we'?re|we are) (?:need|bring|have|looking for)|what you need|what we look for|who you are|about you|you have|you bring|you'?ll need|essentials?|tech(?:nical)? stack|our stack|the stack|tools(?: (?:and|&) technologies)?";

/** Other headings: they end a nice-to-have section (what follows is unclear → required). */
const NEUTRAL =
  "responsibilit(?:y|ies)|what you'?ll do|what you will do|the role|role|about (?:us|the role|the team|the company|the job)|benefits|perks(?: (?:and|&) benefits)?|we offer|what we offer|compensation|salary|why (?:join us|join|you'?ll love [a-z ]+|us)|how to apply|location|equal opportunity(?: employer)?|our team|the team|day[- ]to[- ]day|duties|your impact|the opportunity|job description|overview|summary|description";

const whole = (words: string) => new RegExp(`^${FILLER}(?:${words})$`, 'i');
const prefix = (words: string) => new RegExp(`^${FILLER}(?:${words})\\b`, 'i');
const HEADING = {
  nice: { whole: whole(NICE), prefix: prefix(NICE) },
  required: { whole: whole(REQUIRED), prefix: prefix(REQUIRED) },
  neutral: { whole: whole(NEUTRAL), prefix: prefix(NEUTRAL) },
};

/** "Experience with GraphQL is a plus", "Bachelor's degree preferred": the whole line. */
const INLINE_NICE =
  /\b(?:nice[- ]to[- ]have|(?:is|are|would be) an? (?:big |huge |strong |definite )?(?:plus|bonus|advantage)|a plus\b|bonus points?|preferred|desirable|not required|optional|good to have|would be (?:great|nice)|extra credit|is an asset|are an asset)\b/i;
/** "5 years of B2B sales, ideally in SaaS": only what follows the word. */
const INLINE_NICE_AFTER = /\b(?:ideally|preferably|bonus if|even better if)\b/i;
/** "Must have experience with…" inside a nice-to-have section. */
const INLINE_REQUIRED = /\b(?:must|required|mandatory|essential)\b/i;

type Heading = {
  kind: Importance | 'neutral';
  /** The rest of the line, after a colon. */ rest: string;
};

function cleanLine(line: string): string {
  return line
    .replace(/^[\s#>*_\-–—•·▪●◦\d.)]+/, '')
    .replace(/[*_\s]+$/, '')
    .replace(/\*\*/g, '')
    .trim();
}

/** The heading a line is, if any. */
function headingOf(line: string): Heading | undefined {
  const text = cleanLine(line);
  if (!text || text.length > 80) return undefined;
  const colon = text.indexOf(':');
  if (colon !== -1) {
    const label = text.slice(0, colon).trim();
    if (!label || label.split(/\s+/).length > 8) return undefined;
    const rest = text.slice(colon + 1).trim();
    for (const kind of ['nice', 'required', 'neutral'] as const) {
      if (HEADING[kind].prefix.test(label)) return { kind, rest };
    }
    return undefined;
  }
  // No colon: only a short line that is nothing but a heading ("Nice to have", "Requirements").
  const label = text.replace(/[.!?]$/, '').trim();
  if (label.split(/\s+/).length > 7) return undefined;
  for (const kind of ['nice', 'required', 'neutral'] as const) {
    if (HEADING[kind].whole.test(label)) return { kind, rest: '' };
  }
  return undefined;
}

export type LineImportance = {
  kind: Importance;
  /** From this column on, the line is nice-to-have ("…, ideally in SaaS"). */
  niceFrom?: number;
};

/** The importance of each line of `text` (same indexes as `splitLines`). */
export function lineImportance(text: string): LineImportance[] {
  let section: Importance = 'required';
  return splitLines(text).map((line) => {
    const heading = headingOf(line);
    if (heading) {
      const kind: Importance = heading.kind === 'nice' ? 'nice' : 'required';
      // "Nice to have: Rust, Go" on one line is about that line only.
      if (heading.rest) return inline(heading.rest, kind, Math.max(0, line.indexOf(heading.rest)));
      section = kind;
      return { kind: section };
    }
    return inline(line, section);
  });
}

function inline(line: string, section: Importance, offset = 0): LineImportance {
  if (section === 'required') {
    if (INLINE_NICE.test(line)) return { kind: 'nice' };
    const after = INLINE_NICE_AFTER.exec(line);
    if (after) {
      return { kind: 'required', niceFrom: offset + after.index };
    }
    return { kind: 'required' };
  }
  if (INLINE_REQUIRED.test(line) && !INLINE_NICE.test(line)) return { kind: 'required' };
  return { kind: 'nice' };
}

/** The importance of a token at `col` on a line. */
export function importanceAt(line: LineImportance | undefined, col: number): Importance {
  if (!line) return 'required';
  return line.niceFrom !== undefined && col >= line.niceFrom ? 'nice' : line.kind;
}
