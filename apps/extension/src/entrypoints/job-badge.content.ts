import type { OpenJobMessage, PageBadgeMessage } from '@/lib/messages';

/**
 * The "Applied 12 days ago · Interview" badge on pages of saved jobs. Injected by the
 * background only into tabs whose URL matches a saved job (when the user turned the page badge
 * on), then driven by `PageBadgeMessage`s, also after in-page (SPA) navigation.
 *
 * Lives in a closed shadow root so the site's CSS can't reach it. Kept dependency-free: it
 * runs inside other sites' pages.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    const flag = '__pocketCareerPageBadge';
    const scope = globalThis as unknown as Record<string, boolean>;
    // Injected again on every matching navigation; one listener is enough.
    if (scope[flag]) return;
    scope[flag] = true;

    /** Jobs whose badge was closed on this page; they stay hidden until the page reloads. */
    const dismissed = new Set<string>();
    let host: HTMLElement | undefined;

    function remove() {
      host?.remove();
      host = undefined;
    }

    function show(jobId: string, text: string, position: string) {
      remove();
      if (dismissed.has(jobId)) return;

      // e.g. 'bottom-right' → bottom:16px;right:16px (the setting is validated by the sender).
      const [vertical, horizontal] = position.split('-');
      const place = `${vertical === 'top' ? 'top' : 'bottom'}:16px;${horizontal === 'left' ? 'left' : 'right'}:16px`;
      host = document.createElement('pocket-career-badge');
      host.style.cssText = `all:initial;position:fixed;${place};z-index:2147483647;display:block`;
      const root = host.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = CSS;
      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.setAttribute('role', 'status');

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'open';
      open.title = 'Open in Pocket Career';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');
      open.append(dot, text);
      open.addEventListener('click', () => {
        const message: OpenJobMessage = { type: 'pocket-career:open-job', jobId };
        browser.runtime.sendMessage(message).catch(() => {});
      });

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'close';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '×';
      close.addEventListener('click', () => {
        dismissed.add(jobId);
        remove();
      });

      badge.append(open, close);
      root.append(style, badge);
      document.documentElement.append(host);
    }

    browser.runtime.onMessage.addListener((message: unknown) => {
      const m = message as PageBadgeMessage | undefined;
      if (m?.type !== 'pocket-career:page-badge') return;
      if (m.badge) show(m.badge.jobId, m.badge.text, m.badge.position);
      else remove();
    });
  },
});

const CSS = `
  .badge {
    --bg: #ffffff; --ink: #18181b; --muted: #71717a; --line: #e4e4e7; --accent: #4f46e5;
    display: flex; align-items: center; gap: 2px;
    padding: 4px 4px 4px 6px;
    background: var(--bg); color: var(--ink);
    border: 1px solid var(--line); border-radius: 999px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
    font: 500 13px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    animation: in 150ms cubic-bezier(.2, 0, 0, 1);
  }
  @media (prefers-color-scheme: dark) {
    .badge { --bg: #18181b; --ink: #f4f4f5; --muted: #a1a1aa; --line: #3f3f46; --accent: #818cf8; }
  }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .badge { animation: none; } }
  button {
    all: unset; box-sizing: border-box; cursor: pointer; border-radius: 999px;
    transition: background-color 150ms;
  }
  button:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .open { display: flex; align-items: center; gap: 8px; padding: 4px 8px; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
  .close {
    display: grid; place-items: center; width: 24px; height: 24px;
    color: var(--muted); font-size: 18px; line-height: 1;
  }
`;
