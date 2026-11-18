/**
 * Query parameters that only track where a click came from. Matched case-insensitively.
 * Job boards often put the job id in the query (`jk`, `currentJobId`, `gh_jid`, ...), so only
 * known tracking keys are removed, never the whole query string.
 */
const TRACKING_PARAMS = new Set([
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'igshid',
  'li_fat_id',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'ref',
  'ref_src',
  'refid',
  'src',
  'trk',
  'trkinfo',
  'trackingid',
  'lipi',
  'ebp',
  'gh_src',
  'lever-source',
  'lever-origin',
]);

const TRACKING_PREFIXES = ['utm_'];

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return TRACKING_PARAMS.has(k) || TRACKING_PREFIXES.some((p) => k.startsWith(p));
}

/**
 * Canonical form of a job posting URL, used to detect "already saved":
 * drops the hash and tracking parameters, sorts the remaining parameters, and removes a
 * trailing slash. Host casing and default ports are normalized by `URL` itself.
 * Strings that are not valid URLs are returned trimmed.
 */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.hash = '';
  const kept = [...url.searchParams].filter(([key]) => !isTrackingParam(key));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(kept).toString();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  }
  return url.href;
}
