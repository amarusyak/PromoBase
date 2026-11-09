import { loadStoredState } from '../data/load-state';
import { accessToRemove } from '../domain/site-reminders';
import type { KeyValueStore } from '../platform/key-value-store';
import type { Lock } from '../platform/lock';
import type { SiteAccess } from '../platform/site-access';

export interface AccessDeps {
  store: Pick<KeyValueStore, 'get'>;
  /** Keeps two runs from working from the same, by then outdated, list (D-062). */
  lock: Lock;
  access: Pick<SiteAccess, 'granted' | 'remove'>;
}

export type AccessOutcome =
  | { status: 'removed'; patterns: string[] }
  /** The saved data cannot be read: access is left as it was (D-042). */
  | { status: 'left-as-is'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Gives back site access no site needs any more: a site whose reminders were
 * turned off, or whose last code was deleted (PB-006, PB-011). Turning
 * reminders on is not done here: that needs Chrome's dialog, so it can only
 * start from a click in a PromoBase page. Access the person gave in Chrome's
 * own menu, in any other shape, is never touched. Never throws.
 */
export async function syncAccess(deps: AccessDeps): Promise<AccessOutcome> {
  try {
    return await deps.lock<AccessOutcome>(async () => {
      const loaded = await loadStoredState(deps.store);
      if (loaded.status !== 'ok' && loaded.status !== 'empty') {
        return { status: 'left-as-is', reason: loaded.status };
      }
      const records = loaded.status === 'ok' ? loaded.state.records : [];
      const patterns = accessToRemove(await deps.access.granted(), records);
      await deps.access.remove(patterns);
      return { status: 'removed', patterns };
    });
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
