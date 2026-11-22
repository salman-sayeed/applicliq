/** Outbound links used across the site. */
export const GITHUB_URL = 'https://github.com/salman-sayeed/careerpocket';
export const ISSUES_URL = `${GITHUB_URL}/issues/new`;

/**
 * Extension store listings, the one place to change them. `null` = not listed yet: the landing
 * page then shows "coming soon" for that browser. Chrome's URL also serves Edge, Brave, etc.
 */
export const STORE_URLS: { firefox: string; chrome: string | null } = {
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/career-pocket/',
  chrome: null,
};

/** The author's profiles, shown in the site footer. */
export const AUTHOR_URL = 'https://salmansayeed.dev';
export const AUTHOR_LINKS = [
  { name: 'Email', href: 'mailto:ss.salmansayeed@gmail.com', icon: 'mail' },
  { name: 'Website', href: AUTHOR_URL, icon: 'globe' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/salmansayeed25/', icon: 'linkedin' },
  { name: 'GitHub', href: 'https://github.com/salman-sayeed', icon: 'github' },
  { name: 'Instagram', href: 'https://www.instagram.com/salman_bin_lemon/', icon: 'instagram' },
] as const;
