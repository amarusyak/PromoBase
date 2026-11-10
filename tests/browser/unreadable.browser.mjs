// Saved codes this build cannot read (D-042, D-124): reported, offered as a
// copy, never changed.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeWelcome, launch, OUTPUT, sleep } from './support/browser.mjs';
import {
  canonical,
  click,
  controls,
  popupInTab,
  record,
  STATE_KEY,
  storedValue,
  text,
  waitForText,
} from './support/actions.mjs';

const DOWNLOADS = join(OUTPUT, 'saved-data');

const CASES = [
  {
    name: 'damaged data',
    value: {
      schemaVersion: 1,
      records: [
        record('a', 'AUTUMN15', 'larkspur.example'),
        { id: 'b', promoCode: 'BROKEN', notify: 'yes' },
      ],
      extra: { kept: true },
    },
    message: /could not read your saved codes, so it has left them exactly as they are/,
    report: true,
  },
  {
    name: 'a newer layout',
    value: { schemaVersion: 7, records: 'a shape this build does not know' },
    message: /written by a newer version of PromoBase.*come back with that version/,
    report: false,
  },
];

for (const { name, value, message, report } of CASES) {
  describe(`saved codes that cannot be read: ${name}`, () => {
    let browser;
    let library;
    before(async () => {
      rmSync(DOWNLOADS, { recursive: true, force: true });
      mkdirSync(DOWNLOADS, { recursive: true });
      browser = await launch();
      await closeWelcome(browser);
      await browser.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: DOWNLOADS,
      });
      library = await browser.open(browser.url('library.html'));
      await waitForText(library, 'main');
      await library.evaluate(
        `chrome.storage.local.set({ '${STATE_KEY}': ${JSON.stringify(value)} })`,
      );
      await sleep(800);
    });
    after(() => browser?.close());

    it('the library says what happened and offers only a copy', async () => {
      assert.match(await text(library, '.library__unreadable'), message);
      const buttons = await controls(library);
      assert.deepEqual(buttons, ['Save a copy of your saved codes']);
      const links = await library.evaluate(
        "[...document.querySelectorAll('.library__unreadable a')].map((a) => a.href)",
      );
      assert.deepEqual(links, report ? ['https://github.com/amarusyak/PromoBase/issues'] : []);
      assert.ok(
        !(await text(library, '.library__about')).includes('Export'),
        'About still points to Export',
      );
    });

    it('the copy is the stored value exactly, and storage is unchanged', async () => {
      await click(library, 'Save a copy of your saved codes');
      let files = [];
      for (let i = 0; i < 50 && files.length === 0; i++) {
        await sleep(100);
        files = readdirSync(DOWNLOADS).filter((f) => f.endsWith('.json'));
      }
      assert.equal(files.length, 1);
      assert.match(files[0], /^promobase-saved-data-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
      const copy = JSON.parse(readFileSync(join(DOWNLOADS, files[0]), 'utf8'));
      assert.equal(canonical(copy), canonical(value));
      assert.equal(canonical(await storedValue(library)), canonical(value));
      assert.equal(
        await text(library, '.library__unreadable [role=status]'),
        'Chrome is downloading a copy. Your saved codes are unchanged.',
      );
    });

    it('the popup says the same and points to the library', async () => {
      const popup = await popupInTab(browser);
      const links = await popup.evaluate(
        "[...document.querySelectorAll('a')].filter((a) => a.checkVisibility()).map((a) => a.textContent.trim())",
      );
      assert.ok(links.includes('Open the library to save a copy'), links.join(', '));
      assert.ok(!(await text(popup, 'main')).includes('Keep a copy with Export'));
    });

    it('readable data brings everything back', async () => {
      await library.evaluate(
        `chrome.storage.local.set({ '${STATE_KEY}': { schemaVersion: 1, records: [] } })`,
      );
      await sleep(800);
      assert.ok((await controls(library)).includes('Import'));
      assert.match(
        await text(library, '.library__about'),
        /Keep a copy with Export in the library\./,
      );
    });
  });
}
