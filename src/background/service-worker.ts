// Background entry point. It keeps two things in line with the saved records,
// the toolbar icon highlight (D-061, D-064) and the site access PromoBase holds,
// which it gives back once no site needs it (PB-011); and it opens the popup
// when a tab visits a site with reminders on (PB-007). Listeners are registered
// synchronously at the top level, as Manifest V3 requires for the worker to be
// woken for them.
import {
  onBrowserStarted,
  onPageLoaded,
  onTabClosed,
  onTabInFront,
  onWindowFocused,
} from '../data/visit-reminders';
import { visitReminderDeps } from '../data/visit-reminders-deps';
import { STATE_KEY } from '../domain/stored-state';
import { applyHighlight } from '../platform/highlight';
import { chromeLocalStore } from '../platform/key-value-store';
import { webLock } from '../platform/lock';
import { chromeSiteAccess } from '../platform/site-access';
import { openWelcome } from '../platform/welcome';
import { syncAccess } from './sync-access';
import { syncHighlight } from './sync-highlight';

const store = chromeLocalStore();
const highlight = { store, lock: webLock('promobase.highlight'), apply: applyHighlight };
const access = { store, lock: webLock('promobase.access'), access: chromeSiteAccess };
const reminders = visitReminderDeps();

async function refreshHighlight(trigger: string) {
  const outcome = await syncHighlight(highlight);
  if (outcome.status === 'applied') {
    console.info(`PromoBase: highlight on ${outcome.domains.length} sites (${trigger})`);
  } else {
    console.warn(`PromoBase: highlight ${outcome.status}, ${outcome.reason} (${trigger})`);
  }
}

async function refreshAccess(trigger: string) {
  const outcome = await syncAccess(access);
  if (outcome.status === 'removed') {
    if (outcome.patterns.length > 0) {
      console.info(`PromoBase: gave back ${outcome.patterns.join(', ')} (${trigger})`);
    }
  } else {
    console.warn(`PromoBase: site access ${outcome.status}, ${outcome.reason} (${trigger})`);
  }
}

function refresh(trigger: string) {
  void refreshHighlight(trigger);
  void refreshAccess(trigger);
}

chrome.runtime.onInstalled.addListener((details) => {
  console.info(`PromoBase ${chrome.runtime.getManifest().version}: ${details.reason}`);
  refresh(details.reason);
  // First install only, not an update or a reload: the welcome is the empty library (PB-001).
  if (details.reason === 'install') void openWelcome();
});

// Rules and access survive a browser restart; refreshing at startup only
// repairs a change missed while the worker was not running.
chrome.runtime.onStartup.addListener(() => {
  // First, so the restored tabs are marked before any of their events is handled (D-060).
  void onBrowserStarted(reminders);
  refresh('startup');
});

store.subscribe(STATE_KEY, () => refresh('records changed'));

// Access granted for a site whose reminders were turned off in the meantime is
// given back as well.
chromeSiteAccess.subscribe(() => void refreshAccess('site access changed'));

// The automatic reminder (PB-007). tab.url is filled in only on sites PromoBase
// has access to; on every other page a load simply ends the visit (D-049).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url === undefined && changeInfo.status !== 'loading') return;
  void onPageLoaded(reminders, {
    id: tabId,
    url: tab.url,
    active: tab.active,
    windowId: tab.windowId,
  });
});
chrome.tabs.onActivated.addListener(({ tabId }) => void onTabInFront(reminders, tabId));
chrome.windows.onFocusChanged.addListener((windowId) => void onWindowFocused(reminders, windowId));
chrome.tabs.onRemoved.addListener((tabId) => void onTabClosed(reminders, tabId));
