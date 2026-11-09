import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { SCHEMA_VERSION, STATE_KEY } from '../domain/stored-state';
import { COOLDOWN_MS, EMPTY_REMINDER_STATE } from '../domain/visit-reminder';
import type { BrowserTabs, TabInfo } from '../platform/browser-tabs';
import type { Lock } from '../platform/lock';
import { memoryStore } from '../platform/memory-store';
import { serialLock } from '../platform/serial-lock';
import {
  onBrowserStarted,
  onPageLoaded,
  onPopupOpened,
  onSiteSwitched,
  onTabClosed,
  onTabInFront,
  onWindowFocused,
  OPENED_WINDOW_MS,
  REMINDER_OPENED_KEY,
  REMINDER_STATE_KEY,
  type ReminderDeps,
} from './visit-reminders';

const T0 = new Date(2026, 10, 9, 12, 0, 0).getTime();

const reminding = [
  sampleRecord({ id: 'a', promoCode: 'TFP10', merchantDomain: 'shop.example', notify: true }),
  sampleRecord({ id: 'b', promoCode: 'MORE', merchantDomain: 'shop.example', notify: true }),
  sampleRecord({ id: 'c', promoCode: 'QUIET', merchantDomain: 'quiet.example' }),
];

/** A browser with tabs in windows, recording what PromoBase did to it. */
function setup(records: unknown = { schemaVersion: SCHEMA_VERSION, records: reminding }) {
  const tabs = new Map<number, TabInfo>();
  const focused = new Set<number>([1]);
  const loading: number[] = [];
  const done: string[] = [];
  let clock = T0;
  let openFails = false;
  const browser: BrowserTabs = {
    get: (id) => Promise.resolve(tabs.get(id)),
    activeTab: (windowId) =>
      Promise.resolve([...tabs.values()].find((t) => t.windowId === windowId && t.active)),
    loadingTabs: () => Promise.resolve([...loading]),
    windowFocused: (windowId) => Promise.resolve(focused.has(windowId)),
    setBadge: (tabId, text) => {
      done.push(`badge ${tabId} "${text}"`);
      return Promise.resolve();
    },
    openPopup: (windowId) => {
      done.push(`open window ${windowId}`);
      return openFails ? Promise.reject(new Error('no window')) : Promise.resolve();
    },
  };
  const session = memoryStore();
  const deps: ReminderDeps = {
    records: memoryStore(records === undefined ? {} : { [STATE_KEY]: records }),
    session,
    lock: serialLock(),
    tabs: browser,
    now: () => new Date(clock),
  };
  const tab = (id: number, url: string | undefined, active = true, windowId = 1) => {
    const info = { id, url, active, windowId };
    if (active)
      for (const other of tabs.values()) if (other.windowId === windowId) other.active = false;
    tabs.set(id, info);
    return info;
  };
  return {
    deps,
    session,
    done,
    tab,
    tabs,
    focused,
    loading,
    advance: (ms: number) => (clock += ms),
    failOpen: () => (openFails = true),
  };
}

describe('the automatic reminder against Chrome', () => {
  it('opens the popup on a visit in the tab in front, and marks the open for the popup', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://www.shop.example/coffee'));
    expect(t.done).toEqual(['badge 5 ""', 'open window 1']);
    expect(await t.session.get(REMINDER_OPENED_KEY)).toEqual({ tabId: 5, at: T0 });
  });

  it('does nothing on a site PromoBase cannot see, or one with reminders off', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, undefined));
    await onPageLoaded(t.deps, t.tab(5, 'https://quiet.example/'));
    expect(t.done).toEqual([]);
  });

  it('waits with a badge in a background tab, and opens when it is activated', async () => {
    const t = setup();
    t.tab(1, 'https://example.org/');
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/', false));
    expect(t.done).toEqual(['badge 5 "2"']);
    t.tab(5, 'https://shop.example/');
    await onTabInFront(t.deps, 5);
    expect(t.done).toEqual(['badge 5 "2"', 'badge 5 ""', 'open window 1']);
  });

  it('waits while Chrome is not in front, and opens when the window gets the focus (D-059)', async () => {
    const t = setup();
    t.focused.clear();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(t.done).toEqual(['badge 5 "2"']);
    await onWindowFocused(t.deps, -1);
    expect(t.done).toHaveLength(1);
    t.focused.add(1);
    await onWindowFocused(t.deps, 1);
    expect(t.done.at(-1)).toBe('open window 1');
  });

  it('re-reads the address before a waiting reminder fires (D-050)', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/', false));
    t.tab(5, undefined);
    await onTabInFront(t.deps, 5);
    expect(t.done).toEqual(['badge 5 "2"', 'badge 5 ""']);
  });

  it('activating a tab with nothing waiting does nothing', async () => {
    const t = setup();
    t.tab(5, 'https://shop.example/');
    await onTabInFront(t.deps, 5);
    expect(t.done).toEqual([]);
  });

  it('keeps one reminder per visit and a cooldown across tabs', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/cart'));
    await onPageLoaded(t.deps, t.tab(6, 'https://shop.example/'));
    expect(t.done.filter((d) => d.startsWith('open'))).toHaveLength(1);
    t.advance(COOLDOWN_MS);
    await onPageLoaded(t.deps, t.tab(7, 'https://shop.example/'));
    expect(t.done.filter((d) => d.startsWith('open'))).toHaveLength(2);
  });

  it('shows a badge when the popup cannot be opened, and does not try again in the visit (PB-014)', async () => {
    const t = setup();
    t.failOpen();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/again'));
    expect(t.done).toEqual(['badge 5 ""', 'open window 1', 'badge 5 "2"']);
  });

  it('gives restored tabs a badge, not a popup (D-060)', async () => {
    const t = setup();
    t.loading.push(5);
    await onBrowserStarted(t.deps);
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(t.done).toEqual(['badge 5 "2"']);
  });

  it('reminds of nothing when the saved data cannot be read (D-042)', async () => {
    const t = setup({ schemaVersion: SCHEMA_VERSION + 1, records: reminding });
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(t.done).toEqual([]);
  });

  it('forgets a closed tab', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/', false));
    await onTabClosed(t.deps, 5);
    expect(await t.session.get(REMINDER_STATE_KEY)).toEqual(EMPTY_REMINDER_STATE);
  });

  it('starts afresh from visit state it cannot read', async () => {
    const t = setup();
    await t.session.set(REMINDER_STATE_KEY, 'garbage');
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(t.done.at(-1)).toBe('open window 1');
  });

  it('does not throw when Chrome fails, and keeps working afterwards', async () => {
    const t = setup();
    const broken: Lock = () => Promise.reject(new Error('locks unavailable'));
    await expect(
      onPageLoaded({ ...t.deps, lock: broken }, t.tab(5, 'https://shop.example/')),
    ).resolves.toBeUndefined();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(t.done.at(-1)).toBe('open window 1');
  });
});

describe('onPopupOpened', () => {
  it('says the popup was opened by the reminder for that tab, once', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    t.advance(OPENED_WINDOW_MS - 1);
    expect(await onPopupOpened(t.deps, 5)).toBe(true);
    expect(await onPopupOpened(t.deps, 5)).toBe(false);
  });

  it('is a click when the mark is for another tab or too old', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(await onPopupOpened(t.deps, 6)).toBe(false);
    await t.session.set(REMINDER_OPENED_KEY, { tabId: 5, at: T0 - OPENED_WINDOW_MS });
    expect(await onPopupOpened(t.deps, 5)).toBe(false);
  });

  it('is a click when the reminder could not open the popup (review of PR #7)', async () => {
    const t = setup();
    t.failOpen();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(await t.session.get(REMINDER_OPENED_KEY)).toBeUndefined();
    expect(await onPopupOpened(t.deps, 5)).toBe(false);
  });

  it('leaves the mark of another tab for that tab (review of PR #7)', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    expect(await onPopupOpened(t.deps, 6)).toBe(false);
    expect(await onPopupOpened(t.deps, 5)).toBe(true);
  });

  it("drops another tab's mark once it is too old to count", async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    t.advance(OPENED_WINDOW_MS);
    expect(await onPopupOpened(t.deps, 6)).toBe(false);
    expect(await t.session.get(REMINDER_OPENED_KEY)).toBeUndefined();
  });

  it('answers a waiting reminder, so closing the popup does not bring it back', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/', false));
    t.tab(5, 'https://shop.example/');
    expect(await onPopupOpened(t.deps, 5)).toBe(false);
    await onTabInFront(t.deps, 5);
    expect(t.done).toEqual(['badge 5 "2"', 'badge 5 ""']);
  });
});

describe('onSiteSwitched', () => {
  it('ends the quiet period, so the next visit opens the popup again', async () => {
    const t = setup();
    await onPageLoaded(t.deps, t.tab(5, 'https://shop.example/'));
    await onPageLoaded(t.deps, t.tab(6, 'https://shop.example/', false));
    await onSiteSwitched(t.deps, 'shop.example');
    expect(t.done.at(-1)).toBe('badge 6 ""');
    await onPageLoaded(t.deps, t.tab(7, 'https://shop.example/'));
    expect(t.done.filter((d) => d.startsWith('open'))).toHaveLength(2);
  });
});
