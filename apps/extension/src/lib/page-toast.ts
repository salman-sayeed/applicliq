/**
 * A small toast at the top of the page ("Company set ✓"). Self-contained (no imports, no outer
 * variables) so it can also be injected with `scripting.executeScript({ func })`. Lives in a
 * closed shadow root, so the page's CSS can't reach it.
 */
export function showPageToast(text: string, ok = true): void {
  const TAG = 'applicliq-toast';
  document.querySelectorAll(TAG).forEach((el) => el.remove());
  const host = document.createElement(TAG);
  host.style.cssText =
    'all:initial;position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;display:block;pointer-events:none';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      --bg: #18181b; --ink: #fafafa; --ok: #4ade80; --warn: #fbbf24;
      display: flex; align-items: center; gap: 8px; padding: 8px 14px;
      background: var(--bg); color: var(--ink); border-radius: 999px;
      box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
      font: 500 13px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      animation: in 150ms cubic-bezier(.2, 0, 0, 1);
    }
    .mark { color: var(--ok); }
    .warn .mark { color: var(--warn); }
    @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  `;
  const toast = document.createElement('div');
  toast.className = ok ? 'toast' : 'toast warn';
  toast.setAttribute('role', 'status');
  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = ok ? '✓' : '!';
  toast.append(`AppliCliq · ${text}`, mark);
  root.append(style, toast);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 2200);
}
