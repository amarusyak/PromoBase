// Saving, editing and deleting codes through the interface (PB-003, PB-004,
// PB-009 to PB-011), the way a person does it: typing and clicking.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closeWelcome, launch, sleep } from './support/browser.mjs';
import {
  click,
  controls,
  fill,
  popupInTab,
  popupView,
  record,
  saveRecords,
  storedRecords,
  text,
  waitForText,
} from './support/actions.mjs';

const dialogOpen = (page) => page.evaluate("document.querySelector('dialog')?.open === true");

describe('codes in the library', () => {
  let browser;
  let library;
  before(async () => {
    browser = await launch();
    await closeWelcome(browser);
    library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
  });
  after(() => browser?.close());

  it('a code without its text is not saved, and the field says why (PB-004)', async () => {
    await click(library, 'Add your first code');
    assert.ok(await dialogOpen(library));
    await click(library, 'Save code');
    assert.equal(await text(library, 'dialog .field__error'), 'Enter the promo code.');
    assert.deepEqual(await storedRecords(library), []);
  });

  it('a code with its site, expiry and note is saved and listed under Active', async () => {
    await fill(library, 'Promo code', '  AUTUMN15 ');
    await fill(library, 'Website or link', 'https://www.larkspur.example/bikes');
    await fill(library, 'Expires', '31122099');
    await fill(library, 'Note', 'From a cycling channel');
    await click(library, 'Save code');
    await sleep(500);
    assert.equal(await dialogOpen(library), false);
    const [saved] = await storedRecords(library);
    assert.equal(saved.promoCode, 'AUTUMN15');
    assert.equal(saved.merchantDomain, 'larkspur.example');
    assert.equal(saved.expiryDate, '2099-12-31');
    assert.equal(saved.note, 'From a cycling channel');
    const list = await text(library, '.library__list');
    assert.match(list, /^Active 1/);
    assert.match(list, /larkspur\.example/);
    assert.match(list, /Expires 31\.12\.2099/);
    assert.equal(await text(library, '.library__notice'), 'Saved AUTUMN15.');
    assert.match(await text(library, '.library__bar'), /1 of 100 codes saved/);
  });

  it('an edit keeps the code itself and changes what was edited (PB-010)', async () => {
    const [before] = await storedRecords(library);
    await click(library, 'Edit AUTUMN15');
    await fill(library, 'Note', 'Bikes and kit');
    await click(library, 'Save changes');
    await sleep(500);
    const [after] = await storedRecords(library);
    assert.equal(after.id, before.id);
    assert.equal(after.createdAt, before.createdAt);
    assert.equal(after.note, 'Bikes and kit');
    assert.notEqual(after.updatedAt, before.updatedAt);
  });

  it('delete asks first, with Keep focused, and Keep keeps the code (PB-011)', async () => {
    await click(library, 'Delete AUTUMN15');
    assert.equal(
      await text(library, '[role=group][aria-label="Delete AUTUMN15?"] span'),
      'Delete this code?',
    );
    assert.equal(await library.evaluate('document.activeElement.textContent.trim()'), 'Keep');
    await click(library, 'Keep');
    assert.equal((await storedRecords(library)).length, 1);
  });

  it('confirming the delete removes the code', async () => {
    await click(library, 'Delete AUTUMN15');
    await click(library, 'Delete');
    await sleep(600);
    assert.deepEqual(await storedRecords(library), []);
    assert.equal(await text(library, '.library__notice'), 'Deleted AUTUMN15.');
  });

  it('at 100 codes, Add is off and says why; deleting one frees a place (PB-003)', async () => {
    const hundred = Array.from({ length: 100 }, (_, i) => record(`r${i}`, `CODE${i}`));
    await saveRecords(library, hundred);
    await sleep(800);
    assert.equal(
      await library.evaluate(
        "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add a code').disabled",
      ),
      true,
    );
    assert.match(await text(library, '.library__bar'), /100 of 100 codes saved/);
    assert.match(
      await text(library, 'main'),
      /You have saved 100 codes, which is the most PromoBase keeps/,
    );
    await click(library, 'Delete CODE0');
    await click(library, 'Delete');
    await sleep(600);
    assert.equal(
      await library.evaluate(
        "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add a code').disabled",
      ),
      false,
    );
  });
});

describe('a code saved from the popup', () => {
  let browser;
  before(async () => {
    browser = await launch();
    await closeWelcome(browser);
  });
  after(() => browser?.close());

  it('opens on Add, cursor in the code field, and saves to the library (D-081)', async () => {
    const popup = await popupInTab(browser);
    assert.match((await popupView(popup)).tab, /^Add/);
    assert.equal(
      await popup.evaluate('document.activeElement.labels?.[0]?.textContent.trim()'),
      'Promo code',
    );
    await fill(popup, 'Promo code', 'BREW10');
    await fill(popup, 'Website or link', 'fernhill-coffee.example');
    await click(popup, 'Save code');
    await sleep(500);
    assert.match((await popupView(popup)).text, /Code saved/);
    assert.ok((await controls(popup)).includes('Add another'));
    const library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
    assert.match(await text(library, '.library__list'), /fernhill-coffee\.example/);
  });
});
