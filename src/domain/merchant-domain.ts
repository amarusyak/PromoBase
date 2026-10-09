// The merchant domain is the key that ties a saved code to a website (PB-005).
// This file holds the parts every context needs and has no dependencies, so the
// service worker never loads the Public Suffix List. Deriving a merchant domain
// from what a person typed is in derive-merchant-domain.ts.

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_HOST_LENGTH = 253;

/**
 * Whether a string is written the way PromoBase stores host names: lower-case
 * ASCII (international names in their xn-- form), at least two labels of valid
 * characters, no trailing dot, and not an IP address.
 *
 * This is a check of form only. It deliberately does not ask the Public Suffix
 * List whether the name is a registrable domain: that list changes with every
 * update, and a stored record must not become unreadable because it did.
 */
export function isCanonicalMerchantDomain(value: string): boolean {
  if (value.length === 0 || value.length > MAX_HOST_LENGTH) return false;
  const labels = value.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((label) => LABEL.test(label))) return false;
  // A last label made only of digits is the end of an IPv4 address, not a domain.
  return !/^\d+$/.test(labels.at(-1) ?? '');
}

/**
 * Whether a visited host belongs to a merchant: the domain itself or any of its
 * subdomains, compared on label boundaries. "notdropbox.com" and
 * "dropbox.com.example.org" do not belong to "dropbox.com".
 */
export function hostMatchesMerchant(host: string, merchantDomain: string): boolean {
  const visited = host.toLowerCase().replace(/\.$/, '');
  return visited === merchantDomain || visited.endsWith(`.${merchantDomain}`);
}
