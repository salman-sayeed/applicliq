/**
 * The saved-job page badge needs to read tab URLs and inject into job pages, i.e. access to all
 * sites. It's an optional permission, asked for only when the user turns the badge on.
 */
const ALL_SITES: Parameters<typeof browser.permissions.request>[0] = { origins: ['<all_urls>'] };

export function hasPageAccess(): Promise<boolean> {
  return browser.permissions.contains(ALL_SITES);
}

/** Must be called directly from a click handler (browsers require a user gesture). */
export function requestPageAccess(): Promise<boolean> {
  return browser.permissions.request(ALL_SITES);
}

export function removePageAccess(): Promise<boolean> {
  return browser.permissions.remove(ALL_SITES);
}
