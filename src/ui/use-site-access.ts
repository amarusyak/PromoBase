import { useEffect, useState } from 'react';
import { chromeSiteAccess } from '../platform/site-access';

/**
 * Whether PromoBase has Chrome's access to each of these sites, read from
 * Chrome and read again whenever access changes anywhere (D-014), for example
 * after Chrome's dialog or in Chrome's own menu. Undefined until the first
 * read has finished.
 */
export function useSiteAccess(
  domains: readonly string[],
): ReadonlyMap<string, boolean> | undefined {
  const key = [...new Set(domains)].sort().join(' ');
  const [access, setAccess] = useState<{ key: string; map: ReadonlyMap<string, boolean> }>();

  useEffect(() => {
    const wanted = key === '' ? [] : key.split(' ');
    let latest = 0;
    let stopped = false;
    const read = () => {
      const request = ++latest;
      void Promise.all(wanted.map((domain) => chromeSiteAccess.has(domain))).then((answers) => {
        if (stopped || request !== latest) return;
        setAccess({
          key,
          map: new Map(wanted.map((domain, index) => [domain, answers[index] ?? false])),
        });
      });
    };
    read();
    const unsubscribe = chromeSiteAccess.subscribe(read);
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [key]);

  // A read for an earlier list of sites does not answer for this one.
  return access?.key === key ? access.map : undefined;
}
