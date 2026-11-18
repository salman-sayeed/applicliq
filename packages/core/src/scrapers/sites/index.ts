import type { SiteAdapter } from '../types';
import { bdjobs } from './bdjobs';
import { glassdoor } from './glassdoor';
import { greenhouse } from './greenhouse';
import { indeed } from './indeed';
import { lever } from './lever';
import { linkedin } from './linkedin';
import { wellfound } from './wellfound';
import { workday } from './workday';

export const siteAdapters: SiteAdapter[] = [
  linkedin,
  indeed,
  glassdoor,
  bdjobs,
  wellfound,
  greenhouse,
  lever,
  workday,
];

export function findAdapter(url: URL): SiteAdapter | undefined {
  return siteAdapters.find((adapter) => adapter.matches(url));
}
