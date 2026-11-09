/**
 * The tab, window and toolbar calls the automatic reminder needs (D2b), kept
 * behind an interface so the logic can be unit tested (D-031).
 */
export interface TabInfo {
  id: number;
  /**
   * The page address. Chrome fills it in only for sites PromoBase has access
   * to (D-049); on every other page it is undefined.
   */
  url: string | undefined;
  active: boolean;
  windowId: number;
}

export interface BrowserTabs {
  /** Undefined when the tab no longer exists. */
  get(tabId: number): Promise<TabInfo | undefined>;
  activeTab(windowId: number): Promise<TabInfo | undefined>;
  /** Tabs that have not finished loading, such as tabs being restored at startup. */
  loadingTabs(): Promise<number[]>;
  /** Whether the window has the focus, which also means Chrome is in front (D-059). */
  windowFocused(windowId: number): Promise<boolean>;
  /** Sets the badge on this tab's toolbar button; '' clears it. Ignores a closed tab. */
  setBadge(tabId: number, text: string): Promise<void>;
  /** Opens PromoBase's popup over the window's active tab (Chrome 127+). Rejects if it cannot. */
  openPopup(windowId: number): Promise<void>;
}

function toInfo(tab: chrome.tabs.Tab | undefined): TabInfo | undefined {
  if (tab?.id === undefined) return undefined;
  return { id: tab.id, url: tab.url, active: tab.active, windowId: tab.windowId };
}

export const chromeBrowserTabs: BrowserTabs = {
  async get(tabId) {
    try {
      return toInfo(await chrome.tabs.get(tabId));
    } catch {
      return undefined;
    }
  },
  async activeTab(windowId) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      return toInfo(tab);
    } catch {
      return undefined;
    }
  },
  async loadingTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.flatMap((tab) =>
      tab.id !== undefined && tab.status !== 'complete' ? [tab.id] : [],
    );
  },
  async windowFocused(windowId) {
    try {
      return (await chrome.windows.get(windowId)).focused;
    } catch {
      return false;
    }
  },
  async setBadge(tabId, text) {
    try {
      await chrome.action.setBadgeText({ tabId, text });
      if (text !== '') await chrome.action.setBadgeBackgroundColor({ tabId, color: '#14213d' });
    } catch {
      // The tab is gone.
    }
  },
  async openPopup(windowId) {
    await chrome.action.openPopup({ windowId });
  },
};
