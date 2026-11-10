// First launch (PB-001, D-113): the welcome opens once, says what PromoBase
// does, and asks to pin it only while it is not on the toolbar.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { launch, sleep } from './support/browser.mjs';
import { record, saveRecords, text, waitForText } from './support/actions.mjs';

const libraryTabs = async (browser) =>
  (await browser.targets()).filter(
    (t) => t.type === 'page' && t.url === browser.url('library.html'),
  );

describe('first launch', () => {
  let browser;
  after(() => browser?.close());

  it('installing opens the library in one new tab, with the welcome', async () => {
    browser = await launch({ pinned: false });
    await sleep(1000);
    const tabs = await libraryTabs(browser);
    assert.equal(tabs.length, 1);
    const library = await browser.attach(tabs[0].targetId);
    const welcome = await waitForText(library, '.library__empty');
    assert.match(welcome, /^Welcome to PromoBase/);
    assert.match(welcome, /Add your first code/);
    assert.match(welcome, /PromoBase does not check whether a code works/);
  });

  it('asks to pin PromoBase while it is not on the toolbar', async () => {
    const [tab] = await libraryTabs(browser);
    const library = await browser.attach(tab.targetId);
    assert.ok(await waitForText(library, '.library__pin'));
  });

  it('a reload of the extension is an update: no second welcome', async () => {
    const worker = await browser.worker();
    await worker.command('Runtime.evaluate', { expression: 'chrome.runtime.reload()' });
    await sleep(3000);
    assert.equal((await libraryTabs(browser)).length, 0);
  });
});

describe('first launch, pinned', () => {
  let browser;
  after(() => browser?.close());

  it('the welcome has no pin hint once PromoBase is on the toolbar', async () => {
    browser = await launch();
    const library = await browser.open(browser.url('library.html'));
    assert.match(await waitForText(library, '.library__empty'), /^Welcome to PromoBase/);
    // Whether PromoBase is pinned is read after the first render: give it time to show up if it would.
    await sleep(1500);
    assert.equal(await text(library, '.library__pin'), null);
  });

  it('with codes saved, About still says PromoBase does not check codes', async () => {
    const library = await browser.open(browser.url('library.html'));
    await saveRecords(library, [record('a', 'AUTUMN15', 'larkspur.example')]);
    await sleep(700);
    assert.match(await text(library, '.library__about'), /does not check whether a code works/);
  });
});
