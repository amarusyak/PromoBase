// Background entry point. On this branch it only hosts the reminder spike (D-028).
import '../spike/background';

chrome.runtime.onInstalled.addListener((details) => {
  console.info(`PromoBase ${chrome.runtime.getManifest().version}: ${details.reason}`);
});
