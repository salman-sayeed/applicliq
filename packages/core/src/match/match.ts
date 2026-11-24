import { type SkillIndex, findSkills } from './dictionary';
import { extractKeywords, phraseIndex } from './keywords';
import { type Importance, importanceAt, lineImportance } from './sections';

/**
 * Resume match: which dictionary skills a job description asks for, and which of them a resume
 * mentions. Everything is plain text matching on this device: no AI, no network, no score.
 */

/** Longer texts are cut here (a job description is a few thousand characters). */
export const MAX_MATCH_TEXT = 300_000;

export type JobSkill = {
  name: string;
  category: string;
  /** Times the description mentions it. */
  count: number;
  importance: Importance;
};

export type JobAnalysis = {
  skills: JobSkill[];
  /** "Other keywords": repeated phrases that aren't dictionary skills. */
  keywords: { phrase: string; count: number }[];
};

/** Skills and keywords a job description asks for. */
export function analyzeJob(description: string, index: SkillIndex): JobAnalysis {
  const text = description.slice(0, MAX_MATCH_TEXT);
  const importance = lineImportance(text);
  const found = new Map<number, JobSkill>();
  for (const hit of findSkills(text, index)) {
    const skill = index.skills[hit.skill]!;
    const kind = importanceAt(importance[hit.line], hit.col);
    const entry = found.get(hit.skill);
    if (entry) {
      entry.count++;
      // Asked for as required anywhere: required.
      if (kind === 'required') entry.importance = 'required';
    } else {
      found.set(hit.skill, {
        name: skill.name,
        category: skill.category,
        count: 1,
        importance: kind,
      });
    }
  }
  const skills = [...found.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const keywords = extractKeywords(text, (phrase) => findSkills(phrase, index).length > 0);
  return { skills, keywords };
}

/** The names of the dictionary skills a text (a resume) mentions, lowercased. */
export function skillsIn(text: string, index: SkillIndex): Set<string> {
  const hits = findSkills(text.slice(0, MAX_MATCH_TEXT), index);
  return new Set(hits.map((h) => index.skills[h.skill]!.name.toLowerCase()));
}

export type MatchedSkill = Pick<JobSkill, 'name' | 'category' | 'count'>;

export type MatchResult = {
  required: { matched: MatchedSkill[]; missing: MatchedSkill[] };
  niceToHave: { matched: MatchedSkill[]; missing: MatchedSkill[] };
  keywords: { found: string[]; missing: string[] };
  /** Skills and keywords in the description that the user's ignore list hides. */
  ignored: string[];
  /** e.g. "Matches 12 of 16 required skills". */
  summary: string;
};

export type MatchOptions = {
  /** Skills (or keywords) never flagged, any case: the user's ignore list. */
  ignored?: readonly string[];
};

/** Compares a job's analysis with a resume. */
export function matchResume(
  job: JobAnalysis,
  resumeText: string,
  index: SkillIndex,
  { ignored = [] }: MatchOptions = {},
): MatchResult {
  const ignoredSet = new Set(ignored.map((s) => s.trim().toLowerCase()));
  const isIgnored = (name: string) => {
    if (ignoredSet.has(name.toLowerCase())) return true;
    const skill = index.skills.find((s) => s.name === name);
    return !!skill?.aliases.some((a) => ignoredSet.has(a));
  };
  const onResume = skillsIn(resumeText, index);
  const hasPhrase = phraseIndex(resumeText);
  const result: MatchResult = {
    required: { matched: [], missing: [] },
    niceToHave: { matched: [], missing: [] },
    keywords: { found: [], missing: [] },
    ignored: [],
    summary: '',
  };
  for (const skill of job.skills) {
    if (isIgnored(skill.name)) {
      result.ignored.push(skill.name);
      continue;
    }
    const group = skill.importance === 'required' ? result.required : result.niceToHave;
    const { name, category, count } = skill;
    (onResume.has(name.toLowerCase()) ? group.matched : group.missing).push({
      name,
      category,
      count,
    });
  }
  for (const { phrase } of job.keywords) {
    if (ignoredSet.has(phrase.toLowerCase())) {
      result.ignored.push(phrase);
      continue;
    }
    (hasPhrase(phrase) ? result.keywords.found : result.keywords.missing).push(phrase);
  }
  result.summary = summarize(result);
  return result;
}

function summarize({ required, niceToHave }: MatchResult): string {
  const req = required.matched.length + required.missing.length;
  const nice = niceToHave.matched.length + niceToHave.missing.length;
  const skills = (n: number) => (n === 1 ? 'skill' : 'skills');
  if (req && nice) {
    return `Matches ${required.matched.length} of ${req} required ${skills(req)} and ${niceToHave.matched.length} of ${nice} nice-to-have`;
  }
  if (req) return `Matches ${required.matched.length} of ${req} required ${skills(req)}`;
  if (nice) return `Matches ${niceToHave.matched.length} of ${nice} nice-to-have ${skills(nice)}`;
  return 'No skills from the dictionary found in this description';
}
