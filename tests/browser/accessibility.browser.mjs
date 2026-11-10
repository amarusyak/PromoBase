// axe-core in every main state of the library and the popup, light and dark
// (PRD 7.2, D-115), and the popup's height limit (D-084, D-095, D-107).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closeWelcome, launch, sleep } from './support/browser.mjs';
import {
  accessibilityViolations,
  click,
  fill,
  popupInTab,
  record,
  saveRecords,
  setColourScheme,
  waitForText,
} from './support/actions.mjs';

const RECORDS = [
  record('a', 'SAVE10', 'shop.test', true, { note: '10% off the next order' }),
  record('b', 'LATER', 'shop.test', true, { startDate: '2099-01-01' }),
  record('c', 'OLD', 'old.test', false, { expiryDate: '2020-01-01', note: 'Spring sale' }),
  record('d', 'NOSITE'),
];

for (const scheme of ['light', 'dark']) {
  describe(`accessibility, ${scheme}`, () => {
    let browser;
    let library;
    before(async () => {
      browser = await launch();
      await closeWelcome(browser);
      library = await browser.open(browser.url('library.html'));
      await waitForText(library, 'main');
      await setColourScheme(library, scheme);
      await sleep(400);
    });
    after(() => browser?.close());

    it('library: the welcome', async () => {
      assert.deepEqual(await accessibilityViolations(library), []);
    });

    it('library: codes in every group, reminders on and waiting for access', async () => {
      await saveRecords(library, RECORDS);
      await sleep(800);
      assert.equal(await library.evaluate("document.querySelectorAll('.code-ticket').length"), 4);
      assert.deepEqual(await accessibilityViolations(library), []);
    });

    it('library: the add dialog with an error', async () => {
      await click(library, 'Add a code');
      await click(library, 'Save code');
      assert.deepEqual(await accessibilityViolations(library), []);
      await click(library, 'Cancel');
    });

    it('library: a delete question and a reminder explanation open', async () => {
      await click(library, 'Delete OLD');
      await click(library, 'Remind me on old.test');
      assert.deepEqual(await accessibilityViolations(library), []);
    });

    for (const tab of ['Add', 'This site', 'All codes']) {
      it(`popup: ${tab}`, async () => {
        const popup = await popupInTab(browser);
        await setColourScheme(popup, scheme);
        await click(popup, tab, { prefix: true });
        assert.deepEqual(await accessibilityViolations(popup), []);
        await browser.send('Target.closeTarget', { targetId: popup.targetId });
      });
    }

    it('popup: Add with an error', async () => {
      const popup = await popupInTab(browser);
      await setColourScheme(popup, scheme);
      await click(popup, 'Save code');
      assert.deepEqual(await accessibilityViolations(popup), []);
      await browser.send('Target.closeTarget', { targetId: popup.targetId });
    });
  });
}

describe("the popup stays under Chrome's 600px limit (D-084, D-095)", () => {
  let browser;
  before(async () => {
    browser = await launch();
    await closeWelcome(browser);
    const library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
    await saveRecords(library, RECORDS);
    await sleep(600);
  });
  after(() => browser?.close());

  const height = (popup) =>
    popup.evaluate(`(() => {
      const main = document.querySelector('main');
      const panel = [...document.querySelectorAll('[role=tabpanel]')].find((x) => x.checkVisibility());
      main.style.maxHeight = 'none';
      panel.style.overflow = 'visible';
      const value = Math.ceil(main.getBoundingClientRect().height);
      main.style.maxHeight = '';
      panel.style.overflow = '';
      return value;
    })()`);

  it('Add, empty and with a duplicate warning and the site line', async () => {
    const popup = await popupInTab(browser, { height: 900 });
    const empty = await height(popup);
    await fill(popup, 'Promo code', 'save10');
    await fill(popup, 'Website or link', 'shop.test');
    await sleep(300);
    const duplicate = await height(popup);
    assert.ok(empty <= 600, `empty: ${empty}px`);
    assert.ok(duplicate <= 600, `duplicate warning: ${duplicate}px`);
  });
});
