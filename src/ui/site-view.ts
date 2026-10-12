import { deriveMerchantDomain } from '../domain/derive-merchant-domain';
import { readableDomain } from '../domain/readable-domain';

/** The popup's three tabs (D-092). */
export type PopupTab = 'site' | 'all' | 'add';

/** The tab the popup opens on: this site's codes when it has any, else the form (D-092). */
export function openingTab(codesForThisSite: number): PopupTab {
  return codesForThisSite > 0 ? 'site' : 'add';
}

/** How the popup refers to the site of the current tab. */
export interface SiteLabel {
  /** What a person recognises, for example "dropbox.com" or "münchen.de". */
  name: string;
  /**
   * The merchant domain a code saved for this site would get, in the form the
   * address field accepts. Undefined where no code can be saved for the site,
   * such as an IP address or a shared suffix.
   */
  address?: string;
}

/**
 * Names the site of a page host by its merchant domain, so that
 * "www.dropbox.com" and "help.dropbox.com" both read "dropbox.com". Falls
 * back to the host itself where there is no merchant domain.
 */
export function siteLabel(host: string): SiteLabel {
  const derived = deriveMerchantDomain(host);
  if (!derived.ok) return { name: readableDomain(host) };
  const name = readableDomain(derived.domain);
  return { name, address: name };
}
