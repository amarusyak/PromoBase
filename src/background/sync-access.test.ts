import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { accessPattern } from '../domain/site-reminders';
import { SCHEMA_VERSION, STATE_KEY } from '../domain/stored-state';
import type { Lock } from '../platform/lock';
import { memoryStore } from '../../tests/support/memory-store';
import { serialLock } from '../../tests/support/serial-lock';
import { syncAccess, type AccessDeps } from './sync-access';

function setup(initial: unknown, granted: string[], overrides: Partial<AccessDeps> = {}) {
  const store = memoryStore(initial === undefined ? {} : { [STATE_KEY]: initial });
  const held = new Set(granted);
  const removals: string[][] = [];
  const deps: AccessDeps = {
    store,
    lock: serialLock(),
    access: {
      granted: () => Promise.resolve([...held]),
      remove: (patterns) => {
        removals.push([...patterns]);
        patterns.forEach((pattern) => held.delete(pattern));
        return Promise.resolve();
      },
    },
    ...overrides,
  };
  return { store, deps, held, removals };
}

const state = (...records: ReturnType<typeof sampleRecord>[]) => ({
  schemaVersion: SCHEMA_VERSION,
  records,
});
const on = (id: string, merchantDomain: string) =>
  sampleRecord({ id, merchantDomain, notify: true });
const off = (id: string, merchantDomain: string) => sampleRecord({ id, merchantDomain });

describe('syncAccess', () => {
  it('gives back access for sites that are off or gone, and keeps the rest (PB-011)', async () => {
    const { deps, held } = setup(state(on('a', 'kept.org'), off('b', 'off.org')), [
      accessPattern('kept.org'),
      accessPattern('off.org'),
      accessPattern('gone.org'),
    ]);

    expect(await syncAccess(deps)).toEqual({
      status: 'removed',
      patterns: [accessPattern('gone.org'), accessPattern('off.org')],
    });
    expect([...held]).toEqual([accessPattern('kept.org')]);
  });

  it('gives everything of its own back on a fresh install, and nothing else', async () => {
    const { deps, held } = setup(undefined, [accessPattern('a.org'), 'https://example.org/*']);

    await syncAccess(deps);

    expect([...held]).toEqual(['https://example.org/*']);
  });

  it('asks Chrome to remove nothing when nothing is to go', async () => {
    const { deps, removals } = setup(state(on('a', 'a.org')), [accessPattern('a.org')]);

    expect(await syncAccess(deps)).toEqual({ status: 'removed', patterns: [] });
    expect(removals).toEqual([[]]);
  });

  it.each([
    [
      'written by a newer version',
      { schemaVersion: SCHEMA_VERSION + 1, records: [] },
      'unsupported-version',
    ],
    ['corrupt', 'garbage', 'corrupt'],
  ])('leaves access as it was when the data is %s (D-042)', async (_label, raw, reason) => {
    const { deps, removals } = setup(raw, [accessPattern('a.org')]);

    expect(await syncAccess(deps)).toEqual({ status: 'left-as-is', reason });
    expect(removals).toEqual([]);
  });

  it('reads the records and the access inside the lock', async () => {
    const events: string[] = [];
    const { deps } = setup(state(), [accessPattern('a.org')]);
    const lock: Lock = async (work) => {
      events.push('lock taken');
      const result = await work();
      events.push('lock released');
      return result;
    };
    const access: AccessDeps['access'] = {
      granted: () => {
        events.push('granted read');
        return deps.access.granted();
      },
      remove: (patterns) => {
        events.push('removed');
        return deps.access.remove(patterns);
      },
    };

    await syncAccess({ ...deps, lock, access });

    expect(events).toEqual(['lock taken', 'granted read', 'removed', 'lock released']);
  });

  it('waits for Chrome to finish removing before it reports', async () => {
    let finished = false;
    const { deps } = setup(state(), [accessPattern('a.org')], {});
    const slow: AccessDeps = {
      ...deps,
      access: {
        granted: deps.access.granted,
        remove: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          finished = true;
        },
      },
    };

    await syncAccess(slow);

    expect(finished).toBe(true);
  });

  it('reports a failure from Chrome instead of throwing', async () => {
    const { deps } = setup(state(), [accessPattern('a.org')]);
    const failing: AccessDeps = {
      ...deps,
      access: { granted: deps.access.granted, remove: () => Promise.reject(new Error('busy')) },
    };

    expect(await syncAccess(failing)).toEqual({ status: 'failed', reason: 'busy' });
  });
});
