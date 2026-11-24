import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  FEATURE_IDS,
  isFeatureEnabled,
  needsPermissions,
  permissionsToRemove,
  visibleFeatures,
} from './features';
import { DEFAULT_SETTINGS } from './settings';

const withFeatures = (features: Partial<typeof DEFAULT_SETTINGS.features>) => ({
  features: { ...DEFAULT_SETTINGS.features, ...features },
});

describe('feature registry', () => {
  it('registers every id once', () => {
    expect(FEATURES.map((f) => f.id)).toEqual([...FEATURE_IDS]);
  });

  it('keeps features that need permissions on the device', () => {
    for (const feature of FEATURES.filter(needsPermissions)) {
      expect(feature.syncScope, feature.id).toBe('device');
    }
  });

  it('shows only implemented features, and planned ones are always off', () => {
    expect(visibleFeatures().map((f) => f.id)).toEqual(['import', 'smartHelpers', 'insights']);
    expect(isFeatureEnabled(withFeatures({ encryptedSync: true }), 'encryptedSync')).toBe(false);
    expect(isFeatureEnabled(DEFAULT_SETTINGS, 'import')).toBe(true);
    expect(isFeatureEnabled(withFeatures({ import: false }), 'import')).toBe(false);
  });

  it('removes only permissions no other enabled feature needs', () => {
    // Planned features count as off, so autofill's access would be removed in full.
    expect(permissionsToRemove(withFeatures({ autofill: true }), 'autofill')).toEqual({
      permissions: [],
      origins: ['<all_urls>'],
    });
    expect(permissionsToRemove(DEFAULT_SETTINGS, 'import')).toEqual({
      permissions: [],
      origins: [],
    });
  });
});
