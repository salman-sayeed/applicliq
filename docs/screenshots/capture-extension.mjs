// Captures the extension screenshots for the landing page: the sidebar next to a job posting,
// "pick from page", and the right-click menu for selected text. Each uses its own fictional
// posting, filled into demo-job.html and served on localhost.
//
//   pnpm --filter @career-pocket/extension build
//   CHROME="/path/to/chrome" node docs/screenshots/capture-extension.mjs
//
// Loads a copy of .output/chrome-mv3 into a headless Chrome over the DevTools pipe (no
// dependencies). The copy is granted all-sites access up front, which the real sidebar asks
// for with a click. Headless Chrome can't capture its own context menus, so the right-click shot
// draws one in the page with the extension's real menu items. Writes:
//   apps/web/src/lib/assets/screenshots/extension-*.webp   2x, for the website
//   docs/screenshots/store/extension-*.png                 1280x800, for the browser stores
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME;
if (!CHROME) throw new Error('Set CHROME to a Chrome or Chromium executable.');

const root = fileURLToPath(new URL('../../', import.meta.url));
const webOut = join(root, 'apps/web/src/lib/assets/screenshots');
const storeOut = join(root, 'docs/screenshots/store');
const WIDTH = 1280;
const HEIGHT = 800;
const PANEL = 380;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- The extension copy and the job page ----------------------------------------------------

const temp = mkdtempSync(join(tmpdir(), 'cp-ext-shots-'));
const extDir = join(temp, 'extension');
cpSync(join(root, 'apps/extension/.output/chrome-mv3'), extDir, { recursive: true });
const manifestPath = join(extDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['<all_urls>'];
delete manifest.optional_host_permissions;
writeFileSync(manifestPath, JSON.stringify(manifest));

/** The fictional postings, one per shot. `jsonld` is what the page tells the scraper. */
const POSTINGS = {
  sidebar: {
    board: 'hireboard',
    accent: '#0f766e',
    pageBg: '#f8fafc',
    team: 'Engineering / Frontend',
    title: 'Senior Frontend Engineer',
    company: 'Northwind Labs',
    logo: 'N',
    logoBg: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
    location: 'Berlin, Germany',
    workType: 'Hybrid',
    salary: '€75,000 – €90,000 a year',
    about:
      "Northwind Labs builds the collaborative editor that 4,000 product teams plan their work in. You'll own the editor's frontend: performance, accessibility and the details people notice every day.",
    bullets: [
      '5+ years building web apps with TypeScript',
      'Experience with Svelte, React or Vue',
      'Care for accessibility and fast, quiet interfaces',
    ],
    jsonld: { location: ['Berlin', 'Germany'], salary: ['EUR', 75000, 90000] },
  },
  picker: {
    board: 'jobnest',
    accent: '#c2410c',
    pageBg: '#fffbf5',
    team: 'Design / Product',
    title: 'Product Designer',
    company: 'Lumen Health',
    logo: 'L',
    logoBg: 'linear-gradient(135deg, #f97316, #e11d48)',
    location: 'Lisbon, Portugal',
    workType: 'Remote',
    salary: '€55,000 – €68,000 a year',
    about:
      'Lumen Health helps clinics run their day: bookings, reminders and patient notes in one calm app. You will design the patient side, from the first booking to the follow-up.',
    bullets: [
      'A portfolio of shipped product work',
      'Comfortable with research and prototyping',
      'Plain, clear writing',
    ],
    // No location in the page's data: the picker fills it in.
    jsonld: { salary: ['EUR', 55000, 68000] },
  },
  menu: {
    board: 'openroles',
    accent: '#1d4ed8',
    pageBg: '#f5f7ff',
    team: 'Data / Platform',
    title: 'Data Engineer',
    company: 'Cobalt Analytics',
    logo: 'C',
    logoBg: 'linear-gradient(135deg, #1d4ed8, #0891b2)',
    location: 'Dublin, Ireland',
    workType: 'Hybrid',
    salary: '$120,000 – $140,000 a year',
    about:
      'Cobalt Analytics turns warehouse and shipping data into forecasts retailers can act on. You will build the pipelines behind them, from ingestion to the tables our analysts query.',
    bullets: [
      'Strong SQL and Python',
      'Experience with batch and streaming pipelines',
      'You like making slow things fast',
    ],
    // No salary in the page's data: the right-click menu fills it in.
    jsonld: { location: ['Dublin', 'Ireland'] },
  },
};

const template = readFileSync(join(root, 'docs/screenshots/demo-job.html'), 'utf8');
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function render(p) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: p.title,
    hiringOrganization: { '@type': 'Organization', name: p.company },
    employmentType: 'FULL_TIME',
    datePosted: '2026-11-18',
  };
  if (p.jsonld.location) {
    const [addressLocality, addressCountry] = p.jsonld.location;
    data.jobLocation = {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality, addressCountry },
    };
  }
  if (p.jsonld.salary) {
    const [currency, minValue, maxValue] = p.jsonld.salary;
    data.baseSalary = {
      '@type': 'MonetaryAmount',
      currency,
      value: { '@type': 'QuantitativeValue', minValue, maxValue, unitText: 'YEAR' },
    };
  }
  const values = {
    ...p,
    jsonld: `<script type="application/ld+json">${JSON.stringify(data)}</script>`,
    bullets: p.bullets.map((b) => `<li>${escape(b)}</li>`).join(''),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key === 'jsonld' || key === 'bullets' ? values[key] : escape(String(values[key])),
  );
}

const server = createServer((req, res) => {
  const key = req.url.split('/')[2];
  if (!(key in POSTINGS)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(render(POSTINGS[key]));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const postingUrl = (key) =>
  `http://${POSTINGS[key].board}.localhost:${server.address().port}/jobs/${key}`;

/** The extension's icon, for the drawn context menu. */
const menuIcon = `data:image/png;base64,${readFileSync(
  join(root, 'apps/extension/.output/chrome-mv3/icon/32.png'),
).toString('base64')}`;

// --- Chrome over the DevTools pipe ----------------------------------------------------------

const profile = join(temp, 'profile');
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);
const toChrome = chrome.stdio[3];
const fromChrome = chrome.stdio[4];

let nextId = 1;
const pending = new Map();
let buffer = '';
fromChrome.on('data', (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
      else resolve(msg.result);
    }
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    toChrome.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });

async function open(url, background = false) {
  const { targetId } = await send('Target.createTarget', { url, background });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Runtime.enable');
  await call('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'eval failed');
    return result.value;
  };
  const waitFor = async (expression, timeout = 10_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
  /** A screenshot at `width`×800 CSS pixels and 2x, as a data URL. */
  const capture = async (width) => {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(400);
    const { data } = await call('Page.captureScreenshot', { format: 'png' });
    return `data:image/png;base64,${data}`;
  };
  return { targetId, call, evaluate, waitFor, capture };
}

/** Puts the page and the panel side by side, like the browser's side panel, and saves both sizes. */
async function compose(name, pageShot, panelShot) {
  const html = `<!doctype html><style>
    body { margin: 0; display: flex; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    img { display: block; height: ${HEIGHT}px; }
    .panel { border-left: 1px solid #d4d4d8; box-shadow: -6px 0 18px rgba(0,0,0,.06); }
  </style><img src="${pageShot}" width="${WIDTH - PANEL - 1}"><img class="panel" src="${panelShot}" width="${PANEL}">`;
  // In the background: the panel follows the active tab, which must stay the job page.
  const sheet = await open('about:blank', true);
  const { frameTree } = await sheet.call('Page.getFrameTree');
  await sheet.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
  await sheet.waitFor(`[...document.images].every((i) => i.complete && i.naturalWidth)`);
  for (const [scale, format, file] of [
    [2, 'webp', join(webOut, `${name}.webp`)],
    [1, 'png', join(storeOut, `${name}.png`)],
  ]) {
    await sheet.call('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: scale,
      mobile: false,
    });
    await sleep(300);
    const { data } = await sheet.call('Page.captureScreenshot', { format, quality: 88 });
    writeFileSync(file, Buffer.from(data, 'base64'));
  }
  await send('Target.closeTarget', { targetId: sheet.targetId });
  console.log(`captured ${name}`);
}

// --- Shots ----------------------------------------------------------------------------------

try {
  const { id } = await send('Extensions.loadUnpacked', { path: extDir });
  // Close the welcome tab the extension opens on install.
  await sleep(1000);
  const { targetInfos } = await send('Target.getTargets');
  for (const t of targetInfos)
    if (t.url.startsWith(`chrome-extension://${id}/`))
      await send('Target.closeTarget', { targetId: t.targetId });

  const pageWidth = WIDTH - PANEL - 1;
  const job = await open(postingUrl('sidebar'));
  await job.call('Emulation.setDeviceMetricsOverride', {
    width: pageWidth,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await job.waitFor(`document.readyState === 'complete'`);
  await sleep(500);

  // Opened in the background, then the job page is brought to the front: the panel follows the
  // active tab, as it does in the browser's side panel.
  const panel = await open(`chrome-extension://${id}/sidepanel.html`, true);
  await panel.call('Emulation.setDeviceMetricsOverride', {
    width: PANEL,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await sleep(500);
  await send('Target.activateTarget', { targetId: job.targetId });

  /** Loads a posting in the job tab and waits for the panel to read it. */
  async function show(key) {
    if (key !== 'sidebar') {
      await job.call('Page.navigate', { url: postingUrl(key) });
      await job.waitFor(
        `location.pathname.endsWith('/${key}') && document.readyState === 'complete'`,
      );
    }
    await panel.waitFor(
      `[...document.querySelectorAll('input')].some((i) => i.value === ${JSON.stringify(POSTINGS[key].title)})`,
    );
    await sleep(500);
  }
  const setSelect = (value) =>
    panel.evaluate(`(() => {
      const select = [...document.querySelectorAll('select')].find((s) =>
        [...s.options].some((o) => o.value === ${JSON.stringify(value)}),
      );
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

  // 1. The sidebar fills in the posting; a note is added.
  await show('sidebar');
  await panel.evaluate(`(() => {
    const notes = document.querySelector('textarea');
    notes.value = 'Referral from Sam. Ask about the editor rewrite.';
    notes.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await setSelect('hybrid');
  await panel.evaluate('document.activeElement?.blur()');
  await sleep(300);
  await compose('extension-sidebar', await job.capture(pageWidth), await panel.capture(PANEL));

  // 2. Pick from page: the posting's data has no location, so pick it from the page.
  await show('picker');
  await setSelect('remote');
  await panel.evaluate(
    `document.querySelector('[aria-label="Pick location from the page"]').click()`,
  );
  await sleep(800);
  const chip = await job.evaluate(`(() => {
    const r = document.querySelector('.location').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await job.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: chip.x, y: chip.y });
  await sleep(400);
  await compose('extension-picker', await job.capture(pageWidth), await panel.capture(PANEL));
  await job.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });

  // 3. Right-click on selected text: the salary isn't in the posting's data, so set it from the
  // selection. The menu is drawn in the page with the extension's own items.
  await show('menu');
  await setSelect('hybrid');
  await job.evaluate(`(() => {
    const salary = document.querySelector('.salary');
    const range = document.createRange();
    range.selectNodeContents(salary);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const r = salary.getBoundingClientRect();
    const items = ['Set as Title', 'Set as Company', 'Set as Location', 'Set as Salary', 'Append to Notes'];
    const menu = document.createElement('div');
    menu.innerHTML = \`
      <style>
        .cm { position: fixed; z-index: 10; font: 13px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #1f2937; background: #fff; border: 1px solid #d4d4d8; border-radius: 8px;
          box-shadow: 0 10px 30px rgb(0 0 0 / 0.18); padding: 5px; width: 230px; }
        .cm div { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 5px; }
        .cm hr { border: 0; border-top: 1px solid #e4e4e7; margin: 4px 6px; }
        .cm .on { background: #2563eb; color: #fff; }
        .cm img { width: 16px; height: 16px; }
        .cm .arrow { margin-left: auto; }
        .cm .pad { width: 16px; }
      </style>
      <div class="cm" style="left:\${r.left + 40}px; top:\${r.bottom + 6}px">
        <div><span class="pad"></span>Copy</div>
        <div><span class="pad"></span>Print…</div>
        <hr>
        <div class="on"><img src="${menuIcon}" alt="">Career Pocket<span class="arrow">▸</span></div>
        <hr>
        <div><span class="pad"></span>Inspect</div>
      </div>
      <div class="cm" style="left:\${r.left + 40 + 228}px; top:\${r.bottom + 6 + 62}px">
        \${items.map((i) => '<div' + (i === 'Set as Salary' ? ' class="on"' : '') + '>' + i + '</div>').join('')}
      </div>\`;
    document.body.append(menu);
  })()`);
  await sleep(300);
  await compose('extension-menu', await job.capture(pageWidth), await panel.capture(PANEL));
} finally {
  chrome.kill();
  server.close();
  await sleep(300);
  rmSync(temp, { recursive: true, force: true });
}
