/**
 * Whether PromoBase's button is pinned to the toolbar. The icon highlight can
 * only be seen when it is (D-061). Undefined when Chrome does not say.
 */
export async function isPinned(): Promise<boolean | undefined> {
  try {
    const settings = await chrome.action.getUserSettings();
    return settings.isOnToolbar;
  } catch {
    return undefined;
  }
}
