// Reminder spike (D-028): automated experiments against the spike build.
//
// Site access is pre-granted through a patched copy of the build, because the
// native permission dialog cannot be driven by automation:
//   1. npm run build
//   2. copy dist/ somewhere and add  "host_permissions": ["*://*.shop.test/*"]  to its manifest.json
//   3. CHROME_BIN=/path/to/chromium node spike/experiments.mjs <that copy> [headless|headed]
//
// shop.test and other.test are mapped to a local server with --host-resolver-rules,
// so nothing leaves the machine. Raw DevTools protocol, no dependencies, Node 22+.
// --load-extension needs Chromium or Chrome for Testing; branded Chrome ignores it.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extDir = resolve(process.argv[2]);
const display = process.argv[3] ?? 'headless';
const PORT = display === 'headed' ? 9334 : 9335;
const WEB = display === 'headed' ? 8123 : 8124;
const CHROME = process.env.CHROME_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- local "merchant" sites -------------------------------------------------
const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><title>${req.headers.host}${req.url}</title>
<h1>${req.headers.host}${req.url}</h1>
<a id="next" href="/page2">next page</a>
<button id="spa" onclick="history.pushState({}, '', '/spa-' + Date.now())">pushState</button>`);
});
await new Promise((r) => server.listen(WEB, '127.0.0.1', r));

// --- browser ----------------------------------------------------------------
const chrome = spawn(
  CHROME,
  [
    ...(display === 'headless' ? ['--headless=new'] : []),
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-proxy-server',
    '--window-size=1200,800',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pb-spike-'))}`,
    `--remote-debugging-port=${PORT}`,
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--host-resolver-rules=MAP shop.test 127.0.0.1,MAP *.shop.test 127.0.0.1,MAP other.test 127.0.0.1',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function browserWsUrl() {
  for (let i = 0; i < 75; i++) {
    try {
      return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json())
        .webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error('Chromium did not start');
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    }
  });
  return {
    ready: new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    }),
    send(method, params = {}, sessionId) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((res, rej) => pending.set(id, { res, rej }));
    },
    close: () => ws.close(),
  };
}

const findings = [];
const finding = (id, text) => {
  findings.push(`${id}: ${text}`);
  console.log(`\n>>> ${id}: ${text}`);
};

try {
  const cdp = connect(await browserWsUrl());
  await cdp.ready;
  const targets = async () => (await cdp.send('Target.getTargets')).targetInfos;

  let worker;
  for (let i = 0; i < 50 && !worker; i++) {
    worker = (await targets()).find(
      (t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
    );
    if (!worker) await sleep(200);
  }
  if (!worker) throw new Error('extension did not load');
  const extId = new URL(worker.url).host;
  const ext = (path) => `chrome-extension://${extId}/${path}`;

  async function attach(targetId) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => cdp.send(method, params, sessionId);
    return {
      targetId,
      s,
      async evaluate(expression, userGesture = false) {
        const { result, exceptionDetails } = await s('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture,
        });
        if (exceptionDetails)
          throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
      },
    };
  }
  async function openTab(url, background = false) {
    const { targetId } = await cdp.send('Target.createTarget', { url, background });
    const tab = await attach(targetId);
    await tab.s('Page.enable');
    return tab;
  }

  // Control tab: an extension page used only to read storage and flip settings.
  const control = await openTab(ext('library.html'));
  await sleep(800);
  const readLog = () =>
    control.evaluate("chrome.storage.local.get('spike.log').then((r) => r['spike.log'] ?? [])");
  const fmt = (e) => `   ${e.src.padEnd(7)} ${e.event} ${e.data ? JSON.stringify(e.data) : ''}`;
  let seen = 0;
  async function step(title, action, waitMs = 1500) {
    console.log(`\n=== ${title}`);
    await action();
    await sleep(waitMs);
    const log = await readLog();
    const fresh = log.slice(seen);
    seen = log.length;
    fresh.forEach((e) => console.log(fmt(e)));
    return fresh;
  }
  const has = (entries, event, pred = () => true) =>
    entries.some((e) => e.event === event && pred(e.data ?? {}));
  const popupTargets = async () =>
    (await targets()).filter((t) => t.url.startsWith(ext('popup.html')));

  const site = (host, path = '/') => `http://${host}:${WEB}${path}`;

  // S0 ------------------------------------------------------------------------
  const s0 = await step('S0 install', async () => {}, 500);
  finding(
    'S0',
    `onInstalled reconcile registered the content script for granted origins: ${has(s0, 'content-scripts:reconciled', (d) => d.matches?.length > 0)}`,
  );
  const focusState = await control.evaluate(
    'chrome.windows.getCurrent().then((w) => ({ focused: w.focused, state: w.state }))',
  );
  finding(
    'S0',
    `browser window as the extension sees it (${display}): ${JSON.stringify(focusState)}`,
  );

  // S1 ------------------------------------------------------------------------
  let merchant;
  const s1 = await step(
    'S1 foreground tab opens a granted site (www.shop.test)',
    async () => {
      merchant = await openTab(site('www.shop.test'));
    },
    2500,
  );
  finding(
    'D-009',
    `tabs.onUpdated saw the visit with no content script and no "tabs" permission: ${has(s1, 'detect:tabs.onUpdated', (d) => d.host === 'www.shop.test' && d.matched === 'shop.test')}`,
  );
  finding('D-009', `content script also reported it: ${has(s1, 'detect:content-script:load')}`);
  const firstA = s1.find((e) => e.event === 'detect:tabs.onUpdated');
  const firstB = s1.find((e) => e.event === 'detect:content-script:load');
  if (firstA && firstB)
    finding(
      'D-009',
      `first signal: tabs.onUpdated at ${firstA.t.slice(17)} (urlChanged=${firstA.data.urlChanged}, status=${firstA.data.status}), content script at ${firstB.t.slice(17)}`,
    );
  const open1 = s1.find((e) => e.event.startsWith('reminder:openPopup'));
  finding(
    'D-001',
    `openPopup on an active tab (${display}): ${open1 ? `${open1.event} ${JSON.stringify(open1.data)}` : 'not attempted'}`,
  );
  finding(
    'D-001',
    `popup page targets present: ${(await popupTargets()).length}; popup logged trigger: ${JSON.stringify(s1.find((e) => e.event === 'popup:opened')?.data ?? null)}`,
  );

  // S2 ------------------------------------------------------------------------
  const s2 = await step(
    'S2 same-site navigation by link',
    () => merchant.evaluate("document.getElementById('next').click()"),
    2000,
  );
  finding(
    'PB-007',
    `same-site navigation: detected=${has(s2, 'detect:tabs.onUpdated')}, reopened=${has(s2, 'reminder:openPopup-ok')}, skipped=${has(s2, 'reminder:skip-same-visit')}`,
  );

  // S3 ------------------------------------------------------------------------
  const s3 = await step(
    'S3 single-page navigation (history.pushState)',
    () => merchant.evaluate("document.getElementById('spa').click()"),
    1500,
  );
  finding(
    'D-009',
    `pushState navigation: tabs.onUpdated=${has(s3, 'detect:tabs.onUpdated', (d) => d.urlChanged)}, content script=${has(s3, 'detect:content-script:load')}`,
  );

  // S4 ------------------------------------------------------------------------
  const s4 = await step('S4 reload', () => merchant.s('Page.reload'), 2000);
  finding(
    'PB-007',
    `reload: reopened=${has(s4, 'reminder:openPopup-ok')}, skipped=${has(s4, 'reminder:skip-same-visit')}`,
  );

  // S5 ------------------------------------------------------------------------
  const before = await control.evaluate(
    "chrome.storage.session.get('spike.counters').then((r) => r['spike.counters'] ?? {})",
  );
  const s5 = await step(
    'S5 navigate the same tab to a site without access (other.test)',
    () => merchant.s('Page.navigate', { url: site('other.test') }),
    2000,
  );
  const after = await control.evaluate(
    "chrome.storage.session.get('spike.counters').then((r) => r['spike.counters'] ?? {})",
  );
  finding(
    'privacy',
    `site without access: hostname logged=${s5.some((e) => JSON.stringify(e).includes('other.test'))}, counted as invisible load=${(after.completeWithoutUrlAccess ?? 0) > (before.completeWithoutUrlAccess ?? 0)}, visit ended=${has(s5, 'visit:ended')}`,
  );

  // S6 ------------------------------------------------------------------------
  const s6 = await step(
    'S6 history back to the granted site',
    () => merchant.evaluate('history.back()'),
    2500,
  );
  finding(
    'PB-007',
    `returning to the site is a new visit: detected=${has(s6, 'detect:tabs.onUpdated')}, reopened=${has(s6, 'reminder:openPopup-ok') || has(s6, 'reminder:openPopup-error')}`,
  );
  finding(
    'D-009',
    `on history back: content script load=${has(s6, 'detect:content-script:load')}, bfcache restore=${has(s6, 'detect:content-script:bfcache-restore')}`,
  );

  // S7 ------------------------------------------------------------------------
  let bgTab;
  const s7a = await step(
    'S7a background tab opens a granted site (guarded mode)',
    async () => {
      bgTab = await openTab(site('shop.test', '/background'), true);
    },
    2500,
  );
  finding(
    'D-001',
    `background tab, guarded: deferred=${has(s7a, 'reminder:deferred', (d) => d.active === false)}, openPopup called=${s7a.some((e) => e.event.startsWith('reminder:openPopup'))}`,
  );
  const s7b = await step(
    'S7b activate that tab',
    () => cdp.send('Target.activateTarget', { targetId: bgTab.targetId }),
    2500,
  );
  const open7 = s7b.find((e) => e.event.startsWith('reminder:openPopup'));
  finding(
    'D-002',
    `on activation: ${open7 ? `${open7.event} ${JSON.stringify(open7.data)}` : `no attempt (${s7b.map((e) => e.event).join(', ') || 'no events'})`}`,
  );

  // S8 ------------------------------------------------------------------------
  await control.evaluate("chrome.storage.local.set({ 'spike.mode': 'always' })");
  const s8 = await step(
    'S8 background tab with mode=always (unguarded openPopup)',
    async () => {
      await openTab(site('deals.shop.test', '/always'), true);
    },
    2500,
  );
  const open8 = s8.find((e) => e.event.startsWith('reminder:openPopup'));
  finding(
    'D-001',
    `unguarded openPopup for a background tab: ${open8 ? `${open8.event} ${JSON.stringify(open8.data)}` : 'not attempted'}`,
  );
  const popupNow = (await popupTargets()).length;
  finding(
    'D-001',
    `popup targets after the unguarded call: ${popupNow}; popup context: ${JSON.stringify(s8.find((e) => e.event === 'popup:opened')?.data ?? null)}`,
  );
  await control.evaluate("chrome.storage.local.set({ 'spike.mode': 'guarded' })");

  // S9 ------------------------------------------------------------------------
  console.log('\n=== S9 concurrent read-modify-write from three contexts');
  const second = await openTab(ext('popup.html'), true);
  await sleep(500);
  const sw = await attach((await targets()).find((t) => t.type === 'service_worker').targetId);
  const race = (key, locked) => `(async () => {
    const bump = async () => { const v = (await chrome.storage.local.get('${key}'))['${key}'] ?? 0; await chrome.storage.local.set({ '${key}': v + 1 }); };
    const jobs = [];
    for (let i = 0; i < 40; i++) jobs.push(${locked ? "navigator.locks.request('race', bump)" : 'bump()'});
    await Promise.all(jobs);
    return true;
  })()`;
  for (const [key, locked] of [
    ['race.unlocked', false],
    ['race.locked', true],
  ]) {
    await Promise.all([
      control.evaluate(race(key, locked)),
      second.evaluate(race(key, locked)),
      sw.evaluate(race(key, locked)),
    ]);
    const total = await control.evaluate(
      `chrome.storage.local.get('${key}').then((r) => r['${key}'])`,
    );
    finding(
      'D-025',
      `${locked ? 'with a Web Lock' : 'without a lock'}: 120 increments from library tab + popup page + service worker ended at ${total}`,
    );
  }
  seen = (await readLog()).length;

  // S10 -----------------------------------------------------------------------
  console.log('\n=== S10 service worker restart');
  await cdp
    .send('Target.closeTarget', { targetId: sw.targetId })
    .catch((e) => console.log('   closeTarget:', e.message));
  await sleep(1500);
  const alive = (await targets()).some((t) => t.type === 'service_worker');
  finding('S10', `service worker stopped: ${!alive}`);
  const s10 = await step(
    'S10b same-site navigation in the already reminded background tab after the restart',
    () => bgTab.s('Page.navigate', { url: site('shop.test', '/after-restart') }),
    2500,
  );
  finding(
    'S10',
    `worker woke on tabs.onUpdated: ${has(s10, 'detect:tabs.onUpdated')}; visit state survived (skip-same-visit): ${has(s10, 'reminder:skip-same-visit')}; reopened: ${has(s10, 'reminder:openPopup-ok')}`,
  );
  finding(
    'S10',
    `content script still registered after the restart: ${has(s10, 'detect:content-script:load')}`,
  );

  // S11 -----------------------------------------------------------------------
  console.log('\n=== S11 permission request without and with a user gesture');
  const noGesture = await control.evaluate(
    "chrome.permissions.request({ origins: ['*://*.other.test/*'] }).then((g) => 'resolved ' + g, (e) => 'rejected: ' + e.message)",
  );
  finding('D-011', `permissions.request with no user gesture: ${noGesture}`);
  const withGesture = await Promise.race([
    control.evaluate(
      "chrome.permissions.request({ origins: ['*://*.other.test/*'] }).then((g) => 'resolved ' + g, (e) => 'rejected: ' + e.message)",
      true,
    ),
    sleep(4000).then(() => 'still pending after 4 s (a native dialog is waiting for a person)'),
  ]);
  finding('D-032', `permissions.request with a simulated gesture: ${withGesture}`);

  cdp.close();
} catch (error) {
  console.log('\nRUN FAILED:', error);
} finally {
  chrome.kill('SIGKILL');
  server.close();
}

console.log(`\n\n##### FINDINGS (${display}) #####`);
findings.forEach((f) => console.log(f));
process.exit(0);
