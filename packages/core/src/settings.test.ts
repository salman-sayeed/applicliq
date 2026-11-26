import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  applySettingsPatch,
  checkSetting,
  combineSettings,
  isNewerSettings,
  mergeSyncedSettings,
  pageBadgeAllowed,
  sanitizeSettings,
  sanitizeSyncedSettings,
  siteHost,
  splitSettings,
  statusLabel,
  tagColor,
  visibleStatuses,
} from './settings';

describe('sanitizeSettings', () => {
  it('fills defaults for missing or broken input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ version: 1, goals: 'x', appearance: null })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('keeps valid values and replaces invalid ones field by field', () => {
    const s = sanitizeSettings({
      version: 1,
      updatedAt: 42,
      goals: { daily: 3, weekly: -2, weekStartsOn: 'sun', countStatuses: ['offer', 'nope'] },
      appearance: { theme: 'neon', accentColor: 'teal', density: 'compact' },
      regional: { currency: 'gbp', dateFormat: 'ymd' },
    });
    expect(s.updatedAt).toBe(42);
    expect(s.goals).toEqual({
      ...DEFAULT_SETTINGS.goals,
      daily: 3,
      weekStartsOn: 'sun',
      countStatuses: ['offer'],
    });
    expect(s.appearance).toEqual({
      ...DEFAULT_SETTINGS.appearance,
      accentColor: 'teal',
      density: 'compact',
    });
    expect(s.regional).toEqual({ currency: 'GBP', salaryPeriod: 'year', dateFormat: 'ymd' });
  });

  it('requires at least one counted status', () => {
    const s = sanitizeSettings({ version: 1, goals: { countStatuses: [] } });
    expect(s.goals.countStatuses).toEqual(DEFAULT_SETTINGS.goals.countStatuses);
  });

  it('cleans lists: tags, resume versions, sites, status labels', () => {
    const s = sanitizeSettings({
      version: 1,
      labels: {
        statusLabels: { applied: '  Sent ', saved: '', bogus: 'x' },
        hiddenStatuses: ['withdrawn', 'withdrawn', 'x'],
        tags: [{ name: 'Remote', color: 'green' }, { name: 'remote', color: 'red' }, { name: 'b' }],
        resumeVersions: ['v1', ' v1 ', 'V1', '', 3, 'v2'],
      },
      jobPages: { sitesWithBadgeOff: ['https://www.LinkedIn.com/jobs', 'linkedin.com', 'nope'] },
    });
    expect(s.labels).toEqual({
      statusLabels: { applied: 'Sent' },
      hiddenStatuses: ['withdrawn'],
      tags: [
        { name: 'Remote', color: 'green' },
        { name: 'b', color: 'gray' },
      ],
      resumeVersions: ['v1', 'v2'],
    });
    expect(s.jobPages.sitesWithBadgeOff).toEqual(['linkedin.com']);
  });

  it('validates times and quiet hours', () => {
    const bad = sanitizeSettings({
      version: 1,
      notifications: { dailyGoalReminder: '25:00', quietHours: { start: '22:00', end: '22:00' } },
    });
    expect(bad.notifications).toEqual(DEFAULT_SETTINGS.notifications);
    const good = sanitizeSettings({
      version: 1,
      notifications: { dailyGoalReminder: '18:30', quietHours: { start: '22:00', end: '07:00' } },
    });
    expect(good.notifications.dailyGoalReminder).toBe('18:30');
    expect(good.notifications.quietHours).toEqual({ start: '22:00', end: '07:00' });
  });

  it('does not share arrays with the defaults', () => {
    const s = sanitizeSettings({});
    s.labels.tags.push({ name: 'x', color: 'red' });
    expect(DEFAULT_SETTINGS.labels.tags).toEqual([]);
  });
});

describe('checkSetting', () => {
  it('validates a single value', () => {
    expect(checkSetting('goals', 'daily', 4)).toBe(4);
    expect(checkSetting('goals', 'daily', null)).toBeNull();
    expect(checkSetting('goals', 'daily', 101)).toBeUndefined();
    expect(checkSetting('sync', 'syncIntervalMinutes', 1)).toBeUndefined();
    expect(checkSetting('regional', 'currency', 'EURO')).toBeUndefined();
    expect(checkSetting('regional', 'currency', '')).toBe('');
  });
});

describe('applySettingsPatch', () => {
  it('merges per section and ignores invalid values', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      goals: { daily: 5, weekly: 'many' as never },
      sync: { syncIntervalMinutes: 30 },
    });
    expect(next.goals.daily).toBe(5);
    expect(next.goals.weekly).toBe(10);
    expect(next.sync.syncIntervalMinutes).toBe(30);
    expect(next.updatedAt).toBe(DEFAULT_SETTINGS.updatedAt);
  });
});

describe('split / combine', () => {
  it('round-trips, with device keys only in the device part', () => {
    const settings = applySettingsPatch(DEFAULT_SETTINGS, {
      jobPages: { showBadge: true, badgePosition: 'top-left', toolbarBadge: 'today' },
      notifications: { followUpReminders: false },
    });
    const { synced, device } = splitSettings(settings);
    expect(device).toEqual({
      notifications: { ...DEFAULT_SETTINGS.notifications, followUpReminders: false },
      jobPages: {
        showBadge: true,
        badgePosition: 'top-left',
        sitesWithBadgeOff: [],
        openIn: 'popup',
      },
      // The weekly recap is a notification, like the other notification settings.
      insights: { weeklyRecap: true, weeklyRecapDay: 'sun', weeklyRecapTime: '20:00' },
      // Autofill's on-page button depends on site access granted in this browser.
      autofill: { showButton: false },
      // Features that need browser permissions stay on the device that granted them.
      features: { autofill: false, gmailSuggestions: false },
    });
    expect(synced.helpers).toMatchObject({ notDuplicatePairs: [], redFlags: true });
    expect(synced.jobPages).toEqual({ duplicateWarning: true, toolbarBadge: 'today' });
    expect(synced.features).toMatchObject({ import: true });
    expect(synced.features).not.toHaveProperty('autofill');
    expect(combineSettings(synced, device)).toEqual(settings);
  });

  it('ignores device keys found in a synced part', () => {
    const remote = { version: 1, updatedAt: 9, jobPages: { showBadge: true, toolbarBadge: 'off' } };
    const s = combineSettings(remote, undefined);
    expect(s.jobPages.showBadge).toBe(false);
    expect(s.jobPages.toolbarBadge).toBe('off');
    expect(sanitizeSyncedSettings(remote).jobPages).toEqual({
      duplicateWarning: true,
      toolbarBadge: 'off',
    });
  });
});

describe('mergeSyncedSettings', () => {
  const at = (updatedAt: number, daily: number) =>
    sanitizeSyncedSettings({ version: 1, updatedAt, goals: { daily } });

  it('takes the later write', () => {
    expect(mergeSyncedSettings(at(1, 1), at(2, 2)).goals?.daily).toBe(2);
    expect(mergeSyncedSettings(at(3, 1), at(2, 2)).goals?.daily).toBe(1);
  });

  it('picks the same winner on a tie, whatever the order', () => {
    const a = at(5, 1);
    const b = at(5, 2);
    expect(mergeSyncedSettings(a, b)).toBe(mergeSyncedSettings(b, a));
  });

  it('spots settings from a newer version', () => {
    expect(isNewerSettings({ version: SETTINGS_VERSION + 1 })).toBe(true);
    expect(isNewerSettings({ version: SETTINGS_VERSION })).toBe(false);
    expect(isNewerSettings(undefined)).toBe(false);
  });
});

describe('helpers', () => {
  const settings = applySettingsPatch(DEFAULT_SETTINGS, {
    labels: {
      statusLabels: { applied: 'Sent' },
      hiddenStatuses: ['assessment', 'withdrawn'],
      tags: [{ name: 'Remote', color: 'green' }],
    },
    jobPages: { showBadge: true, sitesWithBadgeOff: ['example.com'] },
  });

  it('labels and hides statuses', () => {
    expect(statusLabel(settings, 'applied', 'Applied')).toBe('Sent');
    expect(statusLabel(settings, 'offer', 'Offer')).toBe('Offer');
    expect(visibleStatuses(settings)).not.toContain('assessment');
    expect(visibleStatuses(settings, 'withdrawn')).toContain('withdrawn');
  });

  it('finds tag colors case-insensitively', () => {
    expect(tagColor(settings, 'remote')).toBe('green');
    expect(tagColor(settings, 'other')).toBe('gray');
  });

  it('turns the page badge off per site, subdomains included', () => {
    expect(pageBadgeAllowed(settings, 'https://jobs.example.com/1')).toBe(false);
    expect(pageBadgeAllowed(settings, 'https://www.example.com/1')).toBe(false);
    expect(pageBadgeAllowed(settings, 'https://notexample.com/1')).toBe(true);
    expect(pageBadgeAllowed(DEFAULT_SETTINGS, 'https://a.test/1')).toBe(false);
  });

  it('reads hostnames from URLs or bare names', () => {
    expect(siteHost('https://www.Greenhouse.io/x')).toBe('greenhouse.io');
    expect(siteHost('boards.greenhouse.io')).toBe('boards.greenhouse.io');
    expect(siteHost('not a site')).toBe('');
  });
});

describe('features', () => {
  it('defaults from the registry and ignores invalid values', () => {
    expect(DEFAULT_SETTINGS.features.import).toBe(true);
    expect(DEFAULT_SETTINGS.features.autofill).toBe(false);
    const s = sanitizeSettings({ version: 1, features: { import: false, autofill: 'yes' } });
    expect(s.features.import).toBe(false);
    expect(s.features.autofill).toBe(false);
    expect(s.features.smartHelpers).toBe(true);
    expect(s.features.insights).toBe(true);
  });
});

describe('helpers and insights', () => {
  it('has default templates and ignores invalid values', () => {
    expect(DEFAULT_SETTINGS.helpers.followUpTemplates.map((t) => t.name)).toEqual([
      'Checking on my application',
      'Thank you after interview',
      'Following up after no response',
    ]);
    const s = sanitizeSettings({
      version: 1,
      helpers: { oldPostingDays: 0, appliedBeforeDays: 45, myName: '  Sam  ', offers: 'no' },
      insights: { weeklyRecapDay: 'someday', weeklyRecapTime: '21:30' },
    });
    expect(s.helpers).toMatchObject({
      oldPostingDays: 30,
      appliedBeforeDays: 45,
      myName: 'Sam',
      offers: true,
    });
    expect(s.insights).toEqual({
      weeklyRecap: true,
      weeklyRecapDay: 'sun',
      weeklyRecapTime: '21:30',
    });
  });

  it('cleans templates: drops nameless ones, fills missing ids, keeps unique ids', () => {
    const s = sanitizeSettings({
      version: 1,
      helpers: {
        followUpTemplates: [
          { id: 'a', name: 'One', subject: ' Hi ', body: 'Body' },
          { id: 'a', name: 'Two', body: 'Other' },
          { name: '', body: 'No name' },
          { name: 'Three', body: 'x' },
          'junk',
        ],
      },
    });
    expect(s.helpers.followUpTemplates).toEqual([
      { id: 'a', name: 'One', subject: 'Hi', body: 'Body' },
      { id: 'a-1', name: 'Two', subject: '', body: 'Other' },
      { id: 't3', name: 'Three', subject: '', body: 'x' },
    ]);
  });

  it('allows an empty template list (all deleted)', () => {
    const s = sanitizeSettings({ version: 1, helpers: { followUpTemplates: [] } });
    expect(s.helpers.followUpTemplates).toEqual([]);
  });
});
