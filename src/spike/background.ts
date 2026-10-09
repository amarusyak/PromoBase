// Spike only (D-028). Answers:
//   D-009  can the service worker see merchant visits through tabs.onUpdated alone?
//   D-001  how does action.openPopup behave for active, background and unfocused tabs?
//   D-002  can a deferred reminder fire on tab or window activation?
//   D-013  do permission events reach the service worker when the popup has closed?
// Every observation goes to the shared log, which the library page shows and copies.
import {
  AUTO_OPEN_KEY,
  COUNTERS_KEY,
  FOCUS_KEY,
  MODE_KEY,
  POPUP_PORT,
  VISITS_KEY,
  type ReminderMode,
  type Visits,
} from './background-keys';
import { BUILD_ID, BUILD_ID_REQUEST } from './build-id';
import { domainFromPattern, hostMatchesDomain, hostOf } from './domains';
import { logEvent } from './log';
import { describeError, getLocal, getSession } from './store';

const CONTENT_SCRIPT_ID = 'spike-detect';

async function readVisits(): Promise<Visits> {
  return (await getSession<Visits>(VISITS_KEY)) ?? { reminded: {}, pending: {} };
}

function writeVisits(visits: Visits): Promise<void> {
  return chrome.storage.session.set({ [VISITS_KEY]: visits });
}

async function bumpCounter(name: string): Promise<void> {
  const counters = (await getSession<Record<string, number>>(COUNTERS_KEY)) ?? {};
  counters[name] = (counters[name] ?? 0) + 1;
  await chrome.storage.session.set({ [COUNTERS_KEY]: counters });
}

/** Tab events arrive in bursts; one lock keeps the read-decide-write sequences from interleaving. */
function exclusively<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks.request('spike.reminder', work);
}

async function grantedDomains(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll();
  return [...new Set(origins.map(domainFromPattern).filter((d): d is string => d !== undefined))];
}

async function windowFocused(windowId: number): Promise<boolean> {
  try {
    return (await chrome.windows.get(windowId)).focused;
  } catch {
    return false;
  }
}

/**
 * Three views of "is Chrome in front", logged with every reminder decision so they
 * can be compared: the tab's window, the last-focused window, and the latest
 * windows.onFocusChanged event ('none' means Chrome reported losing focus).
 */
async function focusSnapshot(windowId: number): Promise<Record<string, unknown>> {
  let lastFocused: unknown = null;
  try {
    const window = await chrome.windows.getLastFocused();
    lastFocused = {
      id: window.id ?? null,
      focused: window.focused,
      sameWindow: window.id === windowId,
    };
  } catch {
    // No window at all.
  }
  return {
    lastFocused,
    lastFocusEvent: (await getSession<number | 'none'>(FOCUS_KEY)) ?? 'no event yet',
  };
}

async function setBadge(tabId: number, text: string): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text });
  } catch {
    // The tab is gone.
  }
}

async function tryOpenPopup(
  tabId: number,
  windowId: number,
  domain: string,
  visits: Visits,
  context: Record<string, unknown>,
): Promise<void> {
  // Lets the popup tell an automatic open from a click.
  await chrome.storage.session.set({ [AUTO_OPEN_KEY]: { tabId, domain, t: Date.now() } });
  const started = Date.now();
  let failure: string | undefined;
  try {
    await chrome.action.openPopup({ windowId });
  } catch (error) {
    failure = describeError(error);
  }
  // Opened or not, this visit is done: PB-014 rules out retrying within the same visit.
  visits.reminded[tabId] = domain;
  delete visits.pending[tabId];
  await writeVisits(visits);
  await setBadge(tabId, failure === undefined ? '' : '!');
  await logEvent(
    'sw',
    failure === undefined ? 'reminder:openPopup-ok' : 'reminder:openPopup-error',
    {
      tabId,
      domain,
      ms: Date.now() - started,
      ...context,
      ...(failure === undefined ? {} : { message: failure }),
    },
  );
}

async function endVisit(tabId: number, reason: string): Promise<void> {
  const visits = await readVisits();
  if (visits.reminded[tabId] === undefined && visits.pending[tabId] === undefined) return;
  delete visits.reminded[tabId];
  delete visits.pending[tabId];
  await writeVisits(visits);
  await setBadge(tabId, '');
  await logEvent('sw', 'visit:ended', { tabId, reason });
}

async function considerReminder(
  tabId: number,
  windowId: number,
  domain: string,
  active: boolean,
  trigger: string,
): Promise<void> {
  const visits = await readVisits();
  if (visits.reminded[tabId] === domain) {
    await logEvent('sw', 'reminder:skip-same-visit', { tabId, domain, trigger });
    return;
  }
  const mode = (await getLocal<ReminderMode>(MODE_KEY)) ?? 'guarded';
  const focused = await windowFocused(windowId);
  if (mode === 'guarded' && !(active && focused)) {
    if (visits.pending[tabId] !== domain) {
      visits.pending[tabId] = domain;
      await writeVisits(visits);
      await setBadge(tabId, '1');
      await logEvent('sw', 'reminder:deferred', {
        tabId,
        domain,
        active,
        focused,
        trigger,
        ...(await focusSnapshot(windowId)),
      });
    }
    return;
  }
  await tryOpenPopup(tabId, windowId, domain, visits, {
    mode,
    active,
    focused,
    trigger,
    ...(await focusSnapshot(windowId)),
  });
}

// Detection method A: tabs.onUpdated. Without the "tabs" permission, tab.url is
// only filled in for sites the user granted, so everything else stays invisible.
async function handleTabUpdate(
  tabId: number,
  urlChanged: boolean,
  status: string | undefined,
  tab: chrome.tabs.Tab,
): Promise<void> {
  if (!urlChanged && status !== 'complete') return;
  await exclusively(async () => {
    const host = hostOf(tab.url);
    if (host === undefined) {
      await bumpCounter(
        tab.url === undefined ? 'completeWithoutUrlAccess' : 'completeOnNonHttpPage',
      );
      await endVisit(tabId, 'navigated-to-a-page-without-access');
      return;
    }
    const domain = (await grantedDomains()).find((granted) => hostMatchesDomain(host, granted));
    await logEvent('sw', 'detect:tabs.onUpdated', {
      tabId,
      host,
      matched: domain ?? null,
      urlChanged,
      status: status ?? null,
      active: tab.active,
    });
    if (domain === undefined) {
      await endVisit(tabId, 'navigated-to-a-visible-non-merchant-page');
      return;
    }
    await considerReminder(tabId, tab.windowId, domain, tab.active, 'tabs.onUpdated');
  });
}

async function handleActivation(tabId: number, windowId: number, trigger: string): Promise<void> {
  await exclusively(async () => {
    const visits = await readVisits();
    const domain = visits.pending[tabId];
    if (domain === undefined) return;
    const focused = await windowFocused(windowId);
    if (!focused) {
      await logEvent('sw', 'reminder:still-deferred', { tabId, domain, focused, trigger });
      return;
    }
    const host = hostOf((await chrome.tabs.get(tabId)).url);
    if (host === undefined || !hostMatchesDomain(host, domain)) {
      await endVisit(tabId, 'deferred-reminder-dropped-tab-left-the-domain');
      return;
    }
    await tryOpenPopup(tabId, windowId, domain, visits, {
      mode: 'guarded',
      active: true,
      focused,
      trigger,
    });
  });
}

// Detection method B: a content script registered only for granted sites (PRD 9.2).
// It is reconciled from permission events and at startup, never from the popup (D-013).
function reconcileContentScripts(reason: string): Promise<void> {
  // onInstalled and onStartup fire together after a browser update; unserialised,
  // both tried to register the script and one failed with "Duplicate script ID".
  return navigator.locks.request('spike.reconcile', () => reconcileNow(reason));
}

async function reconcileNow(reason: string): Promise<void> {
  try {
    const { origins = [] } = await chrome.permissions.getAll();
    const matches = origins.filter((origin) => domainFromPattern(origin) !== undefined);
    const registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID],
    });
    if (registered.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    }
    if (matches.length > 0) {
      await chrome.scripting.registerContentScripts([
        {
          id: CONTENT_SCRIPT_ID,
          matches,
          js: ['spike-content.js'],
          runAt: 'document_start',
          persistAcrossSessions: true,
        },
      ]);
    }
    await logEvent('sw', 'content-scripts:reconciled', { reason, matches });
  } catch (error) {
    await logEvent('sw', 'content-scripts:error', { reason, message: describeError(error) });
  }
}

function isContentReport(message: unknown): message is { reason: string; host: string } {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate.type === 'spike:content' &&
    typeof candidate.reason === 'string' &&
    typeof candidate.host === 'string'
  );
}

// All listeners are registered synchronously, as a service worker requires.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleTabUpdate(tabId, changeInfo.url !== undefined, changeInfo.status, tab);
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void handleActivation(tabId, windowId, 'tabs.onActivated');
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  const lostFocus = windowId === chrome.windows.WINDOW_ID_NONE;
  void (async () => {
    await chrome.storage.session.set({ [FOCUS_KEY]: lostFocus ? 'none' : windowId });
    await logEvent('sw', 'focus:windows.onFocusChanged', {
      windowId: lostFocus ? 'none' : windowId,
    });
    if (lostFocus) return;
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id !== undefined) await handleActivation(tab.id, windowId, 'windows.onFocusChanged');
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void exclusively(() => endVisit(tabId, 'tab-closed'));
});

chrome.permissions.onAdded.addListener((permissions) => {
  void (async () => {
    await logEvent('sw', 'permissions.onAdded', { origins: permissions.origins ?? [] });
    await reconcileContentScripts('permissions.onAdded');
  })();
});

chrome.permissions.onRemoved.addListener((permissions) => {
  void (async () => {
    await logEvent('sw', 'permissions.onRemoved', { origins: permissions.origins ?? [] });
    await reconcileContentScripts('permissions.onRemoved');
  })();
});

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await logEvent('sw', 'runtime.onInstalled', { reason: details.reason });
    await reconcileContentScripts('runtime.onInstalled');
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    await logEvent('sw', 'runtime.onStartup');
    await reconcileContentScripts('runtime.onStartup');
  })();
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (message === BUILD_ID_REQUEST) {
    sendResponse(BUILD_ID);
    return;
  }
  if (!isContentReport(message)) return;
  void logEvent('content', `detect:content-script:${message.reason}`, {
    tabId: sender.tab?.id ?? null,
    host: message.host,
  });
});

// The popup holds a port open, so its closing is observable here even when the
// popup itself gets no chance to log (for example when a permission dialog takes focus).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT) return;
  const opened = Date.now();
  port.onDisconnect.addListener(() => {
    void logEvent('sw', 'popup:closed', { openForMs: Date.now() - opened });
  });
});
