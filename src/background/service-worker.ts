// Background entry point. Site-visit detection and reminder permission
// reconciliation (D-013) will live here; for now it only reports its lifecycle,
// which is visible under "Inspect views: service worker" on chrome://extensions.
chrome.runtime.onInstalled.addListener((details) => {
  console.info(`PromoBase ${chrome.runtime.getManifest().version}: ${details.reason}`);
});
