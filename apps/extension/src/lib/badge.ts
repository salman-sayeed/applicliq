import { type Job, dailyGoalBadge, goalProgress } from '@pocket-career/core';
import { repo } from './db';
import { actionApi } from './tabs';

const DEFAULT_COLOR = '#4f46e5';
const MET_COLOR = '#16a34a';

/**
 * The toolbar badge's resting state: today's applications against the daily goal ("1/3"),
 * green once the goal is met. Empty when the daily goal is off.
 */
export async function showGoalBadge(jobs?: readonly Job[]): Promise<void> {
  const [all, settings] = await Promise.all([jobs ?? repo.getJobs(), repo.getSettings()]);
  const { count, goal, met } = goalProgress(all, settings.goals).daily;
  await actionApi.setBadgeBackgroundColor({ color: met ? MET_COLOR : DEFAULT_COLOR });
  await actionApi.setBadgeText({ text: dailyGoalBadge(count, goal) });
  await actionApi.setTitle({
    title: goal > 0 ? `Pocket Career: ${count} of ${goal} applications today` : 'Pocket Career',
  });
}

/**
 * Shows a short message badge on the toolbar icon, then returns to the goal badge after `ms`
 * (or keeps it when `ms` is 0, until `showGoalBadge` runs, e.g. when the popup opens).
 */
export async function flashBadge(text: string, color: string, title?: string, ms = 2500) {
  await actionApi.setBadgeBackgroundColor({ color });
  await actionApi.setBadgeText({ text });
  if (title) await actionApi.setTitle({ title });
  if (ms) setTimeout(() => void showGoalBadge(), ms);
}
