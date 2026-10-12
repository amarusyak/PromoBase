/**
 * The address of the tab the popup was opened over. Chrome shares it only
 * because the person clicked PromoBase's toolbar button on that tab
 * (activeTab, D-008); otherwise the address is hidden and this resolves to
 * undefined. Nothing is kept or sent anywhere.
 */
export async function activeTabAddress(): Promise<string | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url;
  } catch {
    return undefined;
  }
}
