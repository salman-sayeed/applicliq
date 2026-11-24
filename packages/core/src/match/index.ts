import { type SkillIndex, type SkillsFile, buildSkillIndex } from './dictionary';
import { type MatchOptions, type MatchResult, analyzeJob, matchResume } from './match';

/**
 * Resume match (feature `resumeMatch`), imported as `@applicliq/core/match` so apps can load it
 * with a dynamic `import()`: neither this code nor the skills dictionary is in the main bundle.
 */
export * from './dictionary';
export * from './keywords';
export * from './match';
export * from './sections';
export * from './text';

let loading: Promise<SkillIndex> | undefined;

/** The skills dictionary, loaded (lazily, once) and indexed. */
export function loadSkillIndex(): Promise<SkillIndex> {
  loading ??= import('./skills.json').then((module) =>
    buildSkillIndex((module.default ?? module) as SkillsFile),
  );
  return loading;
}

/** One call: a job description against a resume. */
export async function resumeMatch(
  description: string,
  resumeText: string,
  options: MatchOptions = {},
): Promise<MatchResult> {
  const index = await loadSkillIndex();
  return matchResume(analyzeJob(description, index), resumeText, index, options);
}
