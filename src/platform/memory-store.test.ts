import { describe, expect, it } from 'vitest';
import { memoryStore } from './memory-store';

describe('memoryStore', () => {
  it('resolves to undefined for a key that was never set', async () => {
    expect(await memoryStore().get('missing')).toBeUndefined();
  });

  it('hands out copies, so callers cannot change stored data by mutating a result', async () => {
    const initial = { key: { records: ['A'] } };
    const store = memoryStore(initial);

    const firstRead = (await store.get('key')) as { records: string[] };
    firstRead.records.push('B');
    initial.key.records.push('C');

    expect(await store.get('key')).toEqual({ records: ['A'] });
  });

  it('returns what was set, replacing the earlier value', async () => {
    const store = memoryStore({ key: 'old' });
    await store.set('key', { records: ['A'] });
    expect(await store.get('key')).toEqual({ records: ['A'] });
  });

  it('keeps keys apart', async () => {
    const store = memoryStore({ other: 1 });
    await store.set('key', 2);
    expect(await store.get('other')).toBe(1);
    expect(await store.get('key')).toBe(2);
  });

  it('stores a copy, so changing a value after setting it changes nothing', async () => {
    const store = memoryStore();
    const value = { records: ['A'] };
    await store.set('key', value);
    value.records.push('B');
    expect(await store.get('key')).toEqual({ records: ['A'] });
  });
});
