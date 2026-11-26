/**
 * The sites Autofill knows. No imports: the feature registry reads `AUTOFILL_ORIGINS`.
 */

export type AutofillPlatform = 'greenhouse' | 'lever' | 'ashby' | 'googleForms' | 'microsoftForms';

export const PLATFORM_NAMES: Record<AutofillPlatform, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  googleForms: 'Google Forms',
  microsoftForms: 'Microsoft Forms',
};

/**
 * Where the application forms live (checked November 2026):
 * - Greenhouse: `job-boards.greenhouse.io` (current boards and the `/embed/job_app` iframe that
 *   company career sites embed); `boards.greenhouse.io` now redirects there but older links and
 *   embeds still point at it; `job-boards.eu.greenhouse.io` for EU-hosted boards.
 * - Lever: `jobs.lever.co`, and `jobs.eu.lever.co` for EU-hosted accounts.
 * - Ashby: `jobs.ashbyhq.com`.
 * - Google Forms: `docs.google.com/forms/…` (`forms.gle` short links redirect there).
 * - Microsoft Forms: `forms.office.com` now redirects to `forms.cloud.microsoft`, the domain
 *   Microsoft moved Forms to in 2025; both are listed.
 *
 * These are the only sites the optional "Show Autofill button on supported sites" asks for.
 * (Browsers grant host access per site: the Google Forms entry covers docs.google.com.)
 */
export const AUTOFILL_ORIGINS = [
  'https://boards.greenhouse.io/*',
  'https://job-boards.greenhouse.io/*',
  'https://job-boards.eu.greenhouse.io/*',
  'https://jobs.lever.co/*',
  'https://jobs.eu.lever.co/*',
  'https://jobs.ashbyhq.com/*',
  'https://docs.google.com/*',
  'https://forms.office.com/*',
  'https://forms.cloud.microsoft/*',
] as const;

/** The platform a URL's application form belongs to, if it's one Autofill knows. */
export function autofillPlatform(url: string | URL): AutofillPlatform | undefined {
  let u: URL;
  try {
    u = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)greenhouse\.io$/.test(host)) return 'greenhouse';
  if (/(^|\.)lever\.co$/.test(host)) return 'lever';
  if (host === 'jobs.ashbyhq.com') return 'ashby';
  if (host === 'docs.google.com' && u.pathname.startsWith('/forms/')) return 'googleForms';
  if (host === 'forms.office.com' || host === 'forms.cloud.microsoft') return 'microsoftForms';
  return undefined;
}

/** Job boards: the job comes from the page. Forms: the user links one or creates one. */
export function isJobBoardPlatform(platform: AutofillPlatform | undefined): boolean {
  return platform === 'greenhouse' || platform === 'lever' || platform === 'ashby';
}
