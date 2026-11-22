import type { PickedMessage, StartPickerMessage } from '@/lib/messages';

/**
 * "Pick from page": highlights the element under the cursor; a click sends its text to the
 * background, which writes it into the page's draft and shows a toast. Esc cancels.
 *
 * Injected on demand from the popup or sidebar (`activeTab`), then started with a
 * `StartPickerMessage`. The highlight and label live in a closed shadow root so the site's CSS
 * can't reach them. Kept dependency-free: it runs inside other sites' pages.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    const flag = '__careerPocketPicker';
    const scope = globalThis as unknown as Record<string, boolean>;
    if (scope[flag]) return;
    scope[flag] = true;

    let stop: (() => void) | undefined;

    browser.runtime.onMessage.addListener((message: unknown) => {
      const m = message as StartPickerMessage | undefined;
      if (m?.type !== 'career-pocket:start-picker') return;
      stop?.();
      stop = start(m.field, m.label);
    });

    function start(field: StartPickerMessage['field'], label: string) {
      const host = document.createElement('career-pocket-picker');
      host.style.cssText =
        'all:initial;position:fixed;inset:0;z-index:2147483647;display:block;pointer-events:none';
      const root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = CSS;
      const box = document.createElement('div');
      box.className = 'box';
      const tip = document.createElement('div');
      tip.className = 'tip';
      tip.setAttribute('role', 'status');
      tip.textContent = `Click to ${field === 'notes' ? 'add to' : 'set'} ${label} · Esc to cancel`;
      root.append(style, box, tip);
      document.documentElement.append(host);

      let current: Element | undefined;

      const target = (event: Event) => {
        const el = event.composedPath()[0];
        return el instanceof Element && el !== host ? el : undefined;
      };

      const onMove = (event: MouseEvent) => {
        const el = target(event);
        if (!el || el === current) return;
        current = el;
        const r = el.getBoundingClientRect();
        box.style.cssText = `display:block;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
      };

      // Swallow the whole click so links and buttons on the page don't act on it.
      const block = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      const onClick = (event: MouseEvent) => {
        block(event);
        const el = target(event) ?? current;
        const text = (el instanceof HTMLElement ? el.innerText : el?.textContent)?.trim() ?? '';
        end();
        if (!text) return;
        const message: PickedMessage = { type: 'career-pocket:picked', field, text };
        browser.runtime.sendMessage(message).catch(() => {});
      };

      const onKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        block(event);
        end();
      };

      const options = { capture: true } as const;
      const swallowed = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick'] as const;

      function end() {
        window.removeEventListener('mousemove', onMove, options);
        window.removeEventListener('click', onClick, options);
        window.removeEventListener('keydown', onKey, options);
        for (const type of swallowed) window.removeEventListener(type, block, options);
        host.remove();
        stop = undefined;
      }

      window.addEventListener('mousemove', onMove, options);
      window.addEventListener('click', onClick, options);
      window.addEventListener('keydown', onKey, options);
      for (const type of swallowed) window.addEventListener(type, block, options);
      return end;
    }
  },
});

const CSS = `
  .box {
    display: none; position: fixed; box-sizing: border-box;
    border: 2px solid #4f46e5; border-radius: 4px;
    background: rgb(79 70 229 / 0.12);
    transition: all 80ms ease-out;
  }
  .tip {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    padding: 8px 14px; border-radius: 999px;
    background: #18181b; color: #fafafa;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
    font: 500 13px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) { .box { transition: none; } }
`;
