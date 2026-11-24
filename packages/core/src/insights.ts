import type { Goals } from './settings';
import {
  type WeekStart,
  applicationStreak,
  firstAppliedAt,
  goalProgress,
  startOfMonth,
  startOfWeek,
} from './stats';
import type { Job, JobStatus, StatusChange, WorkType } from './types';

/**
 * Insights: response rates, reply times, the weekly recap and the share card's numbers. Pure
 * functions over the saved jobs. Imported jobs count here (their dates are real), but status
 * changes an import recorded at import time are not used as reply dates (the file didn't say
 * when they happened).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A reply from the employer: any status after `applied` except ghosted and withdrawn. */
export const RESPONSE_STATUSES: readonly JobStatus[] = [
  'assessment',
  'interview',
  'offer',
  'rejected',
];
const INTERVIEW_STATUSES: readonly JobStatus[] = ['interview', 'offer'];

/** Groups with fewer applications than this show "Not enough data". */
export const MIN_GROUP_SIZE = 5;
/** Reply-time medians need at least this many replies. */
export const MIN_REPLY_SAMPLES = 3;

function reached(job: Job, statuses: readonly JobStatus[]): boolean {
  return statuses.includes(job.status) || job.history.some((h) => statuses.includes(h.status));
}

/** An entry an import wrote at import time: its date is the import's, not the event's. */
const atImport = (job: Job, h: StatusChange) =>
  job.importedAt !== undefined && h.at === job.importedAt;

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : undefined);

export type ResponseRow = {
  /** The source or work type; undefined for jobs that don't have one. */
  key: string | undefined;
  applied: number;
  responded: number;
  interviewed: number;
  offers: number;
  /** Rates are undefined with nothing applied. */
  responseRate?: number;
  interviewRate?: number;
  offerRate?: number;
  /** At least {@link MIN_GROUP_SIZE} applications. */
  enoughData: boolean;
};

function responseRow(key: string | undefined, jobs: readonly Job[]): ResponseRow {
  const applied = jobs.filter((j) => firstAppliedAt(j) !== undefined);
  const responded = applied.filter((j) => reached(j, RESPONSE_STATUSES)).length;
  const interviewed = applied.filter((j) => reached(j, INTERVIEW_STATUSES)).length;
  const offers = applied.filter((j) => reached(j, ['offer'])).length;
  return {
    key,
    applied: applied.length,
    responded,
    interviewed,
    offers,
    responseRate: ratio(responded, applied.length),
    interviewRate: ratio(interviewed, applied.length),
    offerRate: ratio(offers, applied.length),
    enoughData: applied.length >= MIN_GROUP_SIZE,
  };
}

/** Response, interview and offer rates for all applications. */
export function overallResponse(jobs: readonly Job[]): ResponseRow {
  return responseRow(undefined, jobs);
}

/**
 * Rates per source or per work type, most applications first; jobs without one go last.
 * Groups with no applications are left out.
 */
export function responseStatsBy(jobs: readonly Job[], field: 'source' | 'workType'): ResponseRow[] {
  const groups = new Map<string | undefined, Job[]>();
  for (const job of jobs) {
    const key: string | WorkType | undefined = job[field]?.trim().toLowerCase() || undefined;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  return [...groups]
    .map(([key, group]) => responseRow(key, group))
    .filter((row) => row.applied > 0)
    .sort((a, b) => {
      if ((a.key === undefined) !== (b.key === undefined)) return a.key === undefined ? 1 : -1;
      return b.applied - a.applied || (a.key ?? '').localeCompare(b.key ?? '');
    });
}

// ---------------------------------------------------------------------------------------------
// Reply time

/**
 * Days from a job's first `applied` entry to the first reply after it (see
 * {@link RESPONSE_STATUSES}). Undefined when either is missing, or when the reply was recorded
 * by an import (its date is the import's).
 */
export function replyDays(job: Job): number | undefined {
  const applied = job.history.find((h) => h.status === 'applied');
  if (!applied) return undefined;
  const reply = job.history.find(
    (h) => h.at >= applied.at && RESPONSE_STATUSES.includes(h.status) && !atImport(job, h),
  );
  if (!reply) return undefined;
  return (reply.at - applied.at) / DAY_MS;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type ReplyTimeRow = {
  key: string | undefined;
  /** Replies measured. */
  samples: number;
  /** Median days, undefined with no replies. */
  medianDays?: number;
  /** At least {@link MIN_REPLY_SAMPLES} replies. */
  enoughData: boolean;
};

export type ReplyTimes = { overall: ReplyTimeRow; bySource: ReplyTimeRow[] };

function replyRow(key: string | undefined, days: number[]): ReplyTimeRow {
  return {
    key,
    samples: days.length,
    medianDays: median(days),
    enoughData: days.length >= MIN_REPLY_SAMPLES,
  };
}

/** Median reply time, overall and per source (sources with replies only, most replies first). */
export function replyTimes(jobs: readonly Job[]): ReplyTimes {
  const all: number[] = [];
  const bySource = new Map<string | undefined, number[]>();
  for (const job of jobs) {
    const days = replyDays(job);
    if (days === undefined) continue;
    all.push(days);
    const key = job.source?.trim().toLowerCase() || undefined;
    bySource.set(key, [...(bySource.get(key) ?? []), days]);
  }
  return {
    overall: replyRow(undefined, all),
    bySource: [...bySource]
      .map(([key, days]) => replyRow(key, days))
      .sort((a, b) => {
        if ((a.key === undefined) !== (b.key === undefined)) return a.key === undefined ? 1 : -1;
        return b.samples - a.samples || (a.key ?? '').localeCompare(b.key ?? '');
      }),
  };
}

// ---------------------------------------------------------------------------------------------
// Periods: the weekly recap and the share card

export type InsightPeriod = 'week' | 'month' | 'all';

export type PeriodStats = {
  period: InsightPeriod;
  /** Start of the period (0 for all time). */
  start: number;
  end: number;
  applications: number;
  /** Jobs whose first reply came in the period. */
  responses: number;
  interviews: number;
  offers: number;
};

/** When a job first reached one of `statuses`, ignoring entries an import wrote. */
function firstReached(job: Job, statuses: readonly JobStatus[], all: boolean): number | undefined {
  return job.history.find((h) => statuses.includes(h.status) && (all || !atImport(job, h)))?.at;
}

/** Counts between `start` and `end` (inclusive). All time also counts what imports recorded. */
export function statsBetween(
  jobs: readonly Job[],
  start: number,
  end: number,
  period: InsightPeriod = 'all',
): PeriodStats {
  const all = period === 'all';
  const inRange = (at: number | undefined) => at !== undefined && at >= start && at <= end;
  let applications = 0;
  let responses = 0;
  let interviews = 0;
  let offers = 0;
  for (const job of jobs) {
    if (inRange(firstAppliedAt(job))) applications++;
    if (inRange(firstReached(job, RESPONSE_STATUSES, all))) responses++;
    if (inRange(firstReached(job, INTERVIEW_STATUSES, all))) interviews++;
    if (inRange(firstReached(job, ['offer'], all))) offers++;
  }
  return { period, start, end, applications, responses, interviews, offers };
}

/** This week (from `weekStartsOn`), this month, or all time, up to `now`. */
export function periodStats(
  jobs: readonly Job[],
  period: InsightPeriod,
  now: number = Date.now(),
  weekStartsOn: WeekStart = 1,
): PeriodStats {
  const start =
    period === 'week' ? startOfWeek(now, weekStartsOn) : period === 'month' ? startOfMonth(now) : 0;
  return statsBetween(jobs, start, now, period);
}

export type GoalSettings = Goals & { countStatuses: readonly JobStatus[] };

export type WeeklyRecap = {
  /** The last 7 days. */
  applications: number;
  responses: number;
  /** Current streak of days meeting the daily goal (imports excluded). */
  streak: number;
  /** This week's goal progress; undefined when the weekly goal is off. */
  weeklyGoal?: { count: number; goal: number };
};

/** The numbers for the weekly recap notification: the 7 days up to `now`. */
export function weeklyRecap(
  jobs: readonly Job[],
  goals: GoalSettings,
  now: number = Date.now(),
  weekStartsOn: WeekStart = 1,
): WeeklyRecap {
  const week = statsBetween(jobs, now - 7 * DAY_MS, now, 'week');
  const streak = applicationStreak(jobs, goals.daily, now, goals.countStatuses).current;
  const progress = goalProgress(jobs, goals, now, weekStartsOn, goals.countStatuses).weekly;
  return {
    applications: week.applications,
    responses: week.responses,
    streak,
    ...(progress.goal > 0 ? { weeklyGoal: { count: progress.count, goal: progress.goal } } : {}),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The recap notification's title and message. */
export function weeklyRecapText(recap: WeeklyRecap): { title: string; message: string } {
  const parts = [plural(recap.responses, 'response')];
  if (recap.streak > 0) parts.push(`${plural(recap.streak, 'day')} streak`);
  if (recap.weeklyGoal)
    parts.push(`weekly goal ${recap.weeklyGoal.count}/${recap.weeklyGoal.goal}`);
  return {
    title: `Your week: ${plural(recap.applications, 'application')}`,
    message: `${parts.join(' · ')}. Open Insights for more.`,
  };
}

/** What the share card shows. Numbers only: never company names or job titles. */
export type ShareCardData = {
  period: InsightPeriod;
  stats: PeriodStats;
  streak?: number;
  /** Goal for the period (weekly or monthly; none for all time). */
  goal?: { count: number; goal: number };
};

export function shareCardData(
  jobs: readonly Job[],
  goals: GoalSettings,
  period: InsightPeriod,
  { now = Date.now(), weekStartsOn = 1 as WeekStart, streak = true, goal = true } = {},
): ShareCardData {
  const data: ShareCardData = { period, stats: periodStats(jobs, period, now, weekStartsOn) };
  if (streak) data.streak = applicationStreak(jobs, goals.daily, now, goals.countStatuses).current;
  if (goal && period !== 'all') {
    const p = goalProgress(jobs, goals, now, weekStartsOn, goals.countStatuses)[
      period === 'week' ? 'weekly' : 'monthly'
    ];
    if (p.goal > 0) data.goal = { count: p.count, goal: p.goal };
  }
  return data;
}

export const PERIOD_PHRASES: Record<InsightPeriod, string> = {
  week: 'this week',
  month: 'this month',
  all: 'so far',
};

/** A short post to go with the share card (no company names). */
export function sharePostText(data: ShareCardData, siteUrl = 'applicliq.pages.dev'): string {
  const { stats } = data;
  const when = PERIOD_PHRASES[data.period];
  const lines = [
    `My job search ${when}: ${plural(stats.applications, 'application')}, ${plural(stats.responses, 'response')}, ${plural(stats.interviews, 'interview')} and ${plural(stats.offers, 'offer')}.`,
  ];
  if (data.streak) lines.push(`Current streak: ${plural(data.streak, 'day')} in a row.`);
  if (data.goal) {
    const label = data.period === 'week' ? 'weekly' : 'monthly';
    lines.push(`${data.goal.count} of ${data.goal.goal} toward my ${label} goal.`);
  }
  lines.push('', `Tracking it with AppliCliq, a free, open-source job tracker: ${siteUrl}`);
  return lines.join('\n');
}
