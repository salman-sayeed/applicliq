import { getAgent } from '@/lib/autofill-agent';

/**
 * Autofill's in-page agent, injected on demand into every frame of the tab (Greenhouse and
 * Ashby forms are often iframes on a company's site) when the user clicks "Autofill this form" in
 * the popup or sidebar: `activeTab` + `scripting`, no host permissions. The popup then sends it
 * commands (scan, fill, undo) with `scripting.executeScript`.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    getAgent();
  },
});
