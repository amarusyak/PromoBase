// Background entry point. It keeps the toolbar icon highlight in line with the
// saved records (D-061, D-064). Listeners are registered synchronously at the
// top level, as Manifest V3 requires for the worker to be woken for them.
import { STATE_KEY } from '../domain/stored-state';
import { applyHighlight } from '../platform/highlight';
import { chromeLocalStore } from '../platform/key-value-store';
import { webLock } from '../platform/lock';
import { syncHighlight } from './sync-highlight';

const store = chromeLocalStore();
const deps = { store, lock: webLock('promobase.highlight'), apply: applyHighlight };

async function refreshHighlight(trigger: string) {
  const outcome = await syncHighlight(deps);
  if (outcome.status === 'applied') {
    console.info(`PromoBase: highlight on ${outcome.domains.length} sites (${trigger})`);
  } else {
    console.warn(`PromoBase: highlight ${outcome.status}, ${outcome.reason} (${trigger})`);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.info(`PromoBase ${chrome.runtime.getManifest().version}: ${details.reason}`);
  void refreshHighlight(details.reason);
});

// Rules survive a browser restart; refreshing at startup only repairs a highlight
// that missed a change while the worker was not running.
chrome.runtime.onStartup.addListener(() => void refreshHighlight('startup'));

store.subscribe(STATE_KEY, () => void refreshHighlight('records changed'));
