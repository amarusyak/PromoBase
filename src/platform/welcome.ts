/**
 * Opens the library in a new tab, where an empty library is the welcome view
 * (PB-001). Creating a tab needs no permission.
 */
export async function openWelcome(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
}
