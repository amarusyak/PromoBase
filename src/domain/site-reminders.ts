import type { PromoCodeRecord } from './record';

/**
 * Reminders are switched per site (D-100): a site's switch is on while any of
 * its records has notify on, and turning it on or off sets every record for
 * that merchant domain. Opening automatically also needs Chrome's site access
 * for the domain (PB-006), which is asked for per site (one request may name
 * several, D-109) and never stored: whether it is there is always read from Chrome (D-014).
 */

/**
 * The site access PromoBase asks Chrome for, for one merchant domain: the
 * domain itself and all its subdomains, over http and https. Chrome's dialog
 * shows it as "all <domain> sites" (D-061, D-063).
 */
export function accessPattern(domain: string): string {
  return `*://*.${domain}/*`;
}

const PATTERN = /^\*:\/\/\*\.([^/*:]+)\/\*$/;

/**
 * The merchant domain of an access pattern in the shape PromoBase asks for.
 * Undefined for any other pattern, such as access the person gave in Chrome's
 * own menu, which PromoBase leaves alone.
 */
export function patternDomain(pattern: string): string | undefined {
  return PATTERN.exec(pattern)?.[1];
}

/** Whether the site's reminder switch is on. */
export function siteRemindersOn(records: readonly PromoCodeRecord[], domain: string): boolean {
  return records.some((record) => record.merchantDomain === domain && record.notify);
}

/** Every merchant domain whose reminder switch is on, once each and sorted. */
export function reminderDomains(records: readonly PromoCodeRecord[]): string[] {
  const domains = new Set<string>();
  for (const record of records) {
    if (record.notify && record.merchantDomain !== undefined) domains.add(record.merchantDomain);
  }
  return [...domains].sort();
}

/**
 * The access PromoBase should give back: patterns in its own shape for sites
 * whose switch is off, for example after the switch was turned off or the
 * site's last code was deleted (PB-011). Granted twice is given back once.
 */
export function accessToRemove(
  granted: readonly string[],
  records: readonly PromoCodeRecord[],
): string[] {
  const needed = new Set(reminderDomains(records));
  const remove = new Set<string>();
  for (const pattern of granted) {
    const domain = patternDomain(pattern);
    if (domain !== undefined && !needed.has(domain)) remove.add(pattern);
  }
  return [...remove].sort();
}

/**
 * Where a site's reminders stand: off; on; or switched on while Chrome has not
 * given access, because the person declined Chrome's question or removed the
 * access in Chrome's menu (D-058).
 */
export type SiteReminderState = 'off' | 'on' | 'needs-access';

export function siteReminderState(
  records: readonly PromoCodeRecord[],
  domain: string,
  hasAccess: boolean,
): SiteReminderState {
  if (!siteRemindersOn(records, domain)) return 'off';
  return hasAccess ? 'on' : 'needs-access';
}
