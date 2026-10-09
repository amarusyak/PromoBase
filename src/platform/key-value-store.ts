/**
 * The storage operations PromoBase needs, kept separate from the Chrome API so
 * the logic above it can be unit tested (D-031).
 */
export interface KeyValueStore {
  /** Resolves to the stored value, or undefined when the key has never been set. */
  get(key: string): Promise<unknown>;
  /** Replaces the value under the key. Resolves once it is stored and rejects if it was not. */
  set(key: string, value: unknown): Promise<void>;
}

/** A store that can also forget a key and tell when a key changes. */
export interface StoreArea extends KeyValueStore {
  remove(key: string): Promise<void>;
  /**
   * Calls the listener after the value under the key changed, whichever page
   * or worker changed it. Returns a function that stops the calls.
   */
  subscribe(key: string, listener: () => void): () => void;
}

function chromeStore(area: 'local' | 'session'): StoreArea {
  const storage = chrome.storage[area];
  return {
    async get(key) {
      const items = await storage.get(key);
      return items[key];
    },
    async set(key, value) {
      await storage.set({ [key]: value });
    },
    async remove(key) {
      await storage.remove(key);
    },
    subscribe(key, listener) {
      const onChanged = (changes: Record<string, unknown>, areaName: string) => {
        if (areaName === area && key in changes) listener();
      };
      chrome.storage.onChanged.addListener(onChanged);
      return () => chrome.storage.onChanged.removeListener(onChanged);
    },
  };
}

/** Records live in chrome.storage.local (PB-013). */
export function chromeLocalStore(): StoreArea {
  return chromeStore('local');
}

/**
 * Kept in memory by Chrome and gone when the browser closes. Holds what is
 * worth keeping only for a short while, such as an unfinished form.
 */
export function chromeSessionStore(): StoreArea {
  return chromeStore('session');
}
