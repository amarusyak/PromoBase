// What allowing PromoBase in Incognito means (D-123, PRIVACY.md): one set of
// codes for both kinds of window, and site access granted in one applies in
// the other.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, before, describe, it } from 'node:test';
import { closeWelcome, launch, sleep } from './support/browser.mjs';
import {
  allowInChromeDialog,
  closePopup,
  grantedOrigins,
  pattern,
  popupView,
  record,
  saveRecords,
  storedRecords,
  waitForPopup,
  warmUpPopup,
  waitForText,
} from './support/actions.mjs';
import { startSite } from './support/site.mjs';

describe('PromoBase allowed in Incognito', () => {
  let browser;
  let site;
  let library;
  let window;
  before(async () => {
    site = await startSite();
    // A pinned profile, then the extension's Incognito setting turned on in its preferences.
    const probe = await launch();
    const { extId } = probe;
    const profile = mkdtempSync(join(tmpdir(), 'promobase-incognito-'));
    await probe.close();
    const first = await launch({ profile, pinned: false });
    await first.close({ keepProfile: true });
    const path = join(profile, 'Default', 'Preferences');
    const prefs = JSON.parse(readFileSync(path, 'utf8'));
    prefs.extensions.pinned_extensions = [extId];
    prefs.extensions.settings = prefs.extensions.settings ?? {};
    prefs.extensions.settings[extId] = {
      ...(prefs.extensions.settings[extId] ?? {}),
      incognito: true,
    };
    writeFileSync(path, JSON.stringify(prefs));
    browser = await launch({ profile });
    browser.ownsProfile = true;
    await closeWelcome(browser);
    library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
    await saveRecords(library, [record('a', 'AUTUMN15', 'larkspur.example', true)]);
    await sleep(600);
  });
  after(async () => {
    await browser?.close();
    await site?.close();
  });

  it('Chrome reports PromoBase as allowed in Incognito', async () => {
    const worker = await browser.worker();
    assert.equal(await worker.evaluate('chrome.extension.isAllowedIncognitoAccess()'), true);
  });

  it('access granted in a normal window opens the reminder in an Incognito one', async () => {
    await library.command('Runtime.evaluate', {
      expression: `chrome.permissions.request({ origins: ['${pattern('larkspur.example')}'] })`,
      userGesture: true,
      awaitPromise: false,
    });
    await allowInChromeDialog();
    assert.deepEqual(await grantedOrigins(library), [pattern('larkspur.example')]);
    await warmUpPopup(browser);
    const worker = await browser.worker();
    window = await worker.evaluate(
      `chrome.windows.create({ incognito: true, url: '${site.url('www.larkspur.example', '/bikes')}' }).then((w) => ({ id: w.id, incognito: w.incognito, tab: w.tabs[0].id }))`,
    );
    assert.equal(window.incognito, true);
    const popup = await waitForPopup(browser, 10000);
    assert.ok(popup, 'no reminder in the Incognito window');
    assert.deepEqual((await popupView(popup)).codes, ['AUTUMN15']);
    await popup.evaluate(`chrome.storage.local.get('promobase.state').then(async (r) => {
      const state = r['promobase.state'];
      state.records.push({ id: 'b', promoCode: 'INCOG5', notify: false, createdAt: '2026-11-09T10:00:00.000Z', updatedAt: '2026-11-09T10:00:00.000Z' });
      await chrome.storage.local.set({ 'promobase.state': state });
    })`);
    await closePopup(browser);
  });

  it('closing the Incognito window forgets its tab but keeps a code saved there', async () => {
    const worker = await browser.worker();
    const tabs = () =>
      worker.evaluate(
        "chrome.storage.session.get('promobase.reminders').then((r) => Object.keys(r['promobase.reminders']?.tabs ?? {}))",
      );
    assert.ok((await tabs()).includes(String(window.tab)), 'tab not noted while open');
    await worker.evaluate(`chrome.windows.remove(${window.id})`);
    await sleep(1200);
    assert.ok(!(await tabs()).includes(String(window.tab)), 'tab still noted');
    assert.ok((await storedRecords(library)).some((r) => r.promoCode === 'INCOG5'));
  });
});
