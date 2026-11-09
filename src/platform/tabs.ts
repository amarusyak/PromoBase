/**
 * The tab the popup was opened over. Chrome shares its address only on a site
 * PromoBase has access to, or because the person clicked PromoBase's toolbar
 * button on that tab (activeTab, D-008); otherwise the address is undefined.
 * Nothing is kept or sent anywhere.
 */
export async function activeTab(): Promise<{ id: number; url: string | undefined } | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id === undefined ? undefined : { id: tab.id, url: tab.url };
  } catch {
    return undefined;
  }
}
