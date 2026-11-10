// Export and import (D-106 to D-109): the files PromoBase writes, the files it
// accepts, and what an import reports.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeWelcome, launch, OUTPUT, sleep } from './support/browser.mjs';
import {
  allowInChromeDialog,
  canonical,
  click,
  grantedOrigins,
  pattern,
  record,
  saveRecords,
  storedRecords,
  storedValue,
  text,
  waitForText,
} from './support/actions.mjs';

const DOWNLOADS = join(OUTPUT, 'downloads');
const FILES = join(OUTPUT, 'import-files');
const exportFile = (records, extra = {}) =>
  JSON.stringify(
    {
      format: 'promobase-export',
      schemaVersion: 1,
      exportedAt: '2026-11-09T16:36:32.921Z',
      records,
      ...extra,
    },
    null,
    2,
  );

async function downloaded(count = 1) {
  for (let i = 0; i < 50; i++) {
    const files = readdirSync(DOWNLOADS).filter((f) => f.endsWith('.json'));
    if (files.length >= count) return files.sort();
    await sleep(100);
  }
  return readdirSync(DOWNLOADS);
}

describe('export and import', () => {
  let browser;
  let library;
  const choose = async (name) => {
    const { root } = await library.command('DOM.getDocument', {});
    const { nodeId } = await library.command('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'input[type=file]',
    });
    await library.command('DOM.setFileInputFiles', { nodeId, files: [join(FILES, name)] });
    await sleep(900);
  };
  before(async () => {
    for (const dir of [DOWNLOADS, FILES]) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(
      join(FILES, 'backup.json'),
      exportFile([
        record('a', 'SAVE10', 'shop.test', true),
        record('b', 'TFP10', 'coffee.test', true),
        record('c', 'NOSITE'),
        record('d', 'KEEP', 'kept.test'),
      ]),
    );
    writeFileSync(join(FILES, 'not-json.json'), 'hello');
    writeFileSync(
      join(FILES, 'bad-record.json'),
      exportFile([
        record('x', 'OK', 'ok.test'),
        { ...record('y', 'BAD', 'ok.test'), expiryDate: '31.12.2026' },
      ]),
    );
    writeFileSync(join(FILES, 'newer.json'), exportFile([], { schemaVersion: 2 }));
    browser = await launch();
    await closeWelcome(browser);
    await browser.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS,
    });
    library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
  });
  after(() => browser?.close());

  it('an empty library offers Import but not Export', async () => {
    const buttons = await library.evaluate(
      "[...document.querySelectorAll('button')].filter((x) => x.checkVisibility()).map((x) => x.textContent.trim())",
    );
    assert.ok(buttons.includes('Import'));
    assert.ok(!buttons.includes('Export'));
  });

  it('Export writes every code in stored order, fields in a fixed order, text intact', async () => {
    const records = [
      {
        updatedAt: '2026-11-02T09:00:00.000Z',
        createdAt: '2026-11-01T09:00:00.000Z',
        notify: false,
        note: 'Rabatt für Kaffee ☕',
        expiryDate: '2027-01-31',
        merchantDomain: 'shop.test',
        resourceUrl: 'https://www.shop.test/coffee',
        promoCode: 'TFP10',
        id: 'a',
      },
      record('b', 'NOSITE'),
    ];
    await saveRecords(library, records);
    await sleep(700);
    const before = await storedValue(library);
    await click(library, 'Export');
    const [file] = await downloaded();
    assert.match(file, /^promobase-codes-\d{4}-\d\d-\d\d-\d\d-\d\d\.json$/);
    const document = JSON.parse(readFileSync(join(DOWNLOADS, file), 'utf8'));
    assert.equal(document.format, 'promobase-export');
    assert.equal(document.schemaVersion, 1);
    assert.deepEqual(
      document.records.map((r) => Object.keys(r)),
      [
        [
          'id',
          'promoCode',
          'resourceUrl',
          'merchantDomain',
          'expiryDate',
          'note',
          'notify',
          'createdAt',
          'updatedAt',
        ],
        ['id', 'promoCode', 'notify', 'createdAt', 'updatedAt'],
      ],
    );
    assert.equal(document.records[0].note, 'Rabatt für Kaffee ☕');
    assert.equal(await text(library, '.library__notice'), 'Exported 2 codes.');
    assert.equal(canonical(await storedValue(library)), canonical(before), 'saved data unchanged');
  });

  it('refuses files it cannot use, whole, with a clear message', async () => {
    await saveRecords(library, [
      record('d', 'KEEP', 'kept.test', false, { note: 'saved version' }),
      record('e', 'save10', 'shop.test'),
    ]);
    await sleep(700);
    for (const [name, message] of [
      ['not-json.json', 'This file is not a PromoBase export.'],
      ['newer.json', 'This file was made by a newer version'],
      ['bad-record.json', 'Code 2 in this file cannot be read, so nothing was imported.'],
    ]) {
      await choose(name);
      assert.ok((await text(library, '.problem')).startsWith(message), name);
      assert.equal((await storedRecords(library)).length, 2, name);
    }
  });

  it('an import adds new codes, keeps saved ones, and reports what it skipped or flagged', async () => {
    await choose('backup.json');
    const report = await text(library, '.library__report');
    assert.ok(report.startsWith('Added 3 codes.'), report);
    assert.ok(
      report.includes(
        "1 code already saved here, so the saved one was kept and the file's skipped: KEEP (kept.test).",
      ),
      report,
    );
    assert.ok(
      report.includes(
        '1 code added that matches a code already saved for the same site: SAVE10 (shop.test).',
      ),
      report,
    );
    const after = await storedRecords(library);
    assert.deepEqual(
      after.map((r) => r.id),
      ['d', 'e', 'a', 'b', 'c'],
    );
    assert.equal(after[0].note, 'saved version');
    const notify = Object.fromEntries(after.map((r) => [r.promoCode, r.notify]));
    assert.deepEqual(
      notify,
      { KEEP: false, save10: false, SAVE10: false, TFP10: true, NOSITE: false },
      'D-100',
    );
  });

  it('the report stays until dismissed, and the same file again adds nothing', async () => {
    await sleep(11000);
    assert.ok(await text(library, '.library__report'), 'gone by itself');
    await click(library, 'Dismiss');
    assert.equal(await text(library, '.library__report'), null);
    await choose('backup.json');
    assert.ok((await text(library, '.library__report')).startsWith('No codes were added.'));
    assert.equal((await storedRecords(library)).length, 5);
  });

  it('two sites waiting for access get one notice, and one Chrome dialog for both (D-109)', async () => {
    await library.evaluate(`chrome.storage.local.get('promobase.state').then((r) => {
      const state = r['promobase.state'];
      state.records.forEach((x) => { if (x.merchantDomain === 'shop.test') x.notify = true; });
      return chrome.storage.local.set({ 'promobase.state': state });
    })`);
    await sleep(800);
    const waiting = await text(library, '.library__waiting');
    assert.ok(
      waiting.includes('Reminders are on for 2 sites') &&
        waiting.includes('coffee.test, shop.test'),
      waiting,
    );
    await click(library, 'Allow access for 2 sites');
    await allowInChromeDialog();
    assert.deepEqual(await grantedOrigins(library), [pattern('coffee.test'), pattern('shop.test')]);
    assert.equal(await text(library, '.library__waiting'), null);
  });

  it('an export imports whole into an empty library', async () => {
    rmSync(DOWNLOADS, { recursive: true, force: true });
    mkdirSync(DOWNLOADS, { recursive: true });
    await click(library, 'Export');
    const [file] = await downloaded();
    writeFileSync(join(FILES, 'round-trip.json'), readFileSync(join(DOWNLOADS, file)));
    await library.evaluate('chrome.storage.local.clear()');
    await sleep(800);
    await choose('round-trip.json');
    assert.equal((await storedRecords(library)).length, 5);
    assert.ok((await text(library, '.library__report')).startsWith('Added 5 codes.'));
  });

  it('nothing was logged as an error or warning', () => {
    assert.deepEqual(browser.errors, []);
  });
});
