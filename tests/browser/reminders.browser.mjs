// The toolbar highlight and the automatic reminder: D-001 to D-005, D-022,
// D-061, D-093, D-100 to D-104. Access is granted through Chrome's real
// permission dialog, answered from the keyboard.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closeWelcome, launch, sleep } from './support/browser.mjs';
import {
  allowInChromeDialog,
  click,
  clickScreen,
  closePopup,
  fill,
  forgetReminders,
  grantedOrigins,
  pattern,
  popupView,
  record,
  saveRecords,
  storedRecords,
  toolbarIcon,
  waitForPopup,
  warmUpPopup,
  waitForText,
} from './support/actions.mjs';
import { startSite } from './support/site.mjs';

describe('the toolbar highlight (D-061, D-093)', () => {
  let browser;
  let site;
  before(async () => {
    site = await startSite();
    browser = await launch();
    await closeWelcome(browser);
    const library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
    await saveRecords(library, [record('a', 'AUTUMN15', 'larkspur.example')]);
    await sleep(700);
  });
  after(async () => {
    await browser?.close();
    await site?.close();
  });

  let plain;
  it('elsewhere the icon is the plain one', async () => {
    await browser.open(site.url('example.org'));
    await sleep(1200);
    plain = toolbarIcon('highlight-elsewhere');
    assert.ok(plain.yellow > 0 && plain.yellow < 400, `yellow pixels: ${plain.yellow}`);
  });

  it('on a saved site, with no site access, the icon turns yellow', async () => {
    await browser.open(site.url('www.larkspur.example', '/bikes'));
    await sleep(1500);
    const lit = toolbarIcon('highlight-saved-site');
    assert.ok(
      lit.yellow > 2 * plain.yellow,
      `yellow pixels: ${lit.yellow} against ${plain.yellow}`,
    );
    const library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
    assert.deepEqual(await grantedOrigins(library), []);
  });
});

describe('the automatic reminder (PB-007)', () => {
  let browser;
  let site;
  let library;
  let shop;
  let icon;
  before(async () => {
    site = await startSite();
    browser = await launch();
    await closeWelcome(browser);
    library = await browser.open(browser.url('library.html'));
    await waitForText(library, 'main');
    await saveRecords(library, [
      record('a', 'SAVE10', 'shop.test', true),
      record('b', 'LATER', 'shop.test', true, { startDate: '2099-01-01' }),
      record('c', 'SOON', 'soon.test', true, { startDate: '2099-01-01' }),
      record('d', 'QUIET', 'quiet.test'),
    ]);
    await sleep(700);
  });
  after(async () => {
    await browser?.close();
    await site?.close();
  });

  it("Chrome's dialog grants access for both sites with reminders on", async () => {
    await library.command('Runtime.evaluate', {
      expression: `chrome.permissions.request({ origins: ['${pattern('shop.test')}', '${pattern('soon.test')}'] })`,
      userGesture: true,
      awaitPromise: false,
    });
    await sleep(500);
    assert.deepEqual(await grantedOrigins(library), [], 'nothing before the answer');
    await allowInChromeDialog();
    assert.deepEqual(await grantedOrigins(library), [pattern('shop.test'), pattern('soon.test')]);
    await warmUpPopup(browser);
  });

  it('opens by itself on the site, on "This site", without codes that have not started', async () => {
    shop = await browser.open(site.url('www.shop.test', '/first'));
    const popup = await waitForPopup(browser);
    assert.ok(popup, 'no popup');
    const view = await popupView(popup);
    assert.match(view.tab, /^This site/);
    assert.deepEqual(view.codes, ['SAVE10']);
    assert.ok(
      view.controls.includes("Don't remind me again on shop.test"),
      view.controls.join(', '),
    );
    await closePopup(browser);
  });

  it('a reload or another page of the site does not open it again', async () => {
    await shop.command('Page.reload', {});
    assert.equal(await waitForPopup(browser, 2500), undefined, 'after a reload');
    await shop.command('Page.navigate', { url: site.url('www.shop.test', '/cart') });
    assert.equal(await waitForPopup(browser, 2500), undefined, 'on another page');
  });

  it('leaving and coming back within 10 minutes stays quiet (D-004)', async () => {
    await shop.command('Page.navigate', { url: site.url('example.org') });
    await sleep(800);
    await shop.command('Page.navigate', { url: site.url('shop.test', '/back') });
    assert.equal(await waitForPopup(browser, 2500), undefined);
  });

  it('after the quiet period, coming back opens it again', async () => {
    await shop.command('Page.navigate', { url: site.url('example.org') });
    await sleep(800);
    await forgetReminders(library);
    await shop.command('Page.navigate', { url: site.url('shop.test', '/later') });
    assert.ok(await waitForPopup(browser));
    await closePopup(browser);
  });

  it('a tab opened in the background gets a badge, then the popup when it comes to the front (D-001, D-002)', async () => {
    await forgetReminders(library);
    const background = await browser.open(site.url('shop.test', '/bg'), { background: true });
    assert.equal(await waitForPopup(browser, 2500), undefined, 'popup over another tab');
    const tabId = await library.evaluate(
      "chrome.tabs.query({}).then((ts) => ts.find((t) => (t.url ?? '').includes('/bg'))?.id)",
    );
    const badge = () => library.evaluate(`chrome.action.getBadgeText({ tabId: ${tabId} })`);
    assert.equal(await badge(), '1');
    await browser.send('Target.activateTarget', { targetId: background.targetId });
    assert.ok(await waitForPopup(browser), 'no popup on activation');
    await sleep(500);
    assert.equal(await badge(), '');
    await closePopup(browser);
  });

  it('no popup on a site whose only code has not started (D-022)', async () => {
    await forgetReminders(library);
    await browser.open(site.url('www.soon.test'));
    assert.equal(await waitForPopup(browser, 2500), undefined);
  });

  it('opened by a click on the toolbar button, it lists upcoming codes too and offers "Turn off"', async () => {
    await browser.send('Target.activateTarget', { targetId: shop.targetId });
    await sleep(800);
    icon = toolbarIcon('reminder-toolbar');
    assert.ok(icon.yellow > 0, 'PromoBase button not found on the toolbar');
    clickScreen(icon.x, icon.y);
    const popup = await waitForPopup(browser);
    assert.ok(popup, 'no popup after the click');
    const view = await popupView(popup);
    assert.ok(view.controls.includes('Turn off reminders on shop.test'), view.controls.join(', '));
    assert.ok(view.codes.includes('LATER'), view.codes.join(', '));
    await closePopup(browser);
  });

  it('"Don\'t remind me again" turns the whole site off and gives its access back (D-005, D-100)', async () => {
    await forgetReminders(library);
    await shop.command('Page.navigate', { url: site.url('example.org') });
    await sleep(800);
    await shop.command('Page.navigate', { url: site.url('www.shop.test', '/again') });
    const popup = await waitForPopup(browser);
    assert.ok(popup);
    await click(popup, "Don't remind me again on shop.test");
    await sleep(1600);
    const notify = Object.fromEntries(
      (await storedRecords(library)).map((r) => [r.promoCode, r.notify]),
    );
    assert.deepEqual(notify, { SAVE10: false, LATER: false, SOON: true, QUIET: false });
    assert.ok(!(await grantedOrigins(library)).includes(pattern('shop.test')));
    await closePopup(browser);
    await forgetReminders(library);
    await shop.command('Page.navigate', { url: site.url('example.org') });
    await sleep(800);
    await shop.command('Page.navigate', { url: site.url('www.shop.test', '/after') });
    assert.equal(await waitForPopup(browser, 2500), undefined, 'the next visit');
  });

  it("PromoBase's explanation is shown on its own, its buttons in view, under 600px (D-095)", async () => {
    clickScreen(icon.x, icon.y);
    const popup = await waitForPopup(browser);
    assert.ok(popup);
    await click(popup, 'Remind me on shop.test');
    const layout = await popup.evaluate(`(() => {
      const panel = [...document.querySelectorAll('[role=tabpanel]')].find((x) => x.checkVisibility());
      const shown = [...panel.children].filter((c) => c.checkVisibility()).map((c) => c.className);
      const on = [...document.querySelectorAll('button')].find((x) => x.checkVisibility() && x.textContent.trim() === 'Turn on');
      const r = on?.getBoundingClientRect();
      return { shown, height: Math.ceil(document.querySelector('main').getBoundingClientRect().height),
        scrolls: panel.scrollHeight > panel.clientHeight + 1, buttonInView: r !== undefined && r.bottom <= panel.getBoundingClientRect().bottom };
    })()`);
    assert.equal(layout.shown.length, 1, layout.shown.join(', '));
    assert.match(layout.shown[0], /site-reminder__explain/);
    assert.ok(
      layout.buttonInView && !layout.scrolls && layout.height <= 600,
      JSON.stringify(layout),
    );
    await click(popup, 'Not now');
    assert.equal((await popupView(popup)).codes.length, 2);
  });

  it('a code saved in the popup offers reminders for its site', async () => {
    const popup = await waitForPopup(browser, 500);
    assert.ok(popup);
    await click(popup, 'Add');
    await fill(popup, 'Promo code', 'TFP10');
    await fill(popup, 'Website or link', 'newshop.test');
    await click(popup, 'Save code');
    await sleep(500);
    const view = await popupView(popup);
    assert.match(view.text, /Code saved/);
    assert.ok(view.controls.includes('Remind me on newshop.test'), view.controls.join(', '));
    await closePopup(browser);
  });

  it('nothing was logged as an error or warning', () => {
    assert.deepEqual(browser.errors, []);
  });
});
