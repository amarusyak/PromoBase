// Makes the Chrome Web Store screenshots (D-117) from the built extension:
//
//   xvfb-run -a -s "-screen 0 2800x2000x24" npm run screenshots
//
// It drives PromoBase like the browser checks do, with made-up shops on the
// reserved .example domain, then frames the captures with
// tools/compose-store-screenshots.py. The results land in
// browser-output/store/, for a person to look at and commit to store/.
// Needs PROMOBASE_CHROME (see tests/browser/README.md), Python with Pillow,
// and the Inter fonts; system-ui is mapped to Inter by
// tools/screenshot-fonts.conf so the pages look the same on any machine.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeWelcome, launch, OUTPUT, sleep } from '../tests/browser/support/browser.mjs';
import {
  allowInChromeDialog,
  fill,
  pattern,
  record,
  saveRecords,
  setColourScheme,
  waitForPopup,
  waitForText,
  warmUpPopup,
} from '../tests/browser/support/actions.mjs';
import { startSite } from '../tests/browser/support/site.mjs';

const RAW = join(OUTPUT, 'store-raw');
const STORE = join(OUTPUT, 'store');
const PYTHON = process.env.PROMOBASE_PYTHON ?? 'python3';

const RECORDS = [
  record('r1', 'AUTUMN15', 'larkspur.example', true, {
    expiryDate: '2099-11-30',
    note: '15% off kit, from a cycling channel',
  }),
  record('r2', 'FREESHIP', 'larkspur.example', true, { note: 'Free delivery on orders over 40' }),
  record('r3', 'WINTER20', 'larkspur.example', true, {
    startDate: '2099-12-01',
    expiryDate: '2100-01-15',
  }),
  record('r4', 'BREW10', 'fernhill-coffee.example', false, {
    expiryDate: '2099-01-31',
    note: 'First bag of beans',
  }),
  record('r5', 'TRAIL25', 'northpeak.example', true, {
    note: 'Boots and packs, from a hiking newsletter',
  }),
  record('r6', 'READMORE', 'quillbooks.example', false, {
    expiryDate: '2020-10-31',
    note: 'Paperbacks only',
  }),
  record('r7', 'BIRTHDAY5', undefined, false, { note: 'Show at the till in the town shop' }),
];

async function save(page, name) {
  const { data } = await page.command('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(RAW, `${name}.png`), Buffer.from(data, 'base64'));
}

for (const dir of [RAW, STORE]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
const site = await startSite();
// Twice the pixels, so the popup stays sharp when framed; the library is
// captured at exactly 1280 x 800 through an override.
const browser = await launch({ args: ['--force-device-scale-factor=2'] });
try {
  await closeWelcome(browser);
  const library = await browser.open(browser.url('library.html'));
  await waitForText(library, 'main');
  await saveRecords(library, RECORDS);
  await sleep(800);
  await library.command('Runtime.evaluate', {
    expression: `chrome.permissions.request({ origins: ['${pattern('larkspur.example')}', '${pattern('northpeak.example')}'] })`,
    userGesture: true,
    awaitPromise: false,
  });
  await allowInChromeDialog();

  await library.command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const scheme of ['light', 'dark']) {
    await browser.send('Target.activateTarget', { targetId: library.targetId });
    await setColourScheme(library, scheme);
    await sleep(500);
    await save(library, `library-${scheme}`);
  }
  await setColourScheme(library, undefined);

  await warmUpPopup(browser);
  await browser.open(site.url('www.larkspur.example', '/bikes'));
  const reminder = await waitForPopup(browser, 15000);
  if (!reminder) throw new Error('the reminder popup did not open');
  await save(reminder, 'popup-reminder');

  const add = await browser.open(browser.url('popup.html?tab'));
  await add.command('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 600,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await add.command('Page.reload', {});
  await waitForText(add, 'main');
  await fill(add, 'Promo code', 'CRISP20');
  await fill(add, 'Website or link', 'https://www.orchardbakery.example/cakes');
  await fill(add, 'Note', 'From a baking video, 20% off cakes');
  await add.evaluate('document.activeElement?.blur()');
  await sleep(400);
  await browser.send('Target.activateTarget', { targetId: add.targetId });
  await save(add, 'popup-add');
} finally {
  await browser.close();
  await site.close();
}
execFileSync(PYTHON, ['tools/compose-store-screenshots.py', RAW, STORE], { stdio: 'inherit' });
console.log(`Store screenshots in ${STORE}`);
