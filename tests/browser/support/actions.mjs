// What a person does, and what they see, in PromoBase's pages and in Chrome.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTPUT, sleep } from './browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.PROMOBASE_PYTHON ?? 'python3';

/** The access pattern PromoBase asks for (CLAUDE.md, D-103). */
export const pattern = (domain) => `*://*.${domain}/*`;

/** A saved record; all values are made up. */
export const record = (id, promoCode, domain, notify = false, extra = {}) => ({
  id,
  promoCode,
  notify,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...(domain ? { merchantDomain: domain, resourceUrl: domain } : {}),
  ...extra,
});

export const STATE_KEY = 'promobase.state';

export const saveRecords = (page, records) =>
  page.evaluate(
    `chrome.storage.local.set({ '${STATE_KEY}': ${JSON.stringify({ schemaVersion: 1, records })} })`,
  );

export const storedValue = (page) =>
  page.evaluate(`chrome.storage.local.get('${STATE_KEY}').then((r) => r['${STATE_KEY}'])`);

export const storedRecords = async (page) => (await storedValue(page))?.records ?? [];

export const grantedOrigins = (page) =>
  page.evaluate('chrome.permissions.getAll().then((p) => (p.origins ?? []).sort())');

/** Objects compared by content: chrome.storage hands keys back sorted (D-079). */
export const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort())
      : v,
  );

const NORM = "(t) => (t ?? '').replace(/\\s+/g, ' ').trim()";

/** Visible text of the first element matching `selector`, or null. */
export const text = (page, selector) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    return el && el.checkVisibility() ? (${NORM})(el.innerText) : null;
  })()`);

/** Waits up to `ms` for an element to be visible, then gives its text (null if it never shows). */
export async function waitForText(page, selector, ms = 5000) {
  for (let i = 0; i < ms / 100; i++) {
    const found = await text(page, selector);
    if (found !== null) return found;
    await sleep(100);
  }
  return null;
}

/** Names of the visible buttons and tabs: their label, or their text. */
export const controls = (page) =>
  page.evaluate(`[...document.querySelectorAll('button, [role=tab]')]
    .filter((x) => x.checkVisibility())
    .map((x) => x.getAttribute('aria-label') ?? (${NORM})(x.textContent))`);

/**
 * Clicks a visible button, tab or link by its label or text, with real mouse
 * events. With `prefix`, the text only has to start with `name` (a popup tab
 * carries its count, as in "All codes4").
 */
export async function click(page, name, { prefix = false } = {}) {
  const box = await page.evaluate(`(() => {
    const norm = ${NORM};
    const wanted = ${JSON.stringify(name)};
    const matches = (t) => (${prefix} ? t.startsWith(wanted) : t === wanted);
    const el = [...document.querySelectorAll('button, [role=tab], a')].find((x) => x.checkVisibility()
      && (matches(norm(x.textContent)) || x.getAttribute('aria-label') === wanted));
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) throw new Error(`no visible control "${name}"`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.command('Input.dispatchMouseEvent', {
      type,
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
    });
  }
  await sleep(350);
}

/** Types into the field with this label, replacing what is there, as a person would. */
export async function fill(page, label, value) {
  await page.evaluate(`(() => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
    if (!l) throw new Error('no field labelled ' + ${JSON.stringify(label)});
    const el = document.getElementById(l.htmlFor);
    el.focus();
    el.select();
  })()`);
  await page.command('Input.insertText', { text: value });
  await sleep(120);
}

export const setColourScheme = (page, value) =>
  page.command('Emulation.setEmulatedMedia', {
    features: value ? [{ name: 'prefers-color-scheme', value }] : [],
  });

/** Saves a screenshot of the page under OUTPUT, for a person to look at. */
export async function capture(browser, page, name) {
  await browser.send('Target.activateTarget', { targetId: page.targetId });
  await sleep(250);
  const { data } = await page.command('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUTPUT, { recursive: true });
  const file = join(OUTPUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

// --- The popup -------------------------------------------------------------

/**
 * The toolbar popup is the one target at exactly popup.html: checks that show
 * the popup's page in a tab open it as popup.html?tab (see popupInTab).
 */
const popupTarget = async (browser) =>
  (await browser.targets()).find((t) => t.url === browser.url('popup.html'));

/** The popup's page in a tab of its own, at the popup's width, for layout and accessibility checks. */
export async function popupInTab(browser, { height = 600 } = {}) {
  const page = await browser.open(browser.url('popup.html?tab'));
  await page.command('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.command('Page.reload', {});
  await sleep(900);
  return page;
}

/** Waits up to `ms` for PromoBase's toolbar popup; undefined if it does not open. */
export async function waitForPopup(browser, ms = 3000) {
  for (let i = 0; i < ms / 100; i++) {
    const target = await popupTarget(browser);
    if (target) {
      await sleep(1000);
      return browser.attach(target.targetId);
    }
    await sleep(100);
  }
  return undefined;
}

export async function closePopup(browser) {
  const target = await popupTarget(browser);
  if (target) {
    try {
      await browser.send('Target.closeTarget', { targetId: target.targetId });
    } catch {
      // Closed by itself.
    }
  }
  await sleep(400);
}

/**
 * The first openPopup of a browser session is slow in Chrome for Testing
 * (about 9 s, then about 55 ms), which would read as "no popup". One call
 * at the start keeps the timing checks honest.
 */
export async function warmUpPopup(browser) {
  const worker = await browser.worker();
  try {
    await worker.evaluate('chrome.action.openPopup()');
  } catch {
    // No focused window yet: nothing to warm up.
  }
  await sleep(300);
  await closePopup(browser);
}

/** The popup's open tab, the codes it lists and its visible controls. */
export const popupView = async (popup) => ({
  ...(await popup.evaluate(`(() => {
    const norm = ${NORM};
    const panel = [...document.querySelectorAll('[role=tabpanel]')].find((x) => x.checkVisibility());
    return {
      tab: norm(document.querySelector('[role=tab][aria-selected=true]')?.textContent),
      codes: panel ? [...panel.querySelectorAll('.code-card code')].filter((c) => c.checkVisibility()).map((c) => c.textContent) : [],
      text: norm(panel?.innerText),
    };
  })()`)),
  controls: await controls(popup),
});

/** Clears when each site was last reminded, so the next visit counts as new (D-004). */
export const forgetReminders = (page) =>
  page.evaluate(`chrome.storage.session.get('promobase.reminders').then(async (r) => {
    const state = r['promobase.reminders'] ?? { tabs: {}, shownAt: {}, restoring: [] };
    state.shownAt = {};
    await chrome.storage.session.set({ 'promobase.reminders': state });
  })`);

// --- Chrome's own UI, through X -------------------------------------------

const x11 = (...args) => execFileSync(PYTHON, [join(HERE, 'x11.py'), ...args.map(String)]);

/** Presses a key in whatever has the focus: used to answer Chrome's permission dialog. */
export const pressKey = (name) => x11('key', name);

/** Answers Chrome's open permission dialog with Allow, the way a keyboard user would. */
export async function allowInChromeDialog() {
  await sleep(1500);
  pressKey('Tab');
  await sleep(150);
  pressKey('Return');
  await sleep(1300);
}

/**
 * Where PromoBase's yellow toolbar icon is, and how much yellow there is:
 * a few pixels for the plain icon's ticket, many for the highlighted one.
 */
export function toolbarIcon(name) {
  mkdirSync(OUTPUT, { recursive: true });
  const file = join(OUTPUT, `${name}.png`);
  x11('grab', file);
  const out = execFileSync(PYTHON, [
    '-c',
    `import sys
from PIL import Image
image = Image.open(sys.argv[1]).convert('RGB')
width = image.size[0]
xs, ys = [], []
# Chrome's toolbar row only: the tab strip above it shows PromoBase's own
# favicon on library tabs, which has the same yellow.
for y in range(42, 86):
    for x in range(width):
        r, g, b = image.getpixel((x, y))
        if r > 235 and 200 < g < 235 and b < 90:
            xs.append(x)
            ys.append(y)
print(len(xs), sum(xs) // len(xs) if xs else -1, sum(ys) // len(ys) if ys else -1)`,
    file,
  ])
    .toString()
    .trim()
    .split(' ')
    .map(Number);
  return { yellow: out[0], x: out[1], y: out[2] };
}

/** Clicks the screen at x, y: PromoBase's toolbar button, found by toolbarIcon. */
export const clickScreen = (x, y) => x11('click', x, y);

// --- Accessibility ---------------------------------------------------------

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** axe-core's violations on the page as it is now, as "rule: element" lines. */
export async function accessibilityViolations(page) {
  await page.evaluate(AXE);
  return page.evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } })
    .then((r) => r.violations.flatMap((v) => v.nodes.map((n) => v.id + ': ' + n.target.join(' '))))`);
}
