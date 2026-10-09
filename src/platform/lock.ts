/**
 * Runs pieces of work one at a time, in the order they were asked for, and
 * resolves or rejects with the outcome of the work.
 */
export type Lock = <T>(work: () => Promise<T>) => Promise<T>;

/**
 * A lock shared by every PromoBase page and the service worker, so two of them
 * can never change stored data at the same moment (D-053). The browser releases
 * it by itself when the work finishes or when the page holding it goes away.
 */
export function webLock(name: string): Lock {
  return <T>(work: () => Promise<T>) =>
    // The cast only undoes the Awaited<> in the library typing; work() already returns a promise.
    navigator.locks.request(name, work) as Promise<T>;
}
