import type { Job } from '../types';

/** Fields a scraper can fill in from a job posting page. */
export type ScrapedJob = Partial<
  Pick<
    Job,
    | 'url'
    | 'title'
    | 'company'
    | 'location'
    | 'workType'
    | 'salary'
    | 'source'
    | 'descriptionSnapshot'
  >
>;

export type Scraper = {
  /** Stable identifier, also stored as `Job.source`. */
  id: string;
  /** Whether this scraper understands the given page URL. */
  matches: (url: URL) => boolean;
  /** Extracts what it can. Must never throw and never make network requests. */
  scrape: (doc: Document, url: URL) => ScrapedJob | undefined;
};
