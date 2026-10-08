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
});
