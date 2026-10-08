import type { KeyValueStore } from './key-value-store';

/**
 * In-memory stand-in for chrome.storage.local, for tests.
 *
 * Values are copied on the way out, as real extension storage hands back a
 * fresh deserialized value on every read.
 */
export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const items = new Map(Object.entries(structuredClone(initial)));
  return {
    get(key) {
      return Promise.resolve(structuredClone(items.get(key)));
    },
  };
}
