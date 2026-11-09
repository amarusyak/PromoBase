import { localToday } from '../domain/dates';
import type { PromoCodeRecord } from '../domain/record';
import { pageHost } from '../domain/site-codes';
import {
  browserStarted,
  pageLoaded,
  parseReminderState,
  popupOpened,
  reminderCodes,
  reminderSite,
  siteSwitched,
  tabClosed,
  tabInFront,
  type PageSeen,
  type ReminderState,
  type ReminderStep,
} from '../domain/visit-reminder';
import type { BrowserTabs, TabInfo } from '../platform/browser-tabs';
import type { KeyValueStore, StoreArea } from '../platform/key-value-store';
import type { Lock } from '../platform/lock';
import { loadStoredState } from './load-state';

/**
 * Carries out the automatic reminder (PB-007) against Chrome: reads the tab,
 * the saved records and the visit state, lets src/domain/visit-reminder.ts
 * decide, and applies the effect. Every event runs under one lock, since tab
 * events come in bursts and each one reads and writes the visit state (D-062).
 * Nothing here throws: a reminder that cannot be worked out is simply not shown.
 */

/** Visit state, in chrome.storage.session: gone when the browser closes (D-052). */
export const REMINDER_STATE_KEY = 'promobase.reminders';

/**
 * Written just before the popup is opened automatically, so the popup can tell
 * that it was not opened by a click.
 */
export const REMINDER_OPENED_KEY = 'promobase.reminder-opened';

/** How long after REMINDER_OPENED_KEY was written a popup still counts as opened by it. */
export const OPENED_WINDOW_MS = 5000;

export const REMINDER_LOCK = 'promobase.reminder';

export interface ReminderDeps {
  /** chrome.storage.local, for the saved records. */
  records: Pick<KeyValueStore, 'get'>;
  /** chrome.storage.session, for the visit state. */
  session: Pick<StoreArea, 'get' | 'set' | 'remove'>;
  lock: Lock;
  tabs: BrowserTabs;
  now: () => Date;
}

/** Saved records, or none when they cannot be read: no reminder is better than a wrong one. */
async function savedRecords(deps: ReminderDeps): Promise<PromoCodeRecord[]> {
  const loaded = await loadStoredState(deps.records);
  return loaded.status === 'ok' ? loaded.state.records : [];
}

async function readState(deps: ReminderDeps): Promise<ReminderState> {
  return parseReminderState(await deps.session.get(REMINDER_STATE_KEY));
}

/** Runs one step under the lock: decide, store the new state, carry out the effect. */
async function step(
  deps: ReminderDeps,
  decide: (state: ReminderState, records: PromoCodeRecord[]) => Promise<StepPlan | undefined>,
): Promise<void> {
  try {
    await deps.lock(async () => {
      const records = await savedRecords(deps);
      const plan = await decide(await readState(deps), records);
      if (plan === undefined) return;
      await deps.session.set(REMINDER_STATE_KEY, plan.step.state);
      await apply(deps, plan);
    });
  } catch (error) {
    console.warn('PromoBase: reminder step failed', error);
  }
}

interface StepPlan {
  step: ReminderStep;
  tabId: number;
  windowId: number;
  codes: number;
}

async function apply(deps: ReminderDeps, { step: { effect }, tabId, windowId, codes }: StepPlan) {
  switch (effect.kind) {
    case 'none':
      return;
    case 'badge':
      await deps.tabs.setBadge(tabId, effect.text);
      return;
    case 'open':
      await deps.tabs.setBadge(tabId, '');
      await deps.session.set(REMINDER_OPENED_KEY, { tabId, at: deps.now().getTime() });
      try {
        await deps.tabs.openPopup(windowId);
      } catch (error) {
        // The record stays reachable from the toolbar button; the visit counts as
        // reminded, so the popup is not tried again during it (PB-014).
        console.warn('PromoBase: reminder popup could not open', error);
        await deps.tabs.setBadge(tabId, String(codes));
      }
  }
}

/** The page in this tab as the reminder logic sees it. */
async function seen(deps: ReminderDeps, tab: TabInfo, records: PromoCodeRecord[]) {
  const inFront = tab.active && (await deps.tabs.windowFocused(tab.windowId));
  const host = pageHost(tab.url);
  const page: PageSeen = { tabId: tab.id, host, inFront, now: deps.now().getTime() };
  const codes = reminderCodes(records, host, localToday(deps.now())).length;
  return { page, site: reminderSite(records, host), codes };
}

/** tabs.onUpdated with a new address or the start of a load. */
export function onPageLoaded(deps: ReminderDeps, tab: TabInfo): Promise<void> {
  return step(deps, async (state, records) => {
    const { page, site, codes } = await seen(deps, tab, records);
    return {
      step: pageLoaded(state, page, site, codes),
      tabId: tab.id,
      windowId: tab.windowId,
      codes,
    };
  });
}

/** tabs.onActivated, or windows.onFocusChanged for the window's active tab. */
export function onTabInFront(deps: ReminderDeps, tabId: number): Promise<void> {
  return step(deps, async (state, records) => {
    if (state.tabs[String(tabId)]?.pending !== true) return undefined;
    const tab = await deps.tabs.get(tabId);
    if (tab === undefined)
      return {
        step: { state: tabClosed(state, tabId), effect: { kind: 'none' } },
        tabId,
        windowId: -1,
        codes: 0,
      };
    if (!tab.active) return undefined;
    const { page, site, codes } = await seen(deps, tab, records);
    if (!page.inFront) return undefined;
    return { step: tabInFront(state, page, site, codes), tabId, windowId: tab.windowId, codes };
  });
}

/** windows.onFocusChanged: the window that got the focus, or none. */
export async function onWindowFocused(deps: ReminderDeps, windowId: number): Promise<void> {
  if (windowId < 0) return;
  const tab = await deps.tabs.activeTab(windowId);
  if (tab !== undefined) await onTabInFront(deps, tab.id);
}

export function onTabClosed(deps: ReminderDeps, tabId: number): Promise<void> {
  return step(deps, (state) =>
    Promise.resolve({
      step: { state: tabClosed(state, tabId), effect: { kind: 'none' } },
      tabId,
      windowId: -1,
      codes: 0,
    }),
  );
}

/**
 * runtime.onStartup. Called first thing, so it takes the lock before any tab
 * event of the restored tabs is handled (D-060, D-066).
 */
export function onBrowserStarted(deps: ReminderDeps): Promise<void> {
  return step(deps, async (state) => ({
    step: { state: browserStarted(state, await deps.tabs.loadingTabs()), effect: { kind: 'none' } },
    tabId: -1,
    windowId: -1,
    codes: 0,
  }));
}

/**
 * The popup opened over this tab. Answers a waiting reminder, so it does not
 * open the popup again when this one closes. Resolves to whether the popup was
 * opened by a reminder rather than by a click.
 */
export async function onPopupOpened(deps: ReminderDeps, tabId: number): Promise<boolean> {
  let automatic = false;
  await step(deps, async (state) => {
    const opened = (await deps.session.get(REMINDER_OPENED_KEY)) as
      { tabId?: unknown; at?: unknown } | undefined;
    if (opened !== undefined) {
      const age = deps.now().getTime() - Number(opened.at);
      automatic = opened.tabId === tabId && age >= 0 && age < OPENED_WINDOW_MS;
      await deps.session.remove(REMINDER_OPENED_KEY);
    }
    return { step: popupOpened(state, tabId), tabId, windowId: -1, codes: 0 };
  });
  return automatic;
}

/** The site's reminders were switched on or off by the person (see siteSwitched). */
export async function onSiteSwitched(deps: ReminderDeps, site: string): Promise<void> {
  try {
    await deps.lock(async () => {
      const { state, clearBadges } = siteSwitched(await readState(deps), site);
      await deps.session.set(REMINDER_STATE_KEY, state);
      for (const tabId of clearBadges) await deps.tabs.setBadge(tabId, '');
    });
  } catch (error) {
    console.warn('PromoBase: reminder state not updated', error);
  }
}
