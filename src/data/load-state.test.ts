import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, STATE_KEY } from '../domain/stored-state';
import type { KeyValueStore } from '../platform/key-value-store';
import { memoryStore } from '../platform/memory-store';
import { loadStoredState } from './load-state';

function failingStore(error: unknown): Pick<KeyValueStore, 'get'> {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection is one of the cases under test
  return { get: () => Promise.reject(error) };
}

describe('loadStoredState', () => {
  it('reports empty for a fresh install', async () => {
    expect(await loadStoredState(memoryStore())).toEqual({ status: 'empty' });
  });

  it('reads the state stored under the PromoBase key', async () => {
    const state = { schemaVersion: SCHEMA_VERSION, records: [] };
    expect(await loadStoredState(memoryStore({ [STATE_KEY]: state }))).toEqual({
      status: 'ok',
      state,
    });
  });

  it('ignores values stored under other keys', async () => {
    const store = memoryStore({ 'another.key': { schemaVersion: SCHEMA_VERSION, records: [] } });
    expect(await loadStoredState(store)).toEqual({ status: 'empty' });
  });

  it('passes unreadable data through as corrupt', async () => {
    const store = memoryStore({ [STATE_KEY]: 'not a state' });
    expect(await loadStoredState(store)).toMatchObject({ status: 'corrupt' });
  });

  it('reports unavailable when the storage call rejects', async () => {
    const result = await loadStoredState(failingStore(new Error('storage is disabled')));
    expect(result).toEqual({ status: 'unavailable', reason: 'storage is disabled' });
  });

  it('reports unavailable when the rejection is not an Error', async () => {
    const result = await loadStoredState(failingStore('quota'));
    expect(result).toEqual({ status: 'unavailable', reason: 'quota' });
  });
});
