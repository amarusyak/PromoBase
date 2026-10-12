import { hostMatchesMerchant } from './merchant-domain';
import type { PromoCodeRecord } from './record';

/**
 * The host of a web page address, without a trailing dot. Undefined for
 * anything that is not an http or https page, such as the new tab page,
 * Chrome's settings, a local file or PromoBase's own pages.
 */
export function pageHost(address: string | undefined): string | undefined {
  if (address === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  const host = url.hostname.replace(/\.$/, '');
  return host === '' ? undefined : host;
}

/**
 * The saved records for the site this host belongs to: those whose merchant
 * domain is the host itself or one of its parent domains (PB-005), in the
 * order given.
 */
export function recordsForHost(
  records: readonly PromoCodeRecord[],
  host: string,
): PromoCodeRecord[] {
  return records.filter(
    (record) =>
      record.merchantDomain !== undefined && hostMatchesMerchant(host, record.merchantDomain),
  );
}

/**
 * Every merchant domain that has at least one saved record, once each and
 * sorted. The toolbar icon changes on these sites and their subdomains
 * (D-061, D-064), whatever the status of the codes: the popup says which are
 * upcoming or expired.
 */
export function highlightDomains(records: readonly PromoCodeRecord[]): string[] {
  const domains = new Set<string>();
  for (const record of records) {
    if (record.merchantDomain !== undefined) domains.add(record.merchantDomain);
  }
  return [...domains].sort();
}
