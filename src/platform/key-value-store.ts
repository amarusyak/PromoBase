/**
 * The storage operations PromoBase needs, kept separate from the Chrome API so
 * the logic above it can be unit tested (D-031).
 */
export interface KeyValueStore {
  /** Resolves to the stored value, or undefined when the key has never been set. */
  get(key: string): Promise<unknown>;
}

/** Records live in chrome.storage.local (PB-013). */
export function chromeLocalStore(): KeyValueStore {
  return {
    async get(key) {
      const items = await chrome.storage.local.get(key);
      return items[key];
    },
  };
}
