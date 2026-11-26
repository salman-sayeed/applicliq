import { normalizeLabel, wordSimilarity } from './normalize';
import type { SavedAnswer } from './profile';

/**
 * Saved answers ("Tell us about yourself", "Why are you looking for a new role?") are matched
 * to form questions by wording: the same question normalized scores 1, otherwise the share of
 * meaningful words they have in common (Dice). Above 0.75 they're filled; from 0.5 they're
 * suggested in the preview.
 */

export type AnswerMatch = { answer: SavedAnswer; score: number };

export function answerScore(question: string, saved: string): number {
  const a = normalizeLabel(question);
  const b = normalizeLabel(saved);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let score = wordSimilarity(question, saved);
  // One wording inside the other ("Why AppliCliq?" vs "Why do you want to join AppliCliq?").
  if (` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)) score = Math.max(score, 0.8);
  return score;
}

/** The saved answer that fits a question best, if any scores at least `min`. */
export function matchSavedAnswer(
  question: string,
  answers: readonly SavedAnswer[],
  min = 0.5,
): AnswerMatch | undefined {
  let best: AnswerMatch | undefined;
  for (const answer of answers) {
    if (!answer.answer.trim()) continue;
    const score = answerScore(question, answer.question);
    if (score >= min && (!best || score > best.score)) best = { answer, score };
  }
  return best;
}

/** A saved answer for this question exists already (close enough to count as the same). */
export function hasSavedAnswer(question: string, answers: readonly SavedAnswer[]): boolean {
  return answers.some((a) => answerScore(question, a.question) >= 0.9);
}
