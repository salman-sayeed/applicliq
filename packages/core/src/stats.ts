import type { Goals } from './settings';
import type { Job, JobStatus, WorkType } from './types';

/**
 * Statuses that mean the application was sent. A job that went straight from `saved` to
 * `interview` or `rejected` was applied to as well; `withdrawn` alone doesn't count.
 */
export const APPLIED_STATUSES: readonly JobStatus[] = [
  'applied',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'ghosted',
];

/**
 * When the application was sent: the first history entry past `saved`. `statuses` overrides
 * which statuses count (the goals' `countStatuses` setting).
 */
export function firstAppliedAt(
  job: Job,
  statuses: readonly JobStatus[] = APPLIED_STATUSES,
): number | undefined {
  return job.history.find((h) => statuses.includes(h.status))?.at;
}

function reached(job: Job, statuses: readonly JobStatus[]): boolean {
  return statuses.includes(job.status) || job.history.some((h) => statuses.includes(h.status));
}

// ---------------------------------------------------------------------------------------------
// Local calendar days. Arithmetic goes through the calendar (not +24h), so DST changes never
// shift a day.

/** 0 = Sunday … 6 = Saturday. Weeks start on Monday unless told otherwise. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function startOfWeek(ms: number, weekStartsOn: WeekStart = 1): number {
  const day = new Date(ms).getDay();
  return addDays(ms, -((day - weekStartsOn + 7) % 7));
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Applications sent per local day, keyed by `dayKey`. */
export function applicationsByDay(
  jobs: readonly Job[],
  statuses: readonly JobStatus[] = APPLIED_STATUSES,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const at = firstAppliedAt(job, statuses);
    if (at === undefined) continue;
    const key = dayKey(at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Goals and streaks

export type GoalPeriod = keyof Goals;

export type GoalProgress = {
  period: GoalPeriod;
  /** 0 when the goal is off. */
  goal: number;
  count: number;
  /** count / goal, may exceed 1; 0 when the goal is off. */
  ratio: number;
  met: boolean;
  /** Start of the current day / week / month. */
  start: number;
};

/** Applications sent so far today, this week and this month, against the goals (null = off). */
export function goalProgress(
  jobs: readonly Job[],
  goals: Goals,
  now: number = Date.now(),
  weekStartsOn: WeekStart = 1,
  countStatuses: readonly JobStatus[] = APPLIED_STATUSES,
): Record<GoalPeriod, GoalProgress> {
  const starts: Record<GoalPeriod, number> = {
    daily: startOfDay(now),
    weekly: startOfWeek(now, weekStartsOn),
    monthly: startOfMonth(now),
  };
  const applied = jobs
    .map((job) => firstAppliedAt(job, countStatuses))
    .filter((at): at is number => at !== undefined);
  const progress = (period: GoalPeriod): GoalProgress => {
    const start = starts[period];
    const goal = goals[period] ?? 0;
    const count = applied.filter((at) => at >= start && at <= now).length;
    return {
      period,
      goal,
      count,
      ratio: goal > 0 ? count / goal : 0,
      met: goal > 0 && count >= goal,
      start,
    };
  };
  return { daily: progress('daily'), weekly: progress('weekly'), monthly: progress('monthly') };
}

export type Streak = {
  /** Consecutive days meeting the daily goal, up to today (or yesterday if today isn't done). */
  current: number;
  best: number;
  todayMet: boolean;
};

/**
 * Consecutive days on which at least `dailyGoal` applications were sent. Today only extends the
 * streak once its goal is met; until then the streak still counts up to yesterday.
 */
export function applicationStreak(
  jobs: readonly Job[],
  dailyGoal: number | null,
  now: number = Date.now(),
  countStatuses: readonly JobStatus[] = APPLIED_STATUSES,
): Streak {
  if (dailyGoal === null || dailyGoal <= 0) return { current: 0, best: 0, todayMet: false };
  const counts = applicationsByDay(jobs, countStatuses);
  const met = (day: number) => (counts.get(dayKey(day)) ?? 0) >= dailyGoal;

  const today = startOfDay(now);
  const todayMet = met(today);
  let current = 0;
  for (let day = todayMet ? today : addDays(today, -1); met(day); day = addDays(day, -1)) current++;

  let best = 0;
  const firstKey = [...counts.keys()].sort()[0];
  if (firstKey) {
    const [y, m, d] = firstKey.split('-').map(Number) as [number, number, number];
    let run = 0;
    for (let day = new Date(y, m - 1, d).getTime(); day <= today; day = addDays(day, 1)) {
      run = met(day) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return { current, best, todayMet };
}

// ---------------------------------------------------------------------------------------------
// Heatmap

export type HeatmapDay = {
  key: string;
  /** Start of the day, local time. */
  date: number;
  count: number;
  /** 0 (none) … 4 (busiest), relative to the busiest day in range. */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today: drawn empty. */
  future: boolean;
};

export type Heatmap = {
  /** Columns of 7 days, oldest first; each starts on `weekStartsOn`. */
  weeks: HeatmapDay[][];
  total: number;
  max: number;
};

/** Applications per day for the last `weeks` weeks (53 ≈ 12 months), GitHub style. */
export function applicationHeatmap(
  jobs: readonly Job[],
  now: number = Date.now(),
  {
    weeks = 53,
    weekStartsOn = 1 as WeekStart,
    countStatuses = APPLIED_STATUSES,
  }: { weeks?: number; weekStartsOn?: WeekStart; countStatuses?: readonly JobStatus[] } = {},
): Heatmap {
  const counts = applicationsByDay(jobs, countStatuses);
  const today = startOfDay(now);
  const first = addDays(startOfWeek(today, weekStartsOn), -7 * (weeks - 1));

  const columns: Omit<HeatmapDay, 'level'>[][] = [];
  let total = 0;
  let max = 0;
  for (let w = 0; w < weeks; w++) {
    const column: Omit<HeatmapDay, 'level'>[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      const key = dayKey(date);
      const future = date > today;
      const count = future ? 0 : (counts.get(key) ?? 0);
      total += count;
      max = Math.max(max, count);
      column.push({ key, date, count, future });
    }
    columns.push(column);
  }

  const level = (count: number): HeatmapDay['level'] =>
    count === 0
      ? 0
      : (Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as HeatmapDay['level']);
  return {
    weeks: columns.map((column) => column.map((day) => ({ ...day, level: level(day.count) }))),
    total,
    max,
  };
}

// ---------------------------------------------------------------------------------------------
// Funnel and breakdowns

export type Funnel = {
  applied: number;
  /** Reached an interview (or an offer, which implies one). */
  interview: number;
  offer: number;
  /** interview / applied; undefined when nothing was applied to. */
  interviewRate?: number;
  /** offer / interview */
  offerRate?: number;
  /** offer / applied */
  overallRate?: number;
};

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : undefined);

/** How far applications got: applied → interview → offer, with conversion rates. */
export function applicationFunnel(jobs: readonly Job[]): Funnel {
  const applied = jobs.filter((j) => firstAppliedAt(j) !== undefined);
  const interview = applied.filter((j) => reached(j, ['interview', 'offer'])).length;
  const offer = applied.filter((j) => reached(j, ['offer'])).length;
  return {
    applied: applied.length,
    interview,
    offer,
    interviewRate: rate(interview, applied.length),
    offerRate: rate(offer, interview),
    overallRate: rate(offer, applied.length),
  };
}

export type BreakdownRow = Funnel & {
  /** The source or work type; undefined groups jobs that don't have one. */
  key: string | undefined;
  /** All jobs in the group, applied or not. */
  saved: number;
};

/**
 * The funnel per source (e.g. linkedin) or per work type, most applications first, with the
 * group of jobs that have none last.
 * Answers "where do my interviews come from?".
 */
export function breakdownBy(jobs: readonly Job[], field: 'source' | 'workType'): BreakdownRow[] {
  const groups = new Map<string | undefined, Job[]>();
  for (const job of jobs) {
    const key: string | WorkType | undefined = job[field]?.trim() || undefined;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  return [...groups]
    .map(([key, group]) => ({ key, saved: group.length, ...applicationFunnel(group) }))
    .sort((a, b) => {
      // Jobs without a source / work type go last, whatever their count.
      if ((a.key === undefined) !== (b.key === undefined)) return a.key === undefined ? 1 : -1;
      return b.applied - a.applied || b.saved - a.saved || (a.key ?? '').localeCompare(b.key ?? '');
    });
}
