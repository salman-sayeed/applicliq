/**
 * Where AppliCliq can be installed, and how to support it: the one place to change them.
 * The landing page, /install and the README's "Get it" row follow this list.
 *
 * Icons are brand marks from Simple Icons (CC0), saved in `assets/stores/` with each brand's
 * colour baked in. Microsoft Edge comes from simple-icons 12, the last version that has it.
 */
import firefoxIcon from './assets/stores/firefoxbrowser.svg';
import chromeIcon from './assets/stores/googlechrome.svg';
import edgeIcon from './assets/stores/microsoftedge.svg';
import operaIcon from './assets/stores/opera.svg';
import safariIcon from './assets/stores/safari.svg';
import braveIcon from './assets/stores/brave.svg';
import { GITHUB_URL } from './links';

export type StoreId = 'firefox' | 'firefox-android' | 'chrome' | 'edge' | 'opera' | 'safari';

export type Store = {
  id: StoreId;
  name: string;
  /** URL of the brand icon (a local SVG). */
  icon: string;
  /** Brand colour, used for the hover glow. */
  color: string;
  /** Store listing. Only followed when `status` is 'live'. */
  url: string;
  status: 'live' | 'coming-soon';
};

// The AMO slug is still career-pocket; the maintainer changes it on addons.mozilla.org first.
const FIREFOX_URL = 'https://addons.mozilla.org/en-US/firefox/addon/career-pocket/';

export const STORES: readonly Store[] = [
  {
    id: 'firefox',
    name: 'Firefox Add-ons',
    icon: firefoxIcon,
    color: '#ff7139',
    url: FIREFOX_URL,
    status: 'live',
  },
  {
    id: 'firefox-android',
    name: 'Firefox for Android',
    icon: firefoxIcon,
    color: '#ff7139',
    url: FIREFOX_URL,
    status: 'live',
  },
  {
    id: 'chrome',
    name: 'Chrome Web Store',
    icon: chromeIcon,
    color: '#4285f4',
    url: '',
    status: 'coming-soon',
  },
  {
    id: 'edge',
    name: 'Microsoft Edge Add-ons',
    icon: edgeIcon,
    color: '#0078d7',
    url: '',
    status: 'coming-soon',
  },
  {
    id: 'opera',
    name: 'Opera Add-ons',
    icon: operaIcon,
    color: '#ff1b2d',
    url: '',
    status: 'coming-soon',
  },
  {
    id: 'safari',
    name: 'Safari',
    icon: safariIcon,
    color: '#006cff',
    url: '',
    status: 'coming-soon',
  },
];

export const storeById = (id: StoreId): Store => STORES.find((s) => s.id === id)!;

/** The Chromium build of the newest release (the release workflow uploads it under this name). */
export const CHROMIUM_ZIP_URL = `${GITHUB_URL}/releases/latest/download/applicliq-chromium.zip`;

/** Browsers covered by the manual install guide on /install. */
export const MANUAL_BROWSERS = [
  { id: 'chrome', name: 'Chrome', icon: chromeIcon, page: 'chrome://extensions' },
  { id: 'brave', name: 'Brave', icon: braveIcon, page: 'brave://extensions' },
  { id: 'edge', name: 'Edge', icon: edgeIcon, page: 'edge://extensions' },
  { id: 'opera', name: 'Opera', icon: operaIcon, page: 'opera://extensions' },
] as const;

export type ManualBrowserId = (typeof MANUAL_BROWSERS)[number]['id'];

/**
 * Donations, shown in the Support section above the landing page's footer (and listed in the
 * README's Support section). Empty values show "coming soon" placeholders; fill in a link, a
 * crypto address, or both. The QR code for the address is generated at build time.
 */
export const SUPPORT: {
  /** A donation page, e.g. Buy Me a Coffee or Ko-fi. */
  donationUrl: string;
  /** Button text for `donationUrl`. */
  donationLabel: string;
  crypto: {
    /** e.g. 'USDT' */
    coin: string;
    /** e.g. 'Tron (TRC-20)'. Shown next to the address so people send on the right chain. */
    network: string;
    address: string;
  };
} = {
  donationUrl: '',
  donationLabel: 'Buy me a coffee',
  crypto: { coin: '', network: '', address: '' },
};
