import { extractJob } from '@pocket-career/core';

/**
 * Injected on demand (popup, shortcut) with `scripting.executeScript` under `activeTab`, so the
 * extension needs no access to all sites. Reads the current page only; the return value is
 * handed back to the caller by `executeScript`.
 */
export default defineContentScript({
  registration: 'runtime',
  main: () => extractJob(document, new URL(location.href)),
});
