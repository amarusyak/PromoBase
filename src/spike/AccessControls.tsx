import { useState } from 'react';
import { patternForDomain } from './domains';
import { logEvent, type SpikeSource } from './log';
import { describeError } from './store';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Requests site access three ways, to find out when Chrome still accepts the
 * call as user-initiated (D-011) and whether the dialog closes the popup (D-015).
 */
export function AccessControls({
  source,
  suggestedDomain = '',
}: {
  source: Extract<SpikeSource, 'popup' | 'library'>;
  suggestedDomain?: string;
}) {
  const [domain, setDomain] = useState(suggestedDomain);
  const [result, setResult] = useState('');

  const cleaned = domain.trim().toLowerCase();
  const origins = [patternForDomain(cleaned)];

  function report(variant: string, outcome: Promise<boolean>) {
    void outcome
      .then(
        (granted) => {
          setResult(`${variant}: ${granted ? 'granted' : 'not granted'}`);
          return logEvent(source, 'permissions.request:resolved', { variant, granted, origins });
        },
        (error: unknown) => {
          const message = describeError(error);
          setResult(`${variant}: error - ${message}`);
          return logEvent(source, 'permissions.request:rejected', { variant, message, origins });
        },
      )
      .catch(() => undefined);
  }

  // Nothing runs before the request: the click's user gesture is intact.
  function requestDirect() {
    const outcome = chrome.permissions.request({ origins });
    void logEvent(source, 'permissions.request:called', { variant: 'direct', origins });
    report('direct', outcome);
  }

  function requestAfterWrite() {
    report(
      'after-awaited-write',
      (async () => {
        await chrome.storage.local.set({ 'spike.scratch': Date.now() });
        return chrome.permissions.request({ origins });
      })(),
    );
  }

  function requestAfterDelay() {
    setResult('after-6s-delay: waiting 6 seconds...');
    report(
      'after-6s-delay',
      (async () => {
        await wait(6000);
        return chrome.permissions.request({ origins });
      })(),
    );
  }

  function removeAccess() {
    void chrome.permissions.remove({ origins }).then(
      (removed) => {
        setResult(`remove: ${removed ? 'removed' : 'nothing removed'}`);
        return logEvent(source, 'permissions.remove:resolved', { removed, origins });
      },
      (error: unknown) => setResult(`remove: error - ${describeError(error)}`),
    );
  }

  return (
    <div className="spike__access">
      <label>
        Site to request access for
        <input
          type="text"
          value={domain}
          placeholder="example.com"
          spellCheck={false}
          onChange={(event) => setDomain(event.target.value)}
        />
      </label>
      <div className="spike__buttons">
        <button type="button" disabled={cleaned === ''} onClick={requestDirect}>
          Request access
        </button>
        <button type="button" disabled={cleaned === ''} onClick={requestAfterWrite}>
          Request after a storage write
        </button>
        <button type="button" disabled={cleaned === ''} onClick={requestAfterDelay}>
          Request after 6 s
        </button>
        <button type="button" disabled={cleaned === ''} onClick={removeAccess}>
          Remove access
        </button>
      </div>
      <p className="spike__result" role="status">
        {result}
      </p>
    </div>
  );
}
