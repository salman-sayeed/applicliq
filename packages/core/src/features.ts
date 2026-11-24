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
    description: 'Suggestions for follow-ups and next steps, worked out on this device.',
    defaultEnabled: false,
    permissions: {},
    permissionNotes: [],
    syncScope: 'synced',
    platforms: BOTH,
    implemented: false,
  },
  {
    id: 'insights',
    name: 'Insights',
    description: 'Deeper statistics about where your applications go.',
    defaultEnabled: false,
    permissions: {},
    permissionNotes: [],
    syncScope: 'synced',
    platforms: BOTH,
    implemented: false,
  },
  {
    id: 'encryptedSync',
    name: 'Encrypted sync',
    description: 'Encrypt the Drive file with a passphrase only you know.',
    defaultEnabled: false,
    permissions: {},
    permissionNotes: [],
    syncScope: 'synced',
    platforms: BOTH,
    implemented: false,
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
