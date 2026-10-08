import { useCallback, useEffect, useState } from 'react';
import { AccessControls } from './AccessControls';
import {
  AUTO_OPEN_KEY,
  COUNTERS_KEY,
  MODE_KEY,
  VISITS_KEY,
  type ReminderMode,
  type Visits,
} from './background-keys';
import { LOG_KEY, logEvent, type SpikeEvent } from './log';
import { getLocal, getSession } from './store';

interface Snapshot {
  mode: ReminderMode;
  grantedOrigins: string[];
  contentScriptMatches: string[];
  counters: Record<string, number>;
  log: SpikeEvent[];
}

async function takeSnapshot(): Promise<Snapshot> {
  const { origins = [] } = await chrome.permissions.getAll();
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return {
    mode: (await getLocal<ReminderMode>(MODE_KEY)) ?? 'guarded',
    grantedOrigins: origins,
    contentScriptMatches: scripts.flatMap((script) => script.matches ?? []),
    counters: (await getSession<Record<string, number>>(COUNTERS_KEY)) ?? {},
    log: (await getLocal<SpikeEvent[]>(LOG_KEY)) ?? [],
  };
}

/** The text that gets copied and pasted back: one header line, then one JSON line per event. */
function exportText(snapshot: Snapshot): string {
  const header = {
    kind: 'promobase-spike-log',
    extensionVersion: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    mode: snapshot.mode,
    grantedOrigins: snapshot.grantedOrigins,
    contentScriptMatches: snapshot.contentScriptMatches,
    counters: snapshot.counters,
  };
  return [header, ...snapshot.log].map((line) => JSON.stringify(line)).join('\n');
}

/** Settings, site access and the event log for the reminder spike. */
export function SpikeLibraryPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [notice, setNotice] = useState('');

  const refresh = useCallback(() => {
    void takeSnapshot().then(setSnapshot);
  }, []);

  useEffect(() => {
    refresh();
    chrome.storage.onChanged.addListener(refresh);
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);
    return () => {
      chrome.storage.onChanged.removeListener(refresh);
      chrome.permissions.onAdded.removeListener(refresh);
      chrome.permissions.onRemoved.removeListener(refresh);
    };
  }, [refresh]);

  if (snapshot === undefined) return null;
  const text = exportText(snapshot);

  function setMode(mode: ReminderMode) {
    void chrome.storage.local
      .set({ [MODE_KEY]: mode })
      .then(() => logEvent('library', 'mode:set', { mode }));
  }

  function copyLog() {
    navigator.clipboard.writeText(text).then(
      () => setNotice(`Copied ${snapshot?.log.length ?? 0} events.`),
      () => setNotice('Copy failed. Select the text below and copy it by hand.'),
    );
  }

  function clearLog() {
    void chrome.storage.local.remove(LOG_KEY).then(() => setNotice('Log cleared.'));
  }

  // Forgets which tabs were reminded or are waiting, as if every visit were new.
  function resetVisits() {
    void (async () => {
      const visits = await getSession<Visits>(VISITS_KEY);
      const tabIds = Object.keys({ ...visits?.reminded, ...visits?.pending }).map(Number);
      await Promise.allSettled(
        tabIds.map((tabId) => chrome.action.setBadgeText({ tabId, text: '' })),
      );
      await chrome.storage.session.remove([VISITS_KEY, AUTO_OPEN_KEY, COUNTERS_KEY]);
      await logEvent('library', 'visits:reset');
      setNotice('Visit state reset.');
    })();
  }

  return (
    <section className="spike" aria-labelledby="spike-title">
      <h2 id="spike-title">Reminder spike</h2>

      <fieldset className="spike__mode">
        <legend>When a granted site is detected</legend>
        <label>
          <input
            type="radio"
            name="mode"
            checked={snapshot.mode === 'guarded'}
            onChange={() => setMode('guarded')}
          />
          Guarded: open the popup only on the active tab of a focused window, otherwise wait
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={snapshot.mode === 'always'}
            onChange={() => setMode('always')}
          />
          Always: call openPopup regardless, to record what Chrome does
        </label>
      </fieldset>

      <AccessControls source="library" />

      <dl className="spike__facts">
        <dt>Granted sites</dt>
        <dd>{snapshot.grantedOrigins.join(', ') || 'none'}</dd>
        <dt>Content script registered for</dt>
        <dd>{snapshot.contentScriptMatches.join(', ') || 'none'}</dd>
        <dt>Page loads PromoBase could not see</dt>
        <dd>{snapshot.counters.completeWithoutUrlAccess ?? 0}</dd>
      </dl>

      <div className="spike__buttons">
        <button type="button" onClick={copyLog}>
          Copy log
        </button>
        <button type="button" onClick={clearLog}>
          Clear log
        </button>
        <button type="button" onClick={resetVisits}>
          Reset visit state
        </button>
      </div>
      <p className="spike__result" role="status">
        {notice}
      </p>
      <textarea
        className="spike__log"
        readOnly
        value={text}
        rows={18}
        aria-label={`Event log, ${snapshot.log.length} events`}
      />
    </section>
  );
}
