// Drives the built extension in a real, headed Chrome for Testing over the
// DevTools protocol (D-054, D-088). No test framework of its own: the checks
// use node:test. Chrome comes from PROMOBASE_CHROME, which must be Chrome for
// Testing or Chromium: branded Chrome no longer loads an unpacked extension
// from the command line. On Linux the checks run under a virtual display
// (xvfb-run), because Chrome's permission dialog and the toolbar icon only
// exist in a headed browser.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The unpacked extension under test: dist/, or PROMOBASE_DIST. */
export const EXTENSION = resolve(process.env.PROMOBASE_DIST ?? 'dist');

/** Where checks write screenshots and downloads: browser-output/, or PROMOBASE_OUTPUT. */
export const OUTPUT = resolve(process.env.PROMOBASE_OUTPUT ?? 'browser-output');

function chromePath() {
  const path = process.env.PROMOBASE_CHROME;
  if (!path) {
    throw new Error(
      'Set PROMOBASE_CHROME to a Chrome for Testing or Chromium binary (see tests/browser/README.md).',
    );
  }
  if (!existsSync(path)) throw new Error(`PROMOBASE_CHROME does not exist: ${path}`);
  return path;
}

let nextPort = 9640 + (process.pid % 200) * 10;

/**
 * Starts Chrome with the extension and a profile of its own, and waits for the
 * service worker. With `pinned`, PromoBase's button is on the toolbar.
 */
export async function launch({ pinned = true, profile, args = [] } = {}) {
  if (!existsSync(join(EXTENSION, 'manifest.json'))) {
    throw new Error(`No built extension in ${EXTENSION}: run npm run build first.`);
  }
  const userDataDir = profile ?? mkdtempSync(join(tmpdir(), 'promobase-profile-'));
  if (pinned && profile === undefined) await pin(userDataDir);
  const browser = await start(userDataDir, args);
  browser.ownsProfile = profile === undefined;
  return browser;
}

/** A first run creates the profile and tells us the extension's id; then it is pinned. */
async function pin(userDataDir) {
  const first = await start(userDataDir, []);
  const { extId } = first;
  await first.close({ keepProfile: true });
  const path = join(userDataDir, 'Default', 'Preferences');
  const prefs = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  prefs.extensions = { ...(prefs.extensions ?? {}), pinned_extensions: [extId] };
  writeFileSync(path, JSON.stringify(prefs));
}

async function start(userDataDir, args) {
  const port = nextPort++;
  const chrome = spawn(
    chromePath(),
    [
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-proxy-server',
      '--window-size=1000,760',
      '--window-position=0,0',
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${port}`,
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      // Every host name goes to the local test site (support/site.mjs).
      '--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost',
      ...args,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json())
        .webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  if (!wsUrl) {
    chrome.kill('SIGKILL');
    throw new Error('Chrome did not start');
  }
  const socket = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  /** Errors and warnings logged by PromoBase's pages, popup and worker. */
  const errors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { done, fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(message.error.message));
      else done(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      errors.push(details.exception?.description ?? details.text);
    } else if (
      message.method === 'Runtime.consoleAPICalled' &&
      (message.params.type === 'error' || message.params.type === 'warning')
    ) {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
  });
  await new Promise((done) => socket.addEventListener('open', done));
  const send = (method, params = {}, sessionId) => {
    const callId = id++;
    socket.send(
      JSON.stringify({ id: callId, method, params, ...(sessionId ? { sessionId } : {}) }),
    );
    return new Promise((done, fail) => pending.set(callId, { done, fail }));
  };
  const targets = async () => (await send('Target.getTargets')).targetInfos;

  const findWorker = async () => {
    for (let i = 0; i < 60; i++) {
      const worker = (await targets()).find(
        (t) => t.type === 'service_worker' && t.url.endsWith('/service-worker.js'),
      );
      if (worker) return worker;
      await sleep(200);
    }
    throw new Error('the extension did not load');
  };
  const worker = await findWorker();
  const extId = new URL(worker.url).host;

  /** A page or worker to evaluate in and send commands to. */
  const attach = async (targetId) => {
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    await command('Runtime.enable');
    const evaluate = async (expression, { gesture = false } = {}) => {
      const result = await command('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: gesture,
      });
      if (result.exceptionDetails) {
        const details = result.exceptionDetails;
        throw new Error(details.exception?.description ?? details.text);
      }
      return result.result.value;
    };
    return { targetId, sessionId, command, evaluate };
  };

  const browser = {
    extId,
    errors,
    send,
    targets,
    attach,
    url: (page) => `chrome-extension://${extId}/${page}`,
    /** Opens a tab, in front unless `background`, and waits for it to load. */
    async open(url, { background = false } = {}) {
      const { targetId } = await send('Target.createTarget', { url, background });
      if (!background) await send('Target.activateTarget', { targetId });
      const page = await attach(targetId);
      for (let i = 0; i < 50; i++) {
        try {
          if (
            await page.evaluate(
              "document.readyState === 'complete' && location.href !== 'about:blank'",
            )
          ) {
            break;
          }
        } catch {
          // Still navigating.
        }
        await sleep(100);
      }
      return page;
    },
    /** The service worker, started again if Chrome has stopped it. */
    async worker() {
      return attach((await findWorker()).targetId);
    },
    async close({ keepProfile = false } = {}) {
      try {
        await send('Browser.close');
      } catch {
        // Already gone.
      }
      await sleep(1000);
      chrome.kill('SIGKILL');
      if (!keepProfile && browser.ownsProfile)
        rmSync(userDataDir, { recursive: true, force: true });
    },
  };
  // The window is drawn a moment after Chrome answers; checks that read the
  // screen (toolbar icon, permission dialog) need it on screen first.
  await sleep(1500);
  return browser;
}

/**
 * Closes the welcome tab that every install opens (PB-001), for checks about
 * something else. Another tab is brought to the front first: closing the tab
 * in front through DevTools leaves the window undrawn on a virtual display
 * without a window manager, and then the toolbar cannot be read.
 */
export async function closeWelcome(browser) {
  const pages = (await browser.targets()).filter((t) => t.type === 'page');
  const welcome = pages.filter((t) => t.url === browser.url('library.html'));
  const other = pages.find((t) => t.url !== browser.url('library.html'));
  if (other) await browser.send('Target.activateTarget', { targetId: other.targetId });
  for (const t of welcome) await browser.send('Target.closeTarget', { targetId: t.targetId });
  await sleep(500);
}
