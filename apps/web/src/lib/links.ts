/** Outbound links used across the site. Swap the store links in once the listings are live. */
export const GITHUB_URL = 'https://github.com/salman-sayeed/careerpocket';
export const ISSUES_URL = `${GITHUB_URL}/issues/new`;

export const INSTALL_LINKS = [
  { browser: 'Chrome', href: `${GITHUB_URL}#install` },
  { browser: 'Firefox', href: `${GITHUB_URL}#install` },
  { browser: 'Edge', href: `${GITHUB_URL}#install` },
] as const;

/** The author's profiles, shown in the site footer. */
export const AUTHOR_URL = 'https://salmansayeed.dev';
export const AUTHOR_LINKS = [
  { name: 'Email', href: 'mailto:ss.salmansayeed@gmail.com', icon: 'mail' },
  { name: 'Website', href: AUTHOR_URL, icon: 'globe' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/salmansayeed25/', icon: 'linkedin' },
  { name: 'GitHub', href: 'https://github.com/salman-sayeed', icon: 'github' },
  { name: 'Instagram', href: 'https://www.instagram.com/salman_bin_lemon/', icon: 'instagram' },
] as const;
