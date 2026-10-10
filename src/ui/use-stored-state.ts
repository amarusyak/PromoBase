import { useEffect, useState } from 'react';
import { loadStoredState, type LoadResult } from '../data/load-state';
import { STATE_KEY } from '../domain/stored-state';
import { chromeLocalStore } from '../platform/key-value-store';

/**
 * The persisted state, kept current: it is read again whenever any PromoBase
 * page changes it, so a save in the popup shows up in an open library tab
 * (PB-010). Undefined until the first read has finished.
 */
export function useStoredState(): LoadResult | undefined {
  const [result, setResult] = useState<LoadResult>();

  useEffect(() => {
    const store = chromeLocalStore();
    let latest = 0;
    let stopped = false;
    const load = () => {
      const request = ++latest;
      void loadStoredState(store).then((loaded) => {
        // Reads can finish out of order; only the newest one counts.
        if (!stopped && request === latest) setResult(loaded);
      });
    };
    load();
    const unsubscribe = store.subscribe(STATE_KEY, load);
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, []);

  return result;
}
