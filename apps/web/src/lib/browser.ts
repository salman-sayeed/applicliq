/** The visitor's browser, as far as the user agent tells. Call only in the browser (onMount). */
export type DetectedBrowser =
  'firefox' | 'firefox-android' | 'chrome' | 'brave' | 'edge' | 'opera' | 'safari' | 'other';

export function detectBrowser(): DetectedBrowser {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/.test(ua);
  if (/Firefox\//.test(ua)) return /Android/.test(ua) ? 'firefox-android' : 'firefox';
  // Safari is the only browser on iOS that takes extensions (other iOS browsers are Safari inside).
  if (/iPhone|iPad|iPod/.test(ua)) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'other' : 'safari';
  // Chromium browsers on Android don't run extensions.
  if (mobile) return 'other';
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if ('brave' in navigator) return 'brave';
  if (/Chrome\/|Chromium\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}
