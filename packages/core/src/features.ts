import type { Settings } from './settings';

/**
 * The feature registry. Every optional feature is listed here, can be turned on and off in
 * Settings → Features, and asks for its browser permissions only when it is turned on.
 *
 * - `permissions` must also be declared as optional in the extension manifest
 *   (`optional_permissions` / `optional_host_permissions`), never as required ones, by the time
 *   the feature is implemented (planned features list what they will need).
 * - Features that need browser permissions should be `syncScope: 'device'`: a permission is
 *   granted per browser, so the switch must not follow the user to a browser that lacks it.
 * - `implemented: false` keeps a planned feature out of the UI; `isFeatureEnabled` is false for
 *   it whatever the stored value says.
 */

export const FEATURE_IDS = [
  'import',
  'smartHelpers',
  'insights',
  'encryptedSync',
  'resumeMatch',
  'autofill',
  'gmailSuggestions',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Browser permissions, in the shape `permissions.request()` takes. */
export type FeaturePermissions = {
  /** API permissions, e.g. `clipboardRead`. */
  permissions?: string[];
  /** Host match patterns, e.g. `<all_urls>`. */
  origins?: string[];
};

export type FeaturePlatform = 'extension' | 'web';

/** A switch for one part of a feature, stored as a boolean in `settings[section][key]`. */
export type SubToggle = {
  section: 'helpers' | 'insights';
  key: HelperToggle | InsightToggle;
  name: string;
  description: string;
  /** Where it works (default: wherever the feature does). */
  platforms?: readonly FeaturePlatform[];
};

export type HelperToggle = 'redFlags' | 'duplicates' | 'followUps' | 'offers';
export type InsightToggle = 'weeklyRecap';

export type FeatureDefinition = {
  id: FeatureId;
  name: string;
  /** One line, shown on the feature's card. */
  description: string;
  defaultEnabled: boolean;
  /** Asked for when the feature is turned on, removed when it is turned off. */
  permissions: FeaturePermissions;
  /** What each permission lets the feature do, in plain words (shown on the card). */
  permissionNotes: string[];
  /** 'synced': the switch follows the user through Drive. 'device': this browser only. */
  syncScope: 'synced' | 'device';
  /** Where the feature can run. */
  platforms: readonly FeaturePlatform[];
  /** False for planned features: hidden in the UI and always off. */
  implemented: boolean;
  /** Parts the user can turn off separately (on the feature's card). */
  subToggles?: readonly SubToggle[];
};

const BOTH: readonly FeaturePlatform[] = ['extension', 'web'];
const EXTENSION: readonly FeaturePlatform[] = ['extension'];

export const FEATURES: readonly FeatureDefinition[] = [
  {
    id: 'import',
    name: 'Import jobs',
    description: 'Bring in your LinkedIn applications or any spreadsheet (CSV), with undo.',
    defaultEnabled: true,
    permissions: {},
    permissionNotes: [],
    syncScope: 'synced',
    platforms: BOTH,
    implemented: true,
  },
  {
    id: 'smartHelpers',
    name: 'Smart helpers',
    description:
      'Heads-up notes on job pages, duplicate spotting, follow-up messages and offer comparison, all worked out on this device.',
    defaultEnabled: true,
    permissions: {},
    permissionNotes: [],
    syncScope: 'synced',
    platforms: BOTH,
    implemented: true,
    subToggles: [
      {
        section: 'helpers',
        key: 'redFlags',
        name: 'Heads up',
        description:
          'Notes on job pages: an old or closed posting, no salary, a company you applied to recently.',
        platforms: EXTENSION,
      },
      {
        section: 'helpers',
        key: 'duplicates',
        name: 'Same job on two sites',
        description: 'Spot a job saved twice (say, LinkedIn and the careers page) and merge them.',
      },
      {
        section: 'helpers',
        key: 'followUps',
        name: 'Follow-up templates',
        description: 'Ready-to-send follow-up messages and a list of applications to follow up on.',
      },
      {
        section: 'helpers',
        key: 'offers',
        name: 'Offer comparison',
        description: 'Offer details, deadline reminders and a side-by-side comparison.',
      },
    ],
  },
  {
    id: 'insights',
    name: 'Insights',
    description:
      'Response rates and reply times by source and work type, a weekly recap and a shareable card.',
    defaultEnabled: true,
    permissions: {},
    permissionNotes: [],
    syncScope: 'synced',
    platforms: BOTH,
    implemented: true,
    subToggles: [
      {
        section: 'insights',
        key: 'weeklyRecap',
        name: 'Weekly recap',
        description: 'A notification with your week in numbers (follows quiet hours).',
        platforms: EXTENSION,
      },
    ],
  },
  {
    id: 'encryptedSync',
    name: 'Encrypted sync',
    description:
      'Encrypt your synced data with a passphrase only you know, so the copy in your Google Drive can only be read on your devices.',
    defaultEnabled: false,
    permissions: {},
    permissionNotes: [],
    // Follows the user: every device must know Drive is encrypted. Turned on and off only
    // through Settings → Sync & data (it needs a passphrase), never by the plain switch.
    syncScope: 'synced',
    platforms: BOTH,
    implemented: true,
  },
  {
    id: 'resumeMatch',
    name: 'Resume match',
    description: 'Compare a job description with your resume, on this device.',
    defaultEnabled: false,
    permissions: {},
    permissionNotes: [],
    syncScope: 'synced',
    platforms: BOTH,
    implemented: false,
  },
  {
    id: 'autofill',
    name: 'Autofill',
    description: 'Fill application forms with your saved details.',
    defaultEnabled: false,
    permissions: { origins: ['<all_urls>'] },
    permissionNotes: ['Read and change application forms on the sites you apply on.'],
    syncScope: 'device',
    platforms: EXTENSION,
    implemented: false,
  },
  {
    id: 'gmailSuggestions',
    name: 'Gmail suggestions',
    description: 'Suggest status changes from job emails in your Gmail.',
    defaultEnabled: false,
    permissions: { origins: ['https://gmail.googleapis.com/*'] },
    permissionNotes: ['Read job-related emails in your Gmail, on this device only.'],
    syncScope: 'device',
    platforms: EXTENSION,
    implemented: false,
  },
];

export type FeatureSettings = Record<FeatureId, boolean>;

export const DEFAULT_FEATURES = Object.fromEntries(
  FEATURES.map((f) => [f.id, f.defaultEnabled]),
) as FeatureSettings;

/** Feature switches that stay in this browser (see `DEVICE_KEYS`). */
export const DEVICE_FEATURE_IDS: readonly FeatureId[] = FEATURES.filter(
  (f) => f.syncScope === 'device',
).map((f) => f.id);

export function getFeature(id: FeatureId): FeatureDefinition {
  return FEATURES.find((f) => f.id === id)!;
}

export function isFeatureId(value: unknown): value is FeatureId {
  return FEATURE_IDS.includes(value as FeatureId);
}

/** Features shown in Settings → Features (implemented ones). */
export function visibleFeatures(): FeatureDefinition[] {
  return FEATURES.filter((f) => f.implemented);
}

/** Whether a feature is on. Planned (unimplemented) features are always off. */
export function isFeatureEnabled(settings: Pick<Settings, 'features'>, id: FeatureId): boolean {
  return getFeature(id).implemented && settings.features[id] === true;
}

/** Whether a Smart helpers part is on: the feature and its own switch. */
export function isHelperEnabled(
  settings: Pick<Settings, 'features' | 'helpers'>,
  key: HelperToggle,
): boolean {
  return isFeatureEnabled(settings, 'smartHelpers') && settings.helpers[key];
}

/** Whether the weekly recap is on: Insights and its own switch. */
export function isWeeklyRecapEnabled(settings: Pick<Settings, 'features' | 'insights'>): boolean {
  return isFeatureEnabled(settings, 'insights') && settings.insights.weeklyRecap;
}

export function needsPermissions(feature: FeatureDefinition): boolean {
  return !!(feature.permissions.permissions?.length || feature.permissions.origins?.length);
}

/**
 * The permissions `id` holds that no other enabled feature needs: what to remove when it is
 * turned off. (The app may still need some of them for other reasons; the caller checks.)
 */
export function permissionsToRemove(
  settings: Pick<Settings, 'features'>,
  id: FeatureId,
): FeaturePermissions {
  const kept = { permissions: new Set<string>(), origins: new Set<string>() };
  for (const other of FEATURES) {
    if (other.id === id || !isFeatureEnabled(settings, other.id)) continue;
    other.permissions.permissions?.forEach((p) => kept.permissions.add(p));
    other.permissions.origins?.forEach((o) => kept.origins.add(o));
  }
  const own = getFeature(id).permissions;
  return {
    permissions: (own.permissions ?? []).filter((p) => !kept.permissions.has(p)),
    origins: (own.origins ?? []).filter((o) => !kept.origins.has(o)),
  };
}
