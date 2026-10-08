// Spike-only helpers. Throwaway code: it calls chrome.* directly and is not held
// to the module rules in CLAUDE.md.

export async function getLocal<T>(key: string): Promise<T | undefined> {
  const items = await chrome.storage.local.get(key);
  return items[key] as T | undefined;
}

export async function getSession<T>(key: string): Promise<T | undefined> {
  const items = await chrome.storage.session.get(key);
  return items[key] as T | undefined;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
