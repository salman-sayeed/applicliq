import {
  type Job,
  type Settings,
  WEEK_START_INDEX,
  goalProgress,
  toolbarBadgeText,
} from '@pocket-career/core';
import { repo } from './db';
import { actionApi } from './tabs';

const DEFAULT_COLOR = '#4f46e5';
const MET_COLOR = '#16a34a';

/** Today's applications against the daily goal, as the goal settings count them. */
export function todayProgress(jobs: readonly Job[], settings: Settings) {
  const { goals } = settings;
  return goalProgress(
    jobs,
    goals,
    Date.now(),
    WEEK_START_INDEX[goals.weekStartsOn],
    goals.countStatuses,
  ).daily;
}

/**
 * The toolbar badge's resting state, per the `toolbarBadge` setting: today's applications
 * against the daily goal ("1/3", green once met), just today's count, or nothing.
 */
export async function showGoalBadge(jobs?: readonly Job[], settings?: Settings): Promise<void> {
  const [all, prefs] = await Promise.all([jobs ?? repo.getJobs(), settings ?? repo.getSettings()]);
  const { count, goal, met } = todayProgress(all, prefs);
  const mode = prefs.jobPages.toolbarBadge;
  await actionApi.setBadgeBackgroundColor({
    color: met && mode === 'goal' ? MET_COLOR : DEFAULT_COLOR,
  });
  await actionApi.setBadgeText({ text: toolbarBadgeText(mode, count, goal) });
  await actionApi.setTitle({
    title:
      mode === 'off'
        ? 'Pocket Career'
        : goal > 0
          ? `Pocket Career: ${count} of ${goal} applications today`
          : `Pocket Career: ${count} applications today`,
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
