import { useEffect, useState } from 'react';
import { PASSIVE_KEY, PASSIVE_REQUEST } from './background-keys';
import { domainFromInput } from './domains';
import { logEvent } from './log';
import { applyPassiveDomains } from './passive';
import { describeError, getLocal } from './store';

/**
 * D-061: highlights the toolbar icon on chosen sites with no site access and no
 * Chrome dialog. The worker registers the rule, as it would in the product; if
 * it cannot, this page tries, to show whether the limit is specific to workers.
 */
export function PassiveControls() {
  const [input, setInput] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [result, setResult] = useState('');

  useEffect(() => {
    void getLocal<string[]>(PASSIVE_KEY).then((stored) => setDomains(stored ?? []));
  }, []);

  const target = domainFromInput(input);

  function apply(next: string[]) {
    void (async () => {
      await chrome.storage.local.set({ [PASSIVE_KEY]: next });
      setDomains(next);
      let workerFailure: string | null;
      try {
        const reply: unknown = await chrome.runtime.sendMessage({
          type: PASSIVE_REQUEST,
          domains: next,
        });
        workerFailure = typeof reply === 'string' ? reply : null;
      } catch (error) {
        workerFailure = describeError(error);
      }
      if (workerFailure === null) {
        setResult(next.length > 0 ? `Icon changes on: ${next.join(', ')}` : 'Highlights cleared.');
        return;
      }
      const pageFailure = await applyPassiveDomains(next);
      await logEvent(
        'library',
        pageFailure === undefined ? 'passive:rule-set-from-page' : 'passive:rule-error-from-page',
        { domains: next, workerFailure, ...(pageFailure === undefined ? {} : { pageFailure }) },
      );
      setResult(
        pageFailure === undefined
          ? `The worker could not set it (${workerFailure}); this page did.`
          : `Failed in the worker (${workerFailure}) and in this page (${pageFailure}).`,
      );
    })();
  }

  return (
    <div className="spike__access">
      <label>
        Site to highlight the icon on, with no site access
        <input
          type="text"
          value={input}
          placeholder="example.com"
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>
      <div className="spike__buttons">
        <button
          type="button"
          disabled={target === undefined}
          onClick={() => {
            if (target !== undefined) apply([...new Set([...domains, target])]);
          }}
        >
          Highlight icon on this site
        </button>
        <button type="button" disabled={domains.length === 0} onClick={() => apply([])}>
          Clear highlights
        </button>
      </div>
      <p className="spike__result" role="status">
        {result || (domains.length > 0 ? `Icon changes on: ${domains.join(', ')}` : '')}
      </p>
    </div>
  );
}

/**
 * D-059: loads a granted site a few seconds from now, leaving time to switch to
 * another app first. Shows what a reminder does when Chrome is really in the
 * background, which `open -g` could not, because Chrome came forward by itself.
 */
export function DelayedOpen({ domains }: { domains: string[] }) {
  const [notice, setNotice] = useState('');
  const domain = domains[0];

  function schedule(how: 'new-tab' | 'this-tab') {
    if (domain === undefined) return;
    const url = `https://${domain}/`;
    setNotice(`Loading ${domain} in 5 seconds. Switch to another app now and wait there.`);
    void logEvent('library', 'delayed-open:scheduled', { domain, how });
    setTimeout(() => {
      if (how === 'new-tab') void chrome.tabs.create({ url });
      else window.location.href = url;
    }, 5000);
  }

  return (
    <div className="spike__access">
      <p>Load a granted site while Chrome is in the background</p>
      <div className="spike__buttons">
        <button type="button" disabled={domain === undefined} onClick={() => schedule('new-tab')}>
          Open {domain ?? 'a granted site'} in a new tab in 5 s
        </button>
        <button type="button" disabled={domain === undefined} onClick={() => schedule('this-tab')}>
          Send this tab there in 5 s
        </button>
      </div>
      <p className="spike__result" role="status">
        {notice}
      </p>
    </div>
  );
}
