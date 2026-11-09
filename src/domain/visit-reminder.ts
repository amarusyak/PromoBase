import { hostMatchesMerchant } from './merchant-domain';
import type { PromoCodeRecord } from './record';
import { recordStatus } from './record-status';

/**
 * When a visit to a merchant's site opens PromoBase by itself (PB-007, D2b).
 * Pure: the service worker feeds in what Chrome reports and carries out the
 * effect that comes back.
 *
 * - One reminder per visit per tab. A reload or another page of the same site
 *   is the same visit; leaving the site and coming back starts a new one.
 * - The popup opens only over the active tab of the focused window (D-001,
 *   D-050). Otherwise the tab gets a badge and the reminder waits until the
 *   tab is in front (D-002, D-051), if it is still on the site then.
 * - Once a site's reminder has been shown, no tab shows it again for
 *   COOLDOWN_MS (D-003, D-004).
 * - A tab restored at browser startup gets a badge, never a popup (D-060).
 * - Upcoming codes do not count: a site with only upcoming codes gets no
 *   reminder (D-022).
 */

/** How long a site's reminder stays quiet after it was shown (D-004: 10 minutes, owner's trial). */
export const COOLDOWN_MS = 10 * 60 * 1000;

/** What PromoBase knows about the visit going on in one tab. */
export interface TabVisit {
  /** The merchant domain the visit is to. */
  site: string;
  /** Waiting for the tab to come to the front. */
  pending: boolean;
}

export interface ReminderState {
  /** Keyed by tab id. A tab without an entry is not on a site with reminders on. */
  tabs: Record<string, TabVisit>;
  /** When each site's reminder was last shown, in milliseconds since the epoch. */
  shownAt: Record<string, number>;
  /** Tabs that were being restored when the browser started (D-060). */
  restoring: number[];
}

export const EMPTY_REMINDER_STATE: ReminderState = { tabs: {}, shownAt: {}, restoring: [] };

/**
 * What the service worker does after an event. `badge` is the text for the
 * tab's badge: the number of codes, or '' to clear it. `open` opens the popup
 * over the tab's window.
 */
export type ReminderEffect =
  { kind: 'none' } | { kind: 'badge'; text: string } | { kind: 'open'; site: string };

export interface ReminderStep {
  state: ReminderState;
  effect: ReminderEffect;
}

/** A page as the service worker sees it when a tab loads or comes to the front. */
export interface PageSeen {
  tabId: number;
  /**
   * The page's host. Undefined when PromoBase cannot see the address, which is
   * the case on every site it has no access to, or when it is not a web page.
   */
  host: string | undefined;
  /** The tab is the active one in its window and that window has the focus. */
  inFront: boolean;
  now: number;
}

/**
 * The site a host is reminded for: the broadest merchant domain with
 * reminders on that the host belongs to, so that "help.shop.example" and
 * "shop.example" are one visit when both are on.
 */
export function reminderSite(
  records: readonly PromoCodeRecord[],
  host: string | undefined,
): string | undefined {
  if (host === undefined) return undefined;
  let site: string | undefined;
  for (const record of records) {
    const domain = record.merchantDomain;
    if (!record.notify || domain === undefined || !hostMatchesMerchant(host, domain)) continue;
    if (site === undefined || domain.length < site.length) site = domain;
  }
  return site;
}

/**
 * The codes a reminder on this host shows: every code with reminders on whose
 * site the host belongs to, except upcoming ones (D-022). Expired codes are
 * shown, marked as such (PB-008).
 */
export function reminderCodes(
  records: readonly PromoCodeRecord[],
  host: string | undefined,
  today: string,
): PromoCodeRecord[] {
  if (host === undefined) return [];
  return records.filter(
    (record) =>
      record.notify &&
      record.merchantDomain !== undefined &&
      hostMatchesMerchant(host, record.merchantDomain) &&
      recordStatus(record, today) !== 'upcoming',
  );
}

function withTab(state: ReminderState, tabId: number, visit: TabVisit | undefined): ReminderState {
  const tabs = { ...state.tabs };
  if (visit === undefined) delete tabs[String(tabId)];
  else tabs[String(tabId)] = visit;
  return { ...state, tabs };
}

function coolingDown(state: ReminderState, site: string, now: number): boolean {
  const shown = state.shownAt[site];
  return shown !== undefined && now - shown >= 0 && now - shown < COOLDOWN_MS;
}

/** Shows the reminder now, or stays quiet if the site's cooldown is running. */
function show(state: ReminderState, tabId: number, site: string, now: number): ReminderStep {
  const settled = withTab(state, tabId, { site, pending: false });
  if (coolingDown(state, site, now)) return { state: settled, effect: { kind: 'badge', text: '' } };
  return {
    state: { ...settled, shownAt: { ...settled.shownAt, [site]: now } },
    effect: { kind: 'open', site },
  };
}

/**
 * A tab started loading a page or changed its address (tabs.onUpdated).
 * `codes` is how many codes a reminder for the page would show.
 */
export function pageLoaded(
  state: ReminderState,
  page: PageSeen,
  site: string | undefined,
  codes: number,
): ReminderStep {
  const restored = state.restoring.includes(page.tabId);
  // The mark is used up by the tab's first event, whatever it is (D-060).
  const current: ReminderState = restored
    ? { ...state, restoring: state.restoring.filter((id) => id !== page.tabId) }
    : state;
  const previous = current.tabs[String(page.tabId)];

  if (site === undefined) {
    if (previous === undefined) return { state: current, effect: { kind: 'none' } };
    return { state: withTab(current, page.tabId, undefined), effect: { kind: 'badge', text: '' } };
  }

  if (previous?.site === site) {
    // The same visit: a reload or another page of the site.
    if (previous.pending && page.inFront) return show(current, page.tabId, site, page.now);
    return { state: current, effect: { kind: 'none' } };
  }

  // A new visit.
  if (codes === 0) {
    return {
      state: withTab(current, page.tabId, { site, pending: false }),
      effect: { kind: 'badge', text: '' },
    };
  }
  if (restored) {
    return {
      state: withTab(current, page.tabId, { site, pending: false }),
      effect: { kind: 'badge', text: String(codes) },
    };
  }
  if (page.inFront) return show(current, page.tabId, site, page.now);
  if (coolingDown(current, site, page.now)) {
    return {
      state: withTab(current, page.tabId, { site, pending: false }),
      effect: { kind: 'badge', text: '' },
    };
  }
  return {
    state: withTab(current, page.tabId, { site, pending: true }),
    effect: { kind: 'badge', text: String(codes) },
  };
}

/**
 * A tab came to the front: it was activated, or its window got the focus.
 * Only a waiting reminder can fire here; bringing a tab forward is not a visit.
 */
export function tabInFront(
  state: ReminderState,
  page: PageSeen,
  site: string | undefined,
  codes: number,
): ReminderStep {
  const previous = state.tabs[String(page.tabId)];
  if (previous === undefined || !previous.pending) return { state, effect: { kind: 'none' } };
  // The address is checked again: the tab may have left the site meanwhile (D-050).
  if (site !== previous.site || codes === 0) {
    return { state: withTab(state, page.tabId, undefined), effect: { kind: 'badge', text: '' } };
  }
  return show(state, page.tabId, site, page.now);
}

/**
 * The person opened the popup on this tab themselves: a waiting reminder is
 * answered, so it does not open the popup again once it closes.
 */
export function popupOpened(state: ReminderState, tabId: number): ReminderStep {
  const previous = state.tabs[String(tabId)];
  if (previous === undefined || !previous.pending) return { state, effect: { kind: 'none' } };
  return {
    state: withTab(state, tabId, { ...previous, pending: false }),
    effect: { kind: 'badge', text: '' },
  };
}

/**
 * The person switched the site's reminders on or off. Its quiet period ends,
 * and visits to it in open tabs are forgotten, so the next visit after turning
 * it on reminds (owner's trial). Returns the tabs whose waiting badge must go.
 */
export function siteSwitched(
  state: ReminderState,
  site: string,
): { state: ReminderState; clearBadges: number[] } {
  const shownAt = { ...state.shownAt };
  delete shownAt[site];
  const tabs: Record<string, TabVisit> = {};
  const clearBadges: number[] = [];
  for (const [id, visit] of Object.entries(state.tabs)) {
    if (visit.site !== site) tabs[id] = visit;
    else if (visit.pending) clearBadges.push(Number(id));
  }
  return { state: { ...state, tabs, shownAt }, clearBadges };
}

/** The tab was closed. */
export function tabClosed(state: ReminderState, tabId: number): ReminderState {
  return {
    ...withTab(state, tabId, undefined),
    restoring: state.restoring.filter((id) => id !== tabId),
  };
}

/** The browser started: these tabs are being restored from the last session (D-060). */
export function browserStarted(
  state: ReminderState,
  loadingTabs: readonly number[],
): ReminderState {
  // Nothing from the previous session is in session storage, but a worker that
  // restarts mid-session keeps what it had.
  return { ...state, restoring: [...new Set([...state.restoring, ...loadingTabs])] };
}

/**
 * Reads the state back from session storage. Anything that is not in the
 * shape this build writes starts afresh: the worst outcome is one reminder
 * more, and nothing the person saved is involved.
 */
export function parseReminderState(raw: unknown): ReminderState {
  if (typeof raw !== 'object' || raw === null) return EMPTY_REMINDER_STATE;
  const value = raw as Partial<Record<keyof ReminderState, unknown>>;
  const tabs: Record<string, TabVisit> = {};
  if (typeof value.tabs === 'object' && value.tabs !== null) {
    for (const [id, visit] of Object.entries(value.tabs)) {
      if (typeof visit !== 'object' || visit === null) continue;
      const { site, pending } = visit as Partial<Record<keyof TabVisit, unknown>>;
      if (typeof site === 'string' && typeof pending === 'boolean') tabs[id] = { site, pending };
    }
  }
  const shownAt: Record<string, number> = {};
  if (typeof value.shownAt === 'object' && value.shownAt !== null) {
    for (const [site, at] of Object.entries(value.shownAt)) {
      if (typeof at === 'number' && Number.isFinite(at)) shownAt[site] = at;
    }
  }
  const restoring = Array.isArray(value.restoring)
    ? value.restoring.filter((id): id is number => Number.isInteger(id))
    : [];
  return { tabs, shownAt, restoring };
}
