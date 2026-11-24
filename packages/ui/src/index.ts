export { default as Button } from './components/Button.svelte';
export { default as StatusBadge } from './components/StatusBadge.svelte';
export {
  ACCENT_SWATCH,
  PERIOD_LABELS,
  STATUS_DOT,
  STATUS_LABELS,
  TAG_CLASSES,
  WORK_TYPE_LABELS,
} from './status';
export { Prefs, getPrefs, setPrefs } from './prefs.svelte';
export { applyAppearance, applyCachedAppearance } from './appearance';
export { crossfade, fade, flip, fly, reducedMotion, slide } from './motion';
export { default as Dashboard } from './dashboard/Dashboard.svelte';
export type { DashboardAdapter } from './dashboard/adapter';
export { default as SyncMenu } from './dashboard/SyncMenu.svelte';
export { default as UnlockDialog } from './encryption/UnlockDialog.svelte';
export type { SyncMenuStatus } from './dashboard/types';
export { default as SettingsPage, type SettingsPageId } from './settings/SettingsPage.svelte';
export { SETTINGS_PAGES } from './settings/SettingsPage.svelte';
export type { SettingsPlatform, SettingsSync } from './settings/types';
