import { chromeLocalStore } from '../platform/key-value-store';
import { webLock } from '../platform/lock';
import { STATE_LOCK, type RecordStoreDeps } from './record-store';

/**
 * The record store as it runs inside the extension: chrome.storage.local, the
 * lock shared by all PromoBase pages, the real clock and random ids.
 */
export function recordStoreDeps(): RecordStoreDeps {
  return {
    store: chromeLocalStore(),
    lock: webLock(STATE_LOCK),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  };
}
