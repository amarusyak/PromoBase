// Storage keys and names shared between the service worker and the pages.
// Kept apart from background.ts so that importing them does not register listeners.
export type ReminderMode = 'guarded' | 'always';

export const MODE_KEY = 'spike.mode';
export const VISITS_KEY = 'spike.visits';
export const AUTO_OPEN_KEY = 'spike.autoOpen';
export const COUNTERS_KEY = 'spike.counters';
export const POPUP_PORT = 'spike:popup';
/** The window id from the latest windows.onFocusChanged event, or 'none' when Chrome reported losing focus. */
export const FOCUS_KEY = 'spike.lastFocusEvent';

/** Ids of tabs that were being restored when the browser started (D-060). */
export const RESTORED_KEY = 'spike.restoredTabs';
/** Domains whose pages get the highlighted toolbar icon with no site access (D-061). */
export const PASSIVE_KEY = 'spike.passiveDomains';
export const PASSIVE_REQUEST = 'spike:passive-set';

/** Per-tab visit state, keyed by tab id. Lives in session storage so it survives worker restarts. */
export interface Visits {
  /** Tabs already reminded during the current visit to this domain (PB-007). */
  reminded: Record<string, string>;
  /** Tabs with a reminder waiting for the tab to become active and focused (D-001, D-002). */
  pending: Record<string, string>;
}
