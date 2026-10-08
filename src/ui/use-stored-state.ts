import { useEffect, useState } from 'react';
import { loadStoredState, type LoadResult } from '../data/load-state';
import { chromeLocalStore } from '../platform/key-value-store';

/** Loads the persisted state once. Undefined until the read has finished. */
export function useStoredState(): LoadResult | undefined {
  const [result, setResult] = useState<LoadResult>();

  useEffect(() => {
    let cancelled = false;
    void loadStoredState(chromeLocalStore()).then((loaded) => {
      if (!cancelled) setResult(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
