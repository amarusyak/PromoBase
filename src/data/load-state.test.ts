import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, STATE_KEY } from '../domain/stored-state';
import type { KeyValueStore } from '../platform/key-value-store';
import { memoryStore } from '../../tests/support/memory-store';
import { loadStoredState, readStoredValue } from './load-state';

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

describe('readStoredValue (D-124)', () => {
  it('returns the stored value as it is, even when it cannot be read as PromoBase data', async () => {
    const damaged = { schemaVersion: 1, records: [{ id: 'a' }], extra: 'kept' };
    const store = memoryStore({ [STATE_KEY]: damaged });
    expect(await readStoredValue(store)).toEqual({ ok: true, value: damaged });
    expect(await store.get(STATE_KEY)).toEqual(damaged);
  });

  it('reports a failed read instead of throwing', async () => {
    for (const error of [new Error('gone'), 'not an error']) {
      expect(await readStoredValue(failingStore(error))).toEqual({
        ok: false,
        problem: 'unavailable',
      });
    }
  });

  it('reports a key that is not there instead of copying "undefined" (review of PR #10)', async () => {
    expect(await readStoredValue(memoryStore())).toEqual({ ok: false, problem: 'missing' });
    expect(await readStoredValue(memoryStore({ 'another.key': 1 }))).toEqual({
      ok: false,
      problem: 'missing',
    });
  });

  it('copies stored values that are falsy but present', async () => {
    for (const value of [null, false, 0, '']) {
      expect(await readStoredValue(memoryStore({ [STATE_KEY]: value }))).toEqual({
        ok: true,
        value,
      });
    }
  });
});
