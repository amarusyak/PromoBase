import { accessPattern } from '../domain/site-reminders';

/**
 * Chrome's site access, per merchant domain (PB-006); one request may name
 * several (D-109). What PromoBase
 * has is always read from Chrome, never stored (D-014): the person can take it
 * away in Chrome's own menu at any moment.
 */
export interface SiteAccess {
  /** Whether PromoBase may see pages of the site and its subdomains. */
  has(domain: string): Promise<boolean>;
  /**
   * Asks Chrome, which shows its dialog unless the person allowed this before
   * (D-063). Only works during a click or key press in the calling page
   * (D-058). In the popup the dialog closes the popup, so nothing may be left
   * to do after this call (D-057).
   */
  request(domain: string): Promise<AccessAnswer>;
  /**
   * Asks for several sites in one Chrome dialog, which lists them all. The
   * same rules as request apply.
   */
  requestAll(domains: readonly string[]): Promise<AccessAnswer>;
  /** Every site access pattern PromoBase holds, in any shape. */
  granted(): Promise<string[]>;
  /** Gives the patterns back. */
  remove(patterns: readonly string[]): Promise<void>;
  /** Calls the listener whenever access is added or removed, from anywhere. */
  subscribe(listener: () => void): () => void;
}

/** `failed`: Chrome refused to ask, for example because the click was too long ago. */
export type AccessAnswer = 'granted' | 'declined' | 'failed';

export const chromeSiteAccess: SiteAccess = {
  async has(domain) {
    try {
      return await chrome.permissions.contains({ origins: [accessPattern(domain)] });
    } catch {
      return false;
    }
  },
  async request(domain) {
    try {
      return (await chrome.permissions.request({ origins: [accessPattern(domain)] }))
        ? 'granted'
        : 'declined';
    } catch {
      return 'failed';
    }
  },
  async requestAll(domains) {
    try {
      return (await chrome.permissions.request({ origins: domains.map(accessPattern) }))
        ? 'granted'
        : 'declined';
    } catch {
      return 'failed';
    }
  },
  async granted() {
    return (await chrome.permissions.getAll()).origins ?? [];
  },
  async remove(patterns) {
    if (patterns.length === 0) return;
    await chrome.permissions.remove({ origins: [...patterns] });
  },
  subscribe(listener) {
    const changed = () => listener();
    chrome.permissions.onAdded.addListener(changed);
    chrome.permissions.onRemoved.addListener(changed);
    return () => {
      chrome.permissions.onAdded.removeListener(changed);
      chrome.permissions.onRemoved.removeListener(changed);
    };
  },
};
