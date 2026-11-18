import {
  DEFAULT_SETTINGS,
  type JobStatus,
  type Settings,
  statusLabel,
  tagColor,
  visibleStatuses,
} from '@pocket-career/core';
import { getContext, setContext } from 'svelte';
import { formatDate, formatDateTime } from './dashboard/format';
import { STATUS_LABELS, TAG_CLASSES } from './status';

/**
 * The settings as the shared components read them: status names, hidden statuses, tag colours
 * and date format. One reactive object per page, handed down through context.
 */
export class Prefs {
  settings = $state.raw<Settings>(DEFAULT_SETTINGS);

  constructor(settings?: Settings) {
    if (settings) this.settings = settings;
  }

  status = (status: JobStatus): string => statusLabel(this.settings, status, STATUS_LABELS[status]);

  /** Statuses to offer; `keep` (the current one) stays even if hidden. */
  statuses = (keep?: JobStatus): JobStatus[] => visibleStatuses(this.settings, keep);

  tagClass = (tag: string): string => TAG_CLASSES[tagColor(this.settings, tag)];

  date = (ms: number): string => formatDate(ms, this.settings.regional.dateFormat);

  dateTime = (ms: number): string => formatDateTime(ms, this.settings.regional.dateFormat);
}

const KEY = Symbol('pocket-career-prefs');

export function setPrefs(prefs: Prefs): Prefs {
  return setContext(KEY, prefs);
}

/** The page's prefs; defaults when a component is used outside a page that set them. */
export function getPrefs(): Prefs {
  return getContext<Prefs | undefined>(KEY) ?? new Prefs();
}
