import {
  FEATURES,
  type FeatureId,
  type FeaturePermissions,
  isFeatureEnabled,
  isSubToggleOn,
  needsPermissions,
} from '@applicliq/core';
import { repo } from './db';

type Request = Parameters<typeof browser.permissions.request>[0];

const toRequest = (p: FeaturePermissions): Request =>
  ({ permissions: p.permissions ?? [], origins: p.origins ?? [] }) as Request;

/**
 * Asks for a feature's optional permissions. Must be called straight from the click that turns
 * the feature on: browsers show the prompt only for a user gesture.
 */
export function requestFeaturePermissions(permissions: FeaturePermissions): Promise<boolean> {
  return browser.permissions.request(toRequest(permissions));
}

/**
 * Gives back permissions a feature no longer needs (`permissionsToRemove` already kept the ones
 * other features use). All-sites access stays while the page badge or the sidebar uses it.
 */
export async function removeFeaturePermissions(permissions: FeaturePermissions): Promise<void> {
  const settings = await repo.getSettings();
  const pageNeedsAll = settings.jobPages.showBadge || settings.jobPages.openIn === 'sidebar';
  const origins = (permissions.origins ?? []).filter((o) => !(o === '<all_urls>' && pageNeedsAll));
  if (!origins.length && !permissions.permissions?.length) return;
  await browser.permissions.remove(toRequest({ ...permissions, origins }));
}

/**
 * Turns off enabled features whose permissions the browser no longer grants (taken away in the
 * browser's settings, or a switch synced from elsewhere), and records them so Settings →
 * Features can say so. Runs at start-up and when permissions change.
 */
export async function reconcileFeaturePermissions(): Promise<FeatureId[]> {
  const settings = await repo.getSettings();
  const missing: FeatureId[] = [];
  for (const feature of FEATURES) {
    if (!needsPermissions(feature) || !isFeatureEnabled(settings, feature.id)) continue;
    const granted = await browser.permissions
      .contains(toRequest(feature.permissions))
      .catch(() => false);
    if (!granted) missing.push(feature.id);
  }
  // Parts with their own permissions (Autofill's on-page button) are switched off the same way.
  for (const feature of FEATURES) {
    for (const sub of feature.subToggles ?? []) {
      if (!sub.permissions || !isSubToggleOn(settings, feature.id, sub)) continue;
      const granted = await browser.permissions
        .contains(toRequest(sub.permissions))
        .catch(() => false);
      if (!granted) await repo.updateSettings({ [sub.section]: { [sub.key]: false } });
    }
  }
  if (missing.length) {
    await repo.updateSettings({
      features: Object.fromEntries(missing.map((id) => [id, false])),
    });
    const { featuresTurnedOff = [] } = await repo.getLocalState();
    await repo.setLocalState({
      featuresTurnedOff: [...new Set([...featuresTurnedOff, ...missing])],
    });
  }
  return missing;
}
