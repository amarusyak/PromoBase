import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import type { PromoCodeRecord } from './record';
import {
  browserStarted,
  COOLDOWN_MS,
  EMPTY_REMINDER_STATE,
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
} from './visit-reminder';

const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);
const TODAY = '2026-11-09';

let nextId = 0;
function code(merchantDomain: string, notify = true, extra: Partial<PromoCodeRecord> = {}) {
  nextId += 1;
  return sampleRecord({ id: `r-${nextId}`, merchantDomain, notify, ...extra });
}

const page = (tabId: number, host: string | undefined, inFront = true, now = T0): PageSeen => ({
  tabId,
  host,
  inFront,
  now,
});

/** Runs pageLoaded for a host on a shop.example with two codes. */
function load(state: ReminderState, seen: PageSeen) {
  const onShop = seen.host !== undefined && seen.host.endsWith('shop.example');
  return pageLoaded(state, seen, onShop ? 'shop.example' : undefined, onShop ? 2 : 0);
}
function front(state: ReminderState, seen: PageSeen) {
  const onShop = seen.host !== undefined && seen.host.endsWith('shop.example');
  return tabInFront(state, seen, onShop ? 'shop.example' : undefined, onShop ? 2 : 0);
}

describe('reminderSite', () => {
  it('is the site of a code with reminders on that the host belongs to', () => {
    expect(reminderSite([code('shop.example')], 'www.shop.example')).toBe('shop.example');
  });

  it('ignores sites with reminders off and codes without a site', () => {
    expect(reminderSite([code('shop.example', false), sampleRecord()], 'shop.example')).toBe(
      undefined,
    );
  });

  it('takes the broadest site when a subdomain is on too, so both are one visit', () => {
    const records = [code('help.shop.example'), code('shop.example')];
    expect(reminderSite(records, 'help.shop.example')).toBe('shop.example');
    expect(reminderSite([...records].reverse(), 'help.shop.example')).toBe('shop.example');
    expect(reminderSite([code('help.shop.example')], 'shop.example')).toBeUndefined();
  });

  it('matches on label boundaries only', () => {
    expect(reminderSite([code('shop.example')], 'notshop.example')).toBeUndefined();
    expect(reminderSite([code('shop.example')], 'shop.example.evil.test')).toBeUndefined();
  });

  it('is undefined when the address cannot be seen', () => {
    expect(reminderSite([code('shop.example')], undefined)).toBeUndefined();
  });
});

describe('reminderCodes', () => {
  it('shows active and expired codes, not upcoming ones (D-022, PB-008)', () => {
    const active = code('shop.example');
    const expired = code('shop.example', true, { expiryDate: '2026-01-31' });
    const upcoming = code('shop.example', true, { startDate: '2026-12-01' });
    const off = code('other.example', false);
    expect(reminderCodes([active, expired, upcoming, off], 'shop.example', TODAY)).toEqual([
      active,
      expired,
    ]);
  });

  it('counts a code that starts today and one that expires today', () => {
    const starts = code('shop.example', true, { startDate: TODAY });
    const ends = code('shop.example', true, { expiryDate: TODAY });
    expect(reminderCodes([starts, ends], 'www.shop.example', TODAY)).toHaveLength(2);
  });
});

it('keeps a site quiet for 10 minutes after its reminder (D-004)', () => {
  expect(COOLDOWN_MS).toBe(10 * 60 * 1000);
});

describe('a visit in the tab in front', () => {
  it('opens the popup once (PB-007)', () => {
    const first = load(EMPTY_REMINDER_STATE, page(1, 'www.shop.example'));
    expect(first.effect).toEqual({ kind: 'open', site: 'shop.example' });
    expect(first.state.tabs['1']).toEqual({ site: 'shop.example', pending: false });
    expect(first.state.shownAt['shop.example']).toBe(T0);
  });

  it.each([
    ['a reload', 'www.shop.example'],
    ['another page of the site', 'www.shop.example'],
    ['a subdomain of the site', 'help.shop.example'],
  ])('does not open again on %s', (_label, host) => {
    const first = load(EMPTY_REMINDER_STATE, page(1, 'www.shop.example'));
    expect(load(first.state, page(1, host, true, T0 + COOLDOWN_MS * 2)).effect).toEqual({
      kind: 'none',
    });
  });

  it('opens again after leaving the site and coming back, once the cooldown is over', () => {
    let state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    const left = load(state, page(1, undefined));
    expect(left.state.tabs['1']).toBeUndefined();
    state = left.state;
    expect(load(state, page(1, 'shop.example', true, T0 + COOLDOWN_MS)).effect).toEqual({
      kind: 'open',
      site: 'shop.example',
    });
  });

  it('stays quiet when coming back within the cooldown (D-003, D-004)', () => {
    let state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    state = load(state, page(1, undefined)).state;
    const back = load(state, page(1, 'shop.example', true, T0 + COOLDOWN_MS - 1));
    expect(back.effect).toEqual({ kind: 'badge', text: '' });
    expect(back.state.tabs['1']).toEqual({ site: 'shop.example', pending: false });
    expect(back.state.shownAt['shop.example']).toBe(T0);
  });

  it('applies the cooldown across tabs', () => {
    const state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    expect(load(state, page(2, 'shop.example', true, T0 + 1000)).effect).toEqual({
      kind: 'badge',
      text: '',
    });
  });

  it('ignores a clock that went backwards rather than staying quiet for good', () => {
    const state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    expect(load(state, page(2, 'shop.example', true, T0 - 1000)).effect.kind).toBe('open');
  });

  it('gives no reminder for a site whose only codes are upcoming (D-022)', () => {
    const step = pageLoaded(EMPTY_REMINDER_STATE, page(1, 'shop.example'), 'shop.example', 0);
    expect(step.effect).toEqual({ kind: 'badge', text: '' });
    expect(step.state.shownAt).toEqual({});
  });

  it('does nothing on a page that is not a merchant site with reminders on', () => {
    const step = load(EMPTY_REMINDER_STATE, page(1, 'example.org'));
    expect(step).toEqual({ state: EMPTY_REMINDER_STATE, effect: { kind: 'none' } });
  });

  it('starts a new visit when the tab moves straight to another site with reminders on', () => {
    const state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    const step = pageLoaded(state, page(1, 'other.example'), 'other.example', 1);
    expect(step.effect).toEqual({ kind: 'open', site: 'other.example' });
  });
});

describe('a visit in a tab that is not in front (D-001, D-002)', () => {
  it('gets a badge with the number of codes and waits', () => {
    const step = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false));
    expect(step.effect).toEqual({ kind: 'badge', text: '2' });
    expect(step.state.tabs['1']).toEqual({ site: 'shop.example', pending: true });
    expect(step.state.shownAt).toEqual({});
  });

  it('opens when the tab comes to the front, still on the site', () => {
    const waiting = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false)).state;
    const step = front(waiting, page(1, 'www.shop.example', true, T0 + 5000));
    expect(step.effect).toEqual({ kind: 'open', site: 'shop.example' });
    expect(step.state.tabs['1']).toEqual({ site: 'shop.example', pending: false });
    expect(step.state.shownAt['shop.example']).toBe(T0 + 5000);
  });

  it('opens when a reload happens with the tab in front', () => {
    const waiting = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false)).state;
    expect(load(waiting, page(1, 'shop.example', true)).effect.kind).toBe('open');
  });

  it('keeps waiting through more loads in the background', () => {
    const waiting = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false)).state;
    const step = load(waiting, page(1, 'shop.example', false));
    expect(step.effect).toEqual({ kind: 'none' });
    expect(step.state.tabs['1']?.pending).toBe(true);
  });

  it('drops the reminder and the badge if the tab left the site meanwhile (D-050)', () => {
    const waiting = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false)).state;
    const step = front(waiting, page(1, undefined));
    expect(step.effect).toEqual({ kind: 'badge', text: '' });
    expect(step.state.tabs['1']).toBeUndefined();
  });

  it('drops the reminder if the tab moved on to another site with reminders on', () => {
    const waiting = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false)).state;
    const step = tabInFront(waiting, page(1, 'other.example'), 'other.example', 1);
    expect(step.effect).toEqual({ kind: 'badge', text: '' });
    expect(step.state.tabs['1']).toBeUndefined();
    expect(step.state.shownAt).toEqual({});
  });

  it('stays quiet in front if another tab showed the reminder meanwhile', () => {
    let state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false)).state;
    state = load(state, page(2, 'shop.example', true, T0 + 1000)).state;
    const step = front(state, page(1, 'shop.example', true, T0 + 2000));
    expect(step.effect).toEqual({ kind: 'badge', text: '' });
    expect(step.state.tabs['1']?.pending).toBe(false);
  });

  it('a background tab in the cooldown gets no badge and does not wait', () => {
    const state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    const step = load(state, page(2, 'shop.example', false, T0 + 1000));
    expect(step.effect).toEqual({ kind: 'badge', text: '' });
    expect(step.state.tabs['2']?.pending).toBe(false);
  });

  it('bringing a tab forward is not a visit', () => {
    expect(front(EMPTY_REMINDER_STATE, page(1, 'shop.example')).effect).toEqual({ kind: 'none' });
    const shown = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    expect(front(shown, page(1, 'shop.example', true, T0 + COOLDOWN_MS * 2)).effect).toEqual({
      kind: 'none',
    });
  });

  it('is answered by the person opening the popup themselves', () => {
    const waiting = load(EMPTY_REMINDER_STATE, page(1, 'shop.example', false)).state;
    const step = popupOpened(waiting, 1);
    expect(step.effect).toEqual({ kind: 'badge', text: '' });
    expect(step.state.tabs['1']).toEqual({ site: 'shop.example', pending: false });
    expect(front(step.state, page(1, 'shop.example')).effect).toEqual({ kind: 'none' });
  });

  it('opening the popup on a tab with nothing waiting changes nothing', () => {
    const state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    expect(popupOpened(state, 1)).toEqual({ state, effect: { kind: 'none' } });
    expect(popupOpened(state, 9)).toEqual({ state, effect: { kind: 'none' } });
  });
});

describe('tabs restored at browser startup (D-060)', () => {
  const started = browserStarted(EMPTY_REMINDER_STATE, [1, 2]);

  it('get a badge, never a popup, and count as reminded', () => {
    const step = load(started, page(1, 'shop.example'));
    expect(step.effect).toEqual({ kind: 'badge', text: '2' });
    expect(step.state.tabs['1']).toEqual({ site: 'shop.example', pending: false });
    expect(step.state.restoring).toEqual([2]);
    expect(step.state.shownAt).toEqual({});
  });

  it('use the mark up on their first event, even one that is not a merchant page', () => {
    let state = load(started, page(1, 'example.org')).state;
    expect(state.restoring).toEqual([2]);
    state = load(state, page(1, 'shop.example')).state;
    expect(load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).effect.kind).toBe('open');
    expect(state.tabs['1']?.pending).toBe(false);
  });

  it('afterwards behave like any tab: leaving and coming back reminds', () => {
    let state = load(started, page(1, 'shop.example')).state;
    state = load(state, page(1, undefined)).state;
    expect(load(state, page(1, 'shop.example')).effect.kind).toBe('open');
  });

  it('marks are merged when the worker restarts during the session', () => {
    expect(browserStarted(started, [2, 3]).restoring).toEqual([1, 2, 3]);
  });
});

describe('siteSwitched', () => {
  it('ends the quiet period and forgets visits to that site only, clearing waiting badges', () => {
    let state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    state = load(state, page(2, 'shop.example', false, T0 + COOLDOWN_MS)).state;
    state = pageLoaded(state, page(3, 'other.example'), 'other.example', 1).state;
    const { state: after, clearBadges } = siteSwitched(state, 'shop.example');
    expect(clearBadges).toEqual([2]);
    expect(Object.keys(after.tabs)).toEqual(['3']);
    expect(after.shownAt).toEqual({ 'other.example': T0 });
  });

  it('lets the next visit remind straight away, even in the tab that was reminded', () => {
    const state = load(EMPTY_REMINDER_STATE, page(1, 'shop.example')).state;
    const { state: after } = siteSwitched(state, 'shop.example');
    expect(load(after, page(1, 'shop.example', true, T0 + 1000)).effect.kind).toBe('open');
  });
});

describe('tabClosed', () => {
  it('forgets the tab and its restore mark, and keeps the cooldown', () => {
    let state = browserStarted(EMPTY_REMINDER_STATE, [7]);
    state = load(state, page(1, 'shop.example')).state;
    state = tabClosed(tabClosed(state, 1), 7);
    expect(state).toEqual({ tabs: {}, shownAt: { 'shop.example': T0 }, restoring: [] });
  });
});

describe('parseReminderState', () => {
  it('reads back what it writes', () => {
    let state = browserStarted(EMPTY_REMINDER_STATE, [4]);
    state = load(state, page(1, 'shop.example')).state;
    state = load(state, page(2, 'shop.example', false, T0 + COOLDOWN_MS)).state;
    expect(parseReminderState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it.each([undefined, null, 'x', 42, []])('starts afresh from %s', (raw) => {
    expect(parseReminderState(raw)).toEqual(EMPTY_REMINDER_STATE);
  });

  it('drops entries in any other shape and keeps the rest', () => {
    const raw = {
      tabs: { '1': { site: 'a.example', pending: true }, '2': { site: 3 }, '3': null },
      shownAt: { 'a.example': 5, 'b.example': 'soon', 'c.example': Infinity },
      restoring: [1, 'x', 2.5, 3],
    };
    expect(parseReminderState(raw)).toEqual({
      tabs: { '1': { site: 'a.example', pending: true } },
      shownAt: { 'a.example': 5 },
      restoring: [1, 3],
    });
  });
});
