/**
 * Autofill's bits of UI inside other sites' pages: field highlights, the "Attach your resume
 * here" note, the "Filled 8 fields · Undo" bar, "Mark as applied?", "Save this answer for next
 * time?" and the optional floating button. Each lives in a closed shadow root so the site's CSS
 * can't reach it (and ours can't touch the site). No animations over 150 ms; none at all with
 * reduced motion.
 */

const BASE_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .card {
    --bg: #18181b; --ink: #fafafa; --muted: #a1a1aa; --accent: #818cf8;
    display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 14px;
    background: var(--bg); color: var(--ink); border-radius: 999px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.22);
    font: 500 13px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    animation: in 150ms cubic-bezier(.2, 0, 0, 1);
  }
  button {
    font: inherit; color: var(--accent); background: none; border: 0; padding: 4px 6px;
    border-radius: 6px; cursor: pointer;
  }
  button:hover { background: rgb(255 255 255 / 0.08); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  button.plain { color: var(--muted); }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
`;

function mount(tag: string, hostCss: string, build: (root: ShadowRoot) => void): HTMLElement {
  document.querySelectorAll(tag).forEach((el) => el.remove());
  const host = document.createElement(tag);
  host.style.cssText = `all:initial;${hostCss}`;
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = BASE_CSS;
  root.append(style);
  build(root);
  document.documentElement.append(host);
  return host;
}

function button(text: string, onclick: () => void, plain = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (plain) b.className = 'plain';
  b.addEventListener('click', onclick);
  return b;
}

const BOTTOM =
  'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;display:block';

/** Briefly outlines the fields Autofill filled. */
export function highlight(elements: HTMLElement[], ms = 1600): void {
  const restore: (() => void)[] = [];
  for (const el of new Set(elements)) {
    const { outline, outlineOffset, borderRadius } = el.style;
    el.style.outline = '2px solid #818cf8';
    el.style.outlineOffset = '2px';
    if (!borderRadius) el.style.borderRadius = '4px';
    restore.push(() => {
      el.style.outline = outline;
      el.style.outlineOffset = outlineOffset;
      el.style.borderRadius = borderRadius;
    });
  }
  setTimeout(() => restore.forEach((r) => r()), ms);
}

/** A small note under a file upload: Autofill never uploads files. Returns a remover. */
export function uploadNote(container: HTMLElement): () => void {
  const host = document.createElement('applicliq-note');
  host.style.cssText = 'all:initial;display:block;margin:6px 0';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    p { margin: 0; display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px;
      border-radius: 999px; background: #eef2ff; color: #3730a3;
      font: 500 12px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    @media (prefers-color-scheme: dark) { p { background: #312e81; color: #e0e7ff; } }
  `;
  const p = document.createElement('p');
  p.textContent = '↑ Attach your resume here · AppliCliq';
  root.append(style, p);
  container.after(host);
  return () => host.remove();
}

/** "Filled 8 fields · Undo" at the bottom of the page. */
export function filledBar(count: number, onUndo: (() => void) | undefined, failed = 0): void {
  const host = mount('applicliq-autofill-bar', BOTTOM, (root) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'status');
    const text = `AppliCliq · Filled ${count} ${count === 1 ? 'field' : 'fields'}${failed ? ` · ${failed} couldn’t be filled` : ''}`;
    card.append(text);
    if (onUndo) {
      card.append(
        button('Undo', () => {
          host.remove();
          onUndo();
        }),
      );
    }
    card.append(button('✕', () => host.remove(), true));
    root.append(card);
  });
  setTimeout(() => host.remove(), 12_000);
}

/** "Mark as applied? [Yes] [No]" after the confirmation page shows. */
export function askApplied(jobName: string, onYes: () => void): void {
  const host = mount('applicliq-autofill-applied', BOTTOM, (root) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', 'Mark as applied?');
    card.append(`AppliCliq · Mark ${jobName ? `“${jobName}”` : 'this job'} as applied?`);
    card.append(
      button('Yes', () => {
        host.remove();
        onYes();
      }),
      button('No', () => host.remove(), true),
    );
    root.append(card);
  });
  setTimeout(() => host.remove(), 30_000);
}

/** A short message at the bottom of the page. */
export function notice(text: string): void {
  const host = mount('applicliq-autofill-bar', BOTTOM, (root) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'status');
    card.append(
      `AppliCliq · ${text}`,
      button('✕', () => host.remove(), true),
    );
    root.append(card);
  });
  setTimeout(() => host.remove(), 6000);
}

/** "Save this answer for next time?" under a field the user just answered. */
export function offerToSave(container: HTMLElement, onSave: () => void): void {
  container.parentElement?.querySelectorAll('applicliq-save').forEach((el) => el.remove());
  const host = document.createElement('applicliq-save');
  host.style.cssText = 'all:initial;display:block;margin:6px 0';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `${BASE_CSS} .card { display: inline-flex; border-radius: 8px; padding: 4px 4px 4px 10px; font-size: 12px; }`;
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', 'Save this answer for next time?');
  card.append(
    'Save this answer for next time?',
    button('Save', () => {
      card.replaceChildren('Saved to AppliCliq ✓');
      onSave();
      setTimeout(() => host.remove(), 1500);
    }),
    button('No', () => host.remove(), true),
  );
  root.append(style, card);
  container.after(host);
}

/** The optional floating "Autofill with AppliCliq" button. Returns a remover. */
export function floatingButton(onClick: () => void): () => void {
  const host = mount(
    'applicliq-autofill-button',
    'position:fixed;bottom:20px;right:20px;z-index:2147483646;display:block',
    (root) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '4px';
      const main = button('Autofill with AppliCliq', onClick);
      main.style.color = '#fafafa';
      main.style.padding = '6px 10px';
      const close = button('✕', () => host.remove(), true);
      close.setAttribute('aria-label', 'Hide the Autofill button');
      card.append(main, close);
      root.append(card);
    },
  );
  return () => host.remove();
}
