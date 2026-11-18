import type { Job, Salary, WorkType } from '../types';

/** What one extraction strategy (JSON-LD, a site adapter, meta tags) found on a page. */
export type ExtractedFields = {
  title?: string;
  company?: string;
  location?: string;
  /** Plain text, not HTML. */
  description?: string;
  salary?: Salary;
  /** Raw salary line, parsed centrally ("$120K/yr - $150K/yr"). */
  salaryText?: string;
  workType?: WorkType;
  /** Raw workplace badge or location line ("Hybrid work in Berlin"). */
  workplaceText?: string;
  /** Fields that are educated guesses (e.g. company from a URL slug); trusted less. */
  guessed?: (keyof ExtractedFields)[];
};

/** Knows the markup of one job site. Must never throw and never make network requests. */
export type SiteAdapter = {
  /** Stable identifier, also stored as `Job.source`. */
  id: string;
  matches: (url: URL) => boolean;
  /** The posting's own URL when the page shows it inside a list (e.g. `?currentJobId=`). */
  canonicalUrl?: (url: URL) => string | undefined;
  /** Currency to assume when the page shows amounts without one. */
  defaultCurrency?: string;
  extract: (doc: Document, url: URL) => ExtractedFields;
};

export type ExtractedJob = {
  job: Partial<Job>;
  /** 0–1: how complete and how reliably sourced the result is. */
  confidence: number;
  /** Strategies that contributed at least one field, e.g. `['json-ld', 'linkedin', 'meta']`. */
  sources: string[];
};
