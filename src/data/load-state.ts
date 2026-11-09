import { parseStoredState, STATE_KEY, type ParseResult } from '../domain/stored-state';
import type { KeyValueStore } from '../platform/key-value-store';

export type LoadResult =
  | ParseResult
  /** The storage call itself failed. */
  | { status: 'unavailable'; reason: string };

/** Reads and interprets the persisted state. Never throws. */
export async function loadStoredState(store: Pick<KeyValueStore, 'get'>): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await store.get(STATE_KEY);
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  return parseStoredState(raw);
}

/** Why there is no stored value to copy: the read failed, or nothing is stored any more. */
export type StoredValueProblem = 'unavailable' | 'missing';

/**
 * The stored value exactly as it is, for a copy of data that cannot be read
 * (D-124). Never throws; nothing is interpreted or changed. A key that is not
 * there (removed after the problem was shown) is reported, not copied.
 */
export async function readStoredValue(
  store: Pick<KeyValueStore, 'get'>,
): Promise<{ ok: true; value: unknown } | { ok: false; problem: StoredValueProblem }> {
  let value: unknown;
  try {
    value = await store.get(STATE_KEY);
  } catch {
    return { ok: false, problem: 'unavailable' };
  }
  return value === undefined ? { ok: false, problem: 'missing' } : { ok: true, value };
}
