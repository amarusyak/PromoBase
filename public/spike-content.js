/* global chrome */
// Spike only: detection method B. Registered at runtime for granted sites and
// reports the hostname, nothing else, so it can be compared with tabs.onUpdated.
(() => {
  const report = (reason) => {
    try {
      void chrome.runtime.sendMessage({ type: 'spike:content', reason, host: location.hostname });
    } catch {
      // The extension was reloaded while this page stayed open.
    }
  };
  report('load');
  addEventListener('pageshow', (event) => {
    if (event.persisted) report('bfcache-restore');
  });
})();
