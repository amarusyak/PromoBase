import { describe, expect, it } from 'vitest';
import { serialLock } from './serial-lock';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('serialLock', () => {
  it('resolves with what the work returned', async () => {
    expect(await serialLock()(() => Promise.resolve('done'))).toBe('done');
  });

  it('runs one piece of work at a time, in the order asked', async () => {
    const lock = serialLock();
    const events: string[] = [];
    const work = (name: string, ms: number) => async () => {
      events.push(`${name} starts`);
      await pause(ms);
      events.push(`${name} ends`);
    };

    // The first is the slowest: without the lock the others would overtake it.
    await Promise.all([lock(work('first', 15)), lock(work('second', 5)), lock(work('third', 0))]);

    expect(events).toEqual([
      'first starts',
      'first ends',
      'second starts',
      'second ends',
      'third starts',
      'third ends',
    ]);
  });

  it('passes a failure to its caller and still runs the work queued behind it', async () => {
    const lock = serialLock();
    const failed = lock(() => Promise.reject(new Error('storage is disabled')));
    const next = lock(() => Promise.resolve('still runs'));

    await expect(failed).rejects.toThrow('storage is disabled');
    expect(await next).toBe('still runs');
  });

  it('gives each lock its own queue', async () => {
    const slow = serialLock();
    const other = serialLock();
    const events: string[] = [];

    const held = slow(async () => {
      await pause(15);
      events.push('slow');
    });
    await other(() => {
      events.push('other');
      return Promise.resolve();
    });
    await held;

    expect(events).toEqual(['other', 'slow']);
  });
});
