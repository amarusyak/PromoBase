import { getLocal } from './store';

export type SpikeSource = 'sw' | 'popup' | 'library' | 'content';

export interface SpikeEvent {
  t: string;
  src: SpikeSource;
  event: string;
  data?: Record<string, unknown>;
}

export const LOG_KEY = 'spike.log';
const MAX_ENTRIES = 400;

/**
 * Appends to a log shared by the service worker, the popup and the library tab.
 * The append is a read-modify-write, so it runs under a Web Lock; whether that
 * really serializes writes across the three contexts is one of the spike's questions.
 */
export function logEvent(
  src: SpikeSource,
  event: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const entry: SpikeEvent = { t: new Date().toISOString(), src, event, ...(data ? { data } : {}) };
  return navigator.locks.request('spike.log', async () => {
    const log = (await getLocal<SpikeEvent[]>(LOG_KEY)) ?? [];
    log.push(entry);
    await chrome.storage.local.set({ [LOG_KEY]: log.slice(-MAX_ENTRIES) });
  });
}
