import { useEffect, useState } from 'react';
import { pageHost } from '../domain/site-codes';
import { isPinned } from '../platform/action';
import { activeTabAddress } from '../platform/tabs';

export interface PopupContext {
  /** The host of the page the popup was opened over; undefined when it is not a web page. */
  host: string | undefined;
  /** Whether PromoBase's button is pinned; undefined when Chrome does not say. */
  pinned: boolean | undefined;
}

/** What the popup knows about where it was opened. Undefined until both reads finish. */
export function usePopupContext(): PopupContext | undefined {
  const [context, setContext] = useState<PopupContext>();

  useEffect(() => {
    let stopped = false;
    void Promise.all([activeTabAddress(), isPinned()]).then(([address, pinned]) => {
      if (!stopped) setContext({ host: pageHost(address), pinned });
    });
    return () => {
      stopped = true;
    };
  }, []);

  return context;
}
