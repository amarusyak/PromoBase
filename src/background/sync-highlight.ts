import { loadStoredState } from '../data/load-state';
import { highlightDomains } from '../domain/site-codes';
import type { KeyValueStore } from '../platform/key-value-store';
import type { Lock } from '../platform/lock';

export interface HighlightDeps {
  store: Pick<KeyValueStore, 'get'>;
  /** Keeps two updates from interleaving their remove and add steps (D-062). */
  lock: Lock;
  apply: (domains: readonly string[]) => Promise<void>;
}

export type HighlightOutcome =
  | { status: 'applied'; domains: string[] }
  /** The saved data cannot be read: the highlight is left as it was (D-042). */
  | { status: 'left-as-is'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Brings the icon highlight in line with the saved records. Reads the state
 * inside the lock, so of two quick changes the later one always wins. Never
 * throws.
 */
export async function syncHighlight(deps: HighlightDeps): Promise<HighlightOutcome> {
  try {
    return await deps.lock<HighlightOutcome>(async () => {
      const loaded = await loadStoredState(deps.store);
      if (loaded.status !== 'ok' && loaded.status !== 'empty') {
        return { status: 'left-as-is', reason: loaded.status };
      }
      const domains = highlightDomains(loaded.status === 'ok' ? loaded.state.records : []);
      await deps.apply(domains);
      return { status: 'applied', domains };
    });
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
