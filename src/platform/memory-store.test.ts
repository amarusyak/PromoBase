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

  it('forgets a removed key and leaves the others', async () => {
    const store = memoryStore({ key: 1, other: 2 });
    await store.remove('key');
    expect(await store.get('key')).toBeUndefined();
    expect(await store.get('other')).toBe(2);
  });

  it('tells subscribers of a key when it is set or removed, and only then', async () => {
    const store = memoryStore({ key: 1 });
    let calls = 0;
    store.subscribe('key', () => {
      calls += 1;
    });

    await store.set('other', 1);
    expect(calls).toBe(0);
    await store.set('key', 2);
    expect(calls).toBe(1);
    await store.remove('key');
    expect(calls).toBe(2);
    await store.remove('key');
    expect(calls).toBe(2);
  });

  it('stops telling a subscriber that has unsubscribed', async () => {
    const store = memoryStore();
    let calls = 0;
    const unsubscribe = store.subscribe('key', () => {
      calls += 1;
    });
    await store.set('key', 1);
    unsubscribe();
    await store.set('key', 2);
    expect(calls).toBe(1);
  });
});
