import { canonical } from './merge';
import { APPLIED_STATUSES } from './stats';
import { JOB_STATUSES, type JobStatus, type SalaryPeriod } from './types';

/**
 * App preferences. One typed object, split in storage:
 *
 * - **Synced** keys go to Drive with the jobs (`settings` in `career-pocket.json`) and merge by
 *   last write wins on `updatedAt`, as a whole.
 * - **Device** keys ({@link DEVICE_KEYS}) stay in this browser: notifications and the page badge
 *   depend on the browser's permissions and on where the user is.
 *
 * Every value read from storage, Drive or an import goes through {@link sanitizeSettings}, so the
 * rest of the app can trust the shape.
 */

/** Bump when a stored value changes meaning. Newer settings from Drive are never overwritten. */
export const SETTINGS_VERSION = 1;

export type Theme = 'system' | 'light' | 'dark';
export type WeekStartDay = 'sat' | 'sun' | 'mon';
export type ToolbarBadgeMode = 'today' | 'goal' | 'off';
export type BadgePosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type Density = 'comfortable' | 'compact';
export type DashboardViewSetting = 'list' | 'board' | 'stats';
export type DateFormat = 'system' | 'dmy' | 'mdy' | 'ymd';
/** `HH:MM`, 24-hour, local time. */
export type TimeOfDay = string;
export type QuietHours = { start: TimeOfDay; end: TimeOfDay };

export const ACCENT_COLORS = ['indigo', 'blue', 'teal', 'green', 'amber', 'rose'] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export type TagSetting = { name: string; color: TagColor };

/** `null` turns a target off. */
export type Goals = { daily: number | null; weekly: number | null; monthly: number | null };

export type Settings = {
  version: number;
  /** Last change to a synced key; decides merges. 0 = never changed (defaults). */
  updatedAt: number;
  goals: Goals & {
    weekStartsOn: WeekStartDay;
    /** A job counts toward the goals from the first time it reaches one of these statuses. */
    countStatuses: JobStatus[];
  };
  automation: {
    /** `applied` jobs untouched this many days become `ghosted`; null = off. */
    ghostedAfterDays: number | null;
    defaultSaveStatus: JobStatus;
    saveDescriptionSnapshot: boolean;
    /** Strip tracking parameters from saved URLs. */
    cleanUrls: boolean;
  };
  notifications: {
    followUpReminders: boolean;
    /** Minutes before an interview to notify; null = no interview reminders. */
    interviewReminderOffset: number | null;
    /** Nudge at this time when today's goal isn't met yet; null = off. */
    dailyGoalReminder: TimeOfDay | null;
    /** No notifications in this window (it may cross midnight); null = off. */
    quietHours: QuietHours | null;
  };
  jobPages: {
    showBadge: boolean;
    badgePosition: BadgePosition;
    /** Hostnames (no `www.`) where the page badge is never shown. */
    sitesWithBadgeOff: string[];
    duplicateWarning: boolean;
    toolbarBadge: ToolbarBadgeMode;
  };
  appearance: {
    theme: Theme;
    accentColor: AccentColor;
    /** Always reduce motion; `prefers-reduced-motion` is followed either way. */
    reduceMotion: boolean;
    defaultDashboardView: DashboardViewSetting;
    density: Density;
  };
  regional: {
    /** ISO 4217 code used as the default for new salaries; '' = none. */
    currency: string;
    salaryPeriod: SalaryPeriod;
    dateFormat: DateFormat;
  };
  labels: {
    /** Display names; the stored status keys never change. */
    statusLabels: Partial<Record<JobStatus, string>>;
    /** Left out of pickers and the board (jobs already in them still show). */
    hiddenStatuses: JobStatus[];
    tags: TagSetting[];
    resumeVersions: string[];
  };
  sync: { syncIntervalMinutes: number };
};

export type SettingsSection = Exclude<keyof Settings, 'version' | 'updatedAt'>;
export type SettingsPatch = { [K in SettingsSection]?: Partial<Settings[K]> };

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'goals',
  'automation',
  'notifications',
  'jobPages',
  'appearance',
  'regional',
  'labels',
  'sync',
];

export const SYNC_INTERVALS = [5, 15, 30, 60] as const;
export const INTERVIEW_REMINDER_OFFSETS = [0, 15, 60, 120, 1440] as const;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  updatedAt: 0,
  goals: {
    daily: 2,
    weekly: 10,
    monthly: 40,
    weekStartsOn: 'mon',
    countStatuses: [...APPLIED_STATUSES],
  },
  automation: {
    ghostedAfterDays: 21,
    defaultSaveStatus: 'saved',
    saveDescriptionSnapshot: true,
    cleanUrls: true,
  },
  notifications: {
    followUpReminders: true,
    interviewReminderOffset: 60,
    dailyGoalReminder: null,
    quietHours: null,
  },
  jobPages: {
    showBadge: false,
    badgePosition: 'bottom-right',
    sitesWithBadgeOff: [],
    duplicateWarning: true,
    toolbarBadge: 'goal',
  },
  appearance: {
    theme: 'system',
    accentColor: 'indigo',
    reduceMotion: false,
    defaultDashboardView: 'list',
    density: 'comfortable',
  },
  regional: { currency: '', salaryPeriod: 'year', dateFormat: 'system' },
  labels: { statusLabels: {}, hiddenStatuses: [], tags: [], resumeVersions: [] },
  sync: { syncIntervalMinutes: 15 },
};

/** Keys kept on this device only; everything else syncs through Drive. */
export const DEVICE_KEYS: { readonly [K in SettingsSection]?: readonly (keyof Settings[K])[] } = {
  notifications: [
    'followUpReminders',
    'interviewReminderOffset',
    'dailyGoalReminder',
    'quietHours',
  ],
  jobPages: ['showBadge', 'badgePosition', 'sitesWithBadgeOff'],
};

export function isDeviceKey<K extends SettingsSection>(
  section: K,
  key: keyof Settings[K],
): boolean {
  return (DEVICE_KEYS[section] as readonly PropertyKey[] | undefined)?.includes(key) ?? false;
}

// ---------------------------------------------------------------------------------------------
// Validation. Each check returns the clean value, or undefined when the input is unusable.

type Check<T> = (value: unknown) => T | undefined;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const bool: Check<boolean> = (v) => (typeof v === 'boolean' ? v : undefined);

const oneOf =
  <T extends string>(list: readonly T[]): Check<T> =>
  (v) =>
    list.includes(v as T) ? (v as T) : undefined;

const int =
  (min: number, max: number): Check<number> =>
  (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

/** `null` is off; so is 0, which is how older versions stored "off". Decimals round down. */
const countOrOff =
  (max: number): Check<number | null> =>
  (v) => {
    if (v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    const n = Math.floor(v);
    return n === 0 ? null : int(1, max)(n);
  };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time: Check<TimeOfDay> = (v) => (typeof v === 'string' && TIME.test(v) ? v : undefined);
const timeOrOff: Check<TimeOfDay | null> = (v) => (v === null ? null : time(v));

const status = oneOf(JOB_STATUSES);

const statusList =
  (minLength: number): Check<JobStatus[]> =>
  (v) => {
    if (!Array.isArray(v)) return undefined;
    // Kept in the canonical order so equal choices compare equal.
    const list = JOB_STATUSES.filter((s) => v.includes(s));
    return list.length >= minLength ? list : undefined;
  };

const text =
  (maxLength: number): Check<string> =>
  (v) =>
    typeof v === 'string' && v.trim().length <= maxLength ? v.trim() : undefined;

/** Unique (case-insensitive), trimmed, non-empty strings. */
const textList =
  (maxItems: number, maxLength: number, clean: (s: string) => string = (s) => s): Check<string[]> =>
  (v) => {
    if (!Array.isArray(v)) return undefined;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== 'string') continue;
      const value = clean(item.trim());
      if (!value || value.length > maxLength || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      out.push(value);
    }
    return out.slice(0, maxItems);
  };

/** `example.com` from `https://www.example.com/jobs` or `www.Example.com`. */
export function siteHost(input: string): string {
  const raw = input.trim().toLowerCase();
  let host: string;
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    return '';
  }
  host = host.replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(host) ? host : '';
}

const currency: Check<string> = (v) =>
  v === ''
    ? ''
    : typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim())
      ? v.trim().toUpperCase()
      : undefined;

const quietHours: Check<QuietHours | null> = (v) => {
  if (v === null) return null;
  if (!isObject(v)) return undefined;
  const start = time(v.start);
  const end = time(v.end);
  return start && end && start !== end ? { start, end } : undefined;
};

const statusLabels: Check<Partial<Record<JobStatus, string>>> = (v) => {
  if (!isObject(v)) return undefined;
  const out: Partial<Record<JobStatus, string>> = {};
  for (const key of JOB_STATUSES) {
    const label = text(30)(v[key]);
    if (label) out[key] = label;
  }
  return out;
};

const tags: Check<TagSetting[]> = (v) => {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: TagSetting[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const name = text(40)(item.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, color: oneOf(TAG_COLORS)(item.color) ?? 'gray' });
  }
  return out.slice(0, 200);
};

/** Every field's check. Also used by the settings page to validate input before saving. */
export const SETTINGS_SCHEMA: {
  [K in SettingsSection]: { [F in keyof Settings[K]]-?: Check<Settings[K][F]> };
} = {
  goals: {
    daily: countOrOff(100),
    weekly: countOrOff(500),
    monthly: countOrOff(2000),
    weekStartsOn: oneOf(['sat', 'sun', 'mon']),
    countStatuses: statusList(1),
  },
  automation: {
    ghostedAfterDays: countOrOff(365),
    defaultSaveStatus: status,
    saveDescriptionSnapshot: bool,
    cleanUrls: bool,
  },
  notifications: {
    followUpReminders: bool,
    interviewReminderOffset: (v) => (v === null ? null : int(0, 7 * 24 * 60)(v)),
    dailyGoalReminder: timeOrOff,
    quietHours,
  },
  jobPages: {
    showBadge: bool,
    badgePosition: oneOf(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
    sitesWithBadgeOff: textList(500, 253, siteHost),
    duplicateWarning: bool,
    toolbarBadge: oneOf(['today', 'goal', 'off']),
  },
  appearance: {
    theme: oneOf(['system', 'light', 'dark']),
    accentColor: oneOf(ACCENT_COLORS),
    reduceMotion: bool,
    defaultDashboardView: oneOf(['list', 'board', 'stats']),
    density: oneOf(['comfortable', 'compact']),
  },
  regional: {
    currency,
    salaryPeriod: oneOf(['hour', 'month', 'year']),
    dateFormat: oneOf(['system', 'dmy', 'mdy', 'ymd']),
  },
  labels: {
    statusLabels,
    hiddenStatuses: statusList(0),
    tags,
    resumeVersions: textList(100, 60),
  },
  sync: { syncIntervalMinutes: int(5, 24 * 60) },
};

/**
 * Checks one value against the schema. Returns the clean value, or undefined if it's invalid.
 * Note `null` is a valid answer for keys that can be turned off.
 */
export function checkSetting<K extends SettingsSection, F extends keyof Settings[K]>(
  section: K,
  key: F,
  value: unknown,
): Settings[K][F] | undefined {
  const check = SETTINGS_SCHEMA[section][key] as Check<Settings[K][F]>;
  return check(value);
}

/** The pre-settings-page shape: top-level `ghostedAfterDays` and `theme`, 0 meaning off. */
function upgradeLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== undefined) return raw;
  const goals = isObject(raw.goals) ? { ...raw.goals } : {};
  if (goals.weekly === undefined && goals.applicationsPerWeek !== undefined) {
    goals.weekly = goals.applicationsPerWeek;
  }
  return {
    ...raw,
    goals,
    automation: { ghostedAfterDays: raw.ghostedAfterDays, ...(raw.automation as object) },
    appearance: { theme: raw.theme, ...(raw.appearance as object) },
  };
}

/**
 * A complete, valid `Settings` from untrusted input: anything missing or invalid falls back to
 * `fallback` (the defaults, or the current settings when applying a patch). Reads the old shape.
 */
export function sanitizeSettings(input: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  const raw = isObject(input) ? upgradeLegacy(input) : {};
  const out = {
    version: SETTINGS_VERSION,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0
        ? raw.updatedAt
        : fallback.updatedAt,
  } as Settings;
  for (const section of SETTINGS_SECTIONS) {
    const given = isObject(raw[section]) ? raw[section] : {};
    const schema = SETTINGS_SCHEMA[section] as Record<string, Check<unknown>>;
    const base = fallback[section] as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [key, check] of Object.entries(schema)) {
      const value = key in given ? check(given[key]) : undefined;
      clean[key] = value === undefined ? structuredClone(base[key]) : value;
    }
    (out as Record<string, unknown>)[section] = clean;
  }
  return out;
}

/** Applies a patch; invalid values in it are ignored. Doesn't touch `updatedAt`. */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const merged: Record<string, unknown> = { ...current };
  for (const section of SETTINGS_SECTIONS) {
    const change = patch[section];
    if (isObject(change)) merged[section] = { ...current[section], ...change };
  }
  return sanitizeSettings(merged, current);
}

// ---------------------------------------------------------------------------------------------
// Synced vs device parts

/** What goes to Drive: every key except the device ones, plus `version` and `updatedAt`. */
export type SyncedSettings = { version: number; updatedAt: number } & {
  [K in SettingsSection]?: Partial<Settings[K]>;
};

/** What stays local: only the device keys. */
export type DeviceSettings = { [K in SettingsSection]?: Partial<Settings[K]> };

export function splitSettings(settings: Settings): {
  synced: SyncedSettings;
  device: DeviceSettings;
} {
  const synced: SyncedSettings = { version: settings.version, updatedAt: settings.updatedAt };
  const device: DeviceSettings = {};
  for (const section of SETTINGS_SECTIONS) {
    const values = settings[section] as Record<string, unknown>;
    for (const [key, value] of Object.entries(values)) {
      const target = (isDeviceKey(section, key as never) ? device : synced) as Record<
        string,
        Record<string, unknown>
      >;
      (target[section] ??= {})[key] = value;
    }
  }
  return { synced, device };
}

/** Drops device keys from a stored or downloaded synced part (older rows may contain them). */
function withoutDeviceKeys(value: Record<string, unknown>): Record<string, unknown> {
  const out = { ...value };
  for (const [section, keys] of Object.entries(DEVICE_KEYS)) {
    if (!isObject(out[section])) continue;
    const copy = { ...out[section] };
    for (const key of keys as readonly string[]) delete copy[key];
    out[section] = copy;
  }
  return out;
}

/** Full settings from the synced and device parts (each untrusted, either may be missing). */
export function combineSettings(synced: unknown, device: unknown): Settings {
  const shared = isObject(synced) ? withoutDeviceKeys(upgradeLegacy(synced)) : {};
  const local = isObject(device) ? device : {};
  const merged: Record<string, unknown> = { ...shared };
  for (const [section, keys] of Object.entries(DEVICE_KEYS)) {
    const given = isObject(local[section]) ? local[section] : {};
    const picked: Record<string, unknown> = {};
    for (const key of keys as readonly string[]) if (key in given) picked[key] = given[key];
    merged[section] = { ...(isObject(shared[section]) ? shared[section] : {}), ...picked };
  }
  return sanitizeSettings(merged);
}

/** The synced part of untrusted settings (from Drive or an import), cleaned. */
export function sanitizeSyncedSettings(value: unknown): SyncedSettings {
  return splitSettings(combineSettings(value, undefined)).synced;
}

/** Whether a downloaded settings object was written by a newer app version. */
export function isNewerSettings(value: unknown): boolean {
  return isObject(value) && typeof value.version === 'number' && value.version > SETTINGS_VERSION;
}

/**
 * Last write wins on `updatedAt`; equal timestamps with different content are ordered by
 * content, so every device picks the same winner (as for jobs).
 */
export function mergeSyncedSettings(a: SyncedSettings, b: SyncedSettings): SyncedSettings {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

/** Whether two synced parts hold the same values, ignoring `updatedAt`. */
export function sameSyncedValues(a: SyncedSettings, b: SyncedSettings): boolean {
  return canonical({ ...a, updatedAt: 0 }) === canonical({ ...b, updatedAt: 0 });
}

// ---------------------------------------------------------------------------------------------
// Helpers for the apps

export const WEEK_START_INDEX: Record<WeekStartDay, 0 | 1 | 6> = { sun: 0, mon: 1, sat: 6 };

/** Display name of a status: the user's label, or `fallback` (the built-in one). */
export function statusLabel(settings: Settings, status: JobStatus, fallback: string): string {
  return settings.labels.statusLabels[status] || fallback;
}

/** Statuses to offer in pickers and board columns; `keep` stays even if hidden (current value). */
export function visibleStatuses(settings: Settings, keep?: JobStatus): JobStatus[] {
  const hidden = settings.labels.hiddenStatuses;
  return JOB_STATUSES.filter((s) => s === keep || !hidden.includes(s));
}

export function tagColor(settings: Settings, tag: string): TagColor {
  const name = tag.toLowerCase();
  return settings.labels.tags.find((t) => t.name.toLowerCase() === name)?.color ?? 'gray';
}

/** Whether the page badge may show on this URL (badge on, site not turned off). */
export function pageBadgeAllowed(settings: Settings, url: string): boolean {
  if (!settings.jobPages.showBadge) return false;
  const host = siteHost(url);
  return !settings.jobPages.sitesWithBadgeOff.some(
    (site) => host === site || host.endsWith(`.${site}`),
  );
}
