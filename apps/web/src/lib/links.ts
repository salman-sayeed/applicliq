/** Outbound links used across the site. */

/** The site's public origin: canonical links, Open Graph tags, the sitemap. No trailing slash. */
export const SITE_URL = 'https://applicliq.pages.dev';

// Still the old repo name until it is renamed to applicliq on GitHub (old links then redirect).
export const GITHUB_URL = 'https://github.com/salman-sayeed/careerpocket';
export const ISSUES_URL = `${GITHUB_URL}/issues/new`;

/** The author's profiles, shown in the site footer. */
export const AUTHOR_URL = 'https://salmansayeed.dev';
export const AUTHOR_LINKS = [
  { name: 'Email', href: 'mailto:ss.salmansayeed@gmail.com', icon: 'mail' },
  { name: 'Website', href: AUTHOR_URL, icon: 'globe' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/salmansayeed25/', icon: 'linkedin' },
  { name: 'GitHub', href: 'https://github.com/salman-sayeed', icon: 'github' },
  { name: 'Instagram', href: 'https://www.instagram.com/salman_bin_lemon/', icon: 'instagram' },
] as const;
