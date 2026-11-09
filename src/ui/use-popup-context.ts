import { useEffect, useState } from 'react';
import { onPopupOpened } from '../data/visit-reminders';
import { visitReminderDeps } from '../data/visit-reminders-deps';
import { pageHost } from '../domain/site-codes';
import { isPinned } from '../platform/action';
import { activeTab } from '../platform/tabs';

export interface PopupContext {
  /** The host of the page the popup was opened over; undefined when it is not a web page. */
  host: string | undefined;
  /** Whether PromoBase's button is pinned; undefined when Chrome does not say. */
  pinned: boolean | undefined;
  /** Opened by a visit reminder (PB-007), not by a click on the button. */
  automatic: boolean;
}

/** What the popup knows about where it was opened. Undefined until both reads finish. */
export function usePopupContext(): PopupContext | undefined {
  const [context, setContext] = useState<PopupContext>();

  useEffect(() => {
    let stopped = false;
    void (async () => {
      const [tab, pinned] = await Promise.all([activeTab(), isPinned()]);
      // Also answers a reminder waiting in this tab, so it does not open the
      // popup again once this one closes.
      const automatic =
        tab === undefined ? false : await onPopupOpened(visitReminderDeps(), tab.id);
      if (!stopped) setContext({ host: pageHost(tab?.url), pinned, automatic });
    })();
    return () => {
      stopped = true;
    };
  }, []);

  return context;
}
