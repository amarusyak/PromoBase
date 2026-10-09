import type { Lock } from './lock';

/** In-memory stand-in for webLock, for tests: one piece of work at a time, in order. */
export function serialLock(): Lock {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>) => {
    const run = last.then(work);
    // A failure belongs to whoever asked for that work; the queue itself carries on.
    last = run.catch(() => undefined);
    return run;
  };
}
