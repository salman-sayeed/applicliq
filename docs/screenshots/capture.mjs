// Captures the web dashboard screenshots used on the landing page and in the store listings.
//
//   node docs/screenshots/make-demo-data.mjs
//   pnpm dev:web                                  # in another terminal
//   CHROME="/path/to/chrome" node docs/screenshots/capture.mjs [http://localhost:5173]
//
// Drives a headless Chrome over the DevTools protocol (no dependencies). Google is never
// contacted: Drive and sign-in requests are answered locally, so the dashboard shows a real
// "Synced" state with the fictional demo data. Writes:
//   apps/web/src/lib/assets/screenshots/*.webp   2x, for the website
//   docs/screenshots/store/*.png                  1280x800, for the browser stores
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const CHROME = process.env.CHROME;
if (!CHROME) throw new Error('Set CHROME to a Chrome or Chromium executable.');

const root = fileURLToPath(new URL('../../', import.meta.url));
const demoFile = join(root, 'docs/screenshots/demo-data.json');
const webOut = join(root, 'apps/web/src/lib/assets/screenshots');
const storeOut = join(root, 'docs/screenshots/store');
mkdirSync(webOut, { recursive: true });
mkdirSync(storeOut, { recursive: true });
readFileSync(demoFile); // Fail early if the demo data hasn't been generated.

const WIDTH = 1280;
const HEIGHT = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Chrome + CDP -------------------------------------------------------------------------------

const profile = mkdtempSync(join(tmpdir(), 'cp-shots-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  'about:blank',
]);
const wsUrl = await new Promise((resolve, reject) => {
  let err = '';
  chrome.stderr.on('data', (d) => {
    err += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
    if (m) resolve(m[1]);
  });
  chrome.on('exit', (code) => reject(new Error(`Chrome exited (${code}): ${err}`)));
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
    else resolve(msg.result);
  } else if (msg.method) {
    for (const fn of listeners) fn(msg);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params) => send(method, params, sessionId);

await page('Page.enable');
await page('Runtime.enable');
await page('DOM.enable');
await page('Emulation.setEmulatedMedia', {
  features: [
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ],
});

// --- Fake Google --------------------------------------------------------------------------------

const json = (body) => ({
  responseCode: 200,
  responseHeaders: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Expose-Headers', value: 'ETag' },
    { name: 'ETag', value: '"demo"' },
  ],
  body: Buffer.from(JSON.stringify(body)).toString('base64'),
});

await page('Fetch.enable', {
  patterns: [{ urlPattern: '*googleapis.com*' }, { urlPattern: '*accounts.google.com*' }],
});
listeners.push(async (msg) => {
  if (msg.method !== 'Fetch.requestPaused' || msg.sessionId !== sessionId) return;
  const { requestId, request } = msg.params;
  const url = request.url;
  let reply;
  if (request.method === 'OPTIONS') {
    reply = {
      responseCode: 204,
      responseHeaders: [
        { name: 'Access-Control-Allow-Origin', value: '*' },
        { name: 'Access-Control-Allow-Headers', value: '*' },
        { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE' },
      ],
    };
  } else if (url.includes('accounts.google.com')) {
    reply = {
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
      body: '',
    };
  } else if (url.includes('/about')) {
    reply = json({ user: { emailAddress: 'alex@example.com' } });
  } else if (url.includes('/upload/')) {
    reply = json({ id: 'demo-file' });
  } else if (url.includes('/files') && request.method === 'GET' && !url.includes('alt=media')) {
    reply = json({ files: [] });
  } else {
    reply = json({});
  }
  await page('Fetch.fulfillRequest', { requestId, ...reply }).catch(() => {});
});

// Signed in, with a token that won't expire during the run.
await page('Page.addScriptToEvaluateOnNewDocument', {
  source: `try {
    localStorage.setItem('career-pocket:sync-signed-in', 'true');
    sessionStorage.setItem('career-pocket:sync-token',
      JSON.stringify({ token: 'demo', expiresAt: Date.now() + 3600e3 }));
  } catch {}`,
});

// --- Helpers ------------------------------------------------------------------------------------

async function evaluate(expression) {
  const { result, exceptionDetails } = await page('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'eval failed');
  return result.value;
}

async function waitFor(expression, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function go(path) {
  const loaded = new Promise((resolve) => {
    const fn = (msg) => {
      if (msg.method === 'Page.loadEventFired' && msg.sessionId === sessionId) {
        listeners.splice(listeners.indexOf(fn), 1);
        resolve();
      }
    };
    listeners.push(fn);
  });
  await page('Page.navigate', { url: BASE + path });
  await loaded;
  await sleep(500);
}

const clickText = (selector, text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => e.textContent.trim() === ${JSON.stringify(text)});
    if (!el) throw new Error('No ' + ${JSON.stringify(selector + ' ' + text)});
    el.click();
  })()`);

async function shoot(name, { web = true, store = true } = {}) {
  await evaluate('document.activeElement?.blur()');
  await sleep(400);
  if (web) {
    await page('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(300);
    const { data } = await page('Page.captureScreenshot', { format: 'webp', quality: 88 });
    writeFileSync(join(webOut, `${name}.webp`), Buffer.from(data, 'base64'));
  }
  if (store) {
    await page('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);
    const { data } = await page('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(storeOut, `${name}.png`), Buffer.from(data, 'base64'));
  }
  console.log(`captured ${name}`);
}

// --- Shots --------------------------------------------------------------------------------------

try {
  await page('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Import the demo data through the real Settings → Data import.
  await go('/app/settings#data');
  await waitFor(`document.querySelector('input[type=file]')`);
  const { root: doc } = await page('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page('DOM.querySelector', {
    nodeId: doc.nodeId,
    selector: 'input[type=file]',
  });
  await page('DOM.setFileInputFiles', { nodeId, files: [demoFile] });
  await waitFor(`/Imported \\d+ records/.test(document.body.innerText)`);

  await go('/app');
  await waitFor(
    `/Synced/.test(document.body.innerText) && document.querySelectorAll('tbody tr').length > 5`,
  );
  await clickText('tbody button', 'Senior Frontend Engineer');
  await waitFor(`document.querySelector('#job-detail-title')`);
  await shoot('dashboard-list');

  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await clickText('button', 'Board');
  await waitFor(`document.querySelectorAll('section[aria-label] button[draggable]').length > 5`);
  await shoot('dashboard-board');

  await clickText('button', 'Stats');
  await sleep(800);
  await shoot('dashboard-stats');

  await go('/app/settings#data');
  await waitFor(`/Export JSON/.test(document.body.innerText)`);
  await shoot('settings-data', { web: false });
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
