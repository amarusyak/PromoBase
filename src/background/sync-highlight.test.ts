import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { SCHEMA_VERSION, STATE_KEY } from '../domain/stored-state';
import type { Lock } from '../platform/lock';
import { memoryStore } from '../platform/memory-store';
import { serialLock } from '../platform/serial-lock';
import { syncHighlight, type HighlightDeps } from './sync-highlight';

function setup(initial?: unknown, overrides: Partial<HighlightDeps> = {}) {
  const store = memoryStore(initial === undefined ? {} : { [STATE_KEY]: initial });
  const applied: string[][] = [];
  const deps: HighlightDeps = {
    store,
    lock: serialLock(),
    apply: (domains) => {
      applied.push([...domains]);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { store, deps, applied };
}

const state = (...records: ReturnType<typeof sampleRecord>[]) => ({
  schemaVersion: SCHEMA_VERSION,
  records,
});

describe('syncHighlight', () => {
  it('highlights every site that has saved codes (D-064)', async () => {
    const { deps, applied } = setup(
      state(
        sampleRecord({ id: 'a', merchantDomain: 'example.org' }),
        sampleRecord({ id: 'b', merchantDomain: 'dropbox.com' }),
        sampleRecord({ id: 'c' }),
      ),
    );
    expect(await syncHighlight(deps)).toEqual({
      status: 'applied',
      domains: ['dropbox.com', 'example.org'],
    });
    expect(applied).toEqual([['dropbox.com', 'example.org']]);
  });

  it('removes the highlight on a fresh install and when no record has a site', async () => {
    const fresh = setup();
    await syncHighlight(fresh.deps);
    const noSites = setup(state(sampleRecord()));
    await syncHighlight(noSites.deps);
    expect([fresh.applied, noSites.applied]).toEqual([[[]], [[]]]);
  });

  it.each([
    [
      'written by a newer version',
      { schemaVersion: SCHEMA_VERSION + 1, records: [] },
      'unsupported-version',
    ],
    ['corrupt', 'garbage', 'corrupt'],
  ])('leaves the highlight as it was when the data is %s (D-042)', async (_label, raw, reason) => {
    const { deps, applied } = setup(raw);
    expect(await syncHighlight(deps)).toEqual({ status: 'left-as-is', reason });
    expect(applied).toEqual([]);
  });

  it('leaves the highlight as it was when storage does not answer', async () => {
    const { deps, applied } = setup(undefined, {
      store: { get: () => Promise.reject(new Error('storage is disabled')) },
    });
    expect(await syncHighlight(deps)).toEqual({ status: 'left-as-is', reason: 'unavailable' });
    expect(applied).toEqual([]);
  });

  it('reports a rule that Chrome refuses instead of throwing', async () => {
    const { deps } = setup(state(sampleRecord({ merchantDomain: 'example.org' })), {
      apply: () => Promise.reject(new Error('Invalid rule')),
    });
    expect(await syncHighlight(deps)).toEqual({ status: 'failed', reason: 'Invalid rule' });
  });

  it('reports a lock that cannot be taken', async () => {
    const lock: Lock = () => Promise.reject(new Error('locks are unavailable'));
    const { deps, applied } = setup(state(), { lock });
    expect(await syncHighlight(deps)).toEqual({
      status: 'failed',
      reason: 'locks are unavailable',
    });
    expect(applied).toEqual([]);
  });

  it('applies changes in order, the last one reading the latest records', async () => {
    const { store, deps, applied } = setup(state());
    const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    // A slow first apply: without the lock the second would overtake it and lose.
    let first = true;
    deps.apply = async (domains) => {
      if (first) {
        first = false;
        await later(20);
      }
      applied.push([...domains]);
    };
    const one = syncHighlight(deps);
    await store.set(STATE_KEY, state(sampleRecord({ merchantDomain: 'example.org' })));
    const two = syncHighlight(deps);
    await Promise.all([one, two]);
    expect(applied.at(-1)).toEqual(['example.org']);
  });
});
