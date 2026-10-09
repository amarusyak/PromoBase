import type { StoreArea } from './key-value-store';

/**
 * In-memory stand-in for chrome.storage, for tests.
 *
 * Values are copied on the way in and on the way out, as real extension
 * storage keeps its own serialized copy and hands back a fresh one on every
 * read.
 */
export function memoryStore(initial: Record<string, unknown> = {}): StoreArea {
  const items = new Map(Object.entries(structuredClone(initial)));
  const listeners = new Map<string, Set<() => void>>();
  const changed = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener();
  };
  return {
    get(key) {
      return Promise.resolve(structuredClone(items.get(key)));
    },
    set(key, value) {
      items.set(key, structuredClone(value));
      changed(key);
      return Promise.resolve();
    },
    remove(key) {
      if (items.delete(key)) changed(key);
      return Promise.resolve();
    },
    subscribe(key, listener) {
      const forKey = listeners.get(key) ?? new Set();
      listeners.set(key, forKey);
      forKey.add(listener);
      return () => forKey.delete(listener);
    },
  };
}
