import { useEffect, useState } from 'react';
import { AccessControls } from './AccessControls';
import { AUTO_OPEN_KEY, POPUP_PORT } from './background-keys';
import { domainFromPattern, hostMatchesDomain, hostOf, naiveDomain } from './domains';
import { logEvent } from './log';
import { ManifestGuard } from './ManifestGuard';
import { getSession } from './store';

interface PopupContext {
  trigger: 'automatic' | 'click';
  host: string | undefined;
  matched: string | undefined;
}

/** Shows what the popup can see about the tab it opened on, and logs how it was opened. */
export function SpikePopupPanel() {
  return (
    <ManifestGuard source="popup">
      <PopupPanel />
    </ManifestGuard>
  );
}

function PopupPanel() {
  const [context, setContext] = useState<PopupContext>();

  useEffect(() => {
    const port = chrome.runtime.connect({ name: POPUP_PORT });
    // Clicks and focus changes inside the popup, to see what keeps a user gesture
    // alive and whether a popup opened behind another app ever gets focus.
    const onPointerDown = () => void logEvent('popup', 'popup:pointerdown');
    const onFocus = () => void logEvent('popup', 'popup:window-focus');
    const onBlur = () => void logEvent('popup', 'popup:window-blur');
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const autoOpen = await getSession<{ tabId: number; t: number }>(AUTO_OPEN_KEY);
      const trigger =
        autoOpen !== undefined && autoOpen.tabId === tab?.id && Date.now() - autoOpen.t < 3000
          ? 'automatic'
          : 'click';
      const host = hostOf(tab?.url);
      const { origins = [] } = await chrome.permissions.getAll();
      const matched =
        host === undefined
          ? undefined
          : origins
              .map(domainFromPattern)
              .find((domain) => domain !== undefined && hostMatchesDomain(host, domain));
      await logEvent('popup', 'popup:opened', {
        trigger,
        tabId: tab?.id ?? null,
        urlVisible: tab?.url !== undefined,
        host: host ?? null,
        matched: matched ?? null,
        documentFocused: document.hasFocus(),
      });
      setContext({ trigger, host, matched });
    })();
    return () => {
      port.disconnect();
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  if (context === undefined) return null;

  return (
    <section className="spike" aria-label="Reminder spike">
      <h2>Reminder spike</h2>
      <dl className="spike__facts">
        <dt>Opened</dt>
        <dd>{context.trigger === 'automatic' ? 'automatically' : 'by click'}</dd>
        <dt>This tab</dt>
        <dd>{context.host ?? 'address not visible to PromoBase'}</dd>
        <dt>Reminder match</dt>
        <dd>{context.matched ?? 'none'}</dd>
      </dl>
      <AccessControls
        source="popup"
        suggestedDomain={context.host === undefined ? '' : naiveDomain(context.host)}
      />
    </section>
  );
}
