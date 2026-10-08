import { parseStoredState, STATE_KEY, type ParseResult } from '../domain/stored-state';
import type { KeyValueStore } from '../platform/key-value-store';

export type LoadResult =
  | ParseResult
  /** The storage call itself failed. */
  | { status: 'unavailable'; reason: string };

/** Reads and interprets the persisted state. Never throws. */
export async function loadStoredState(store: KeyValueStore): Promise<LoadResult> {
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
