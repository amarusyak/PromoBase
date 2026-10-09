// The merchant domain is the key that ties a saved code to a website (PB-005).
// This file holds the parts every context needs and has no dependencies, so the
// service worker never loads the Public Suffix List. Deriving a merchant domain
// from what a person typed is in derive-merchant-domain.ts.

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_HOST_LENGTH = 253;
// How the URL standard decides that a host "ends in a number": the last label is
// all digits, or "0x" followed by hexadecimal digits (possibly none). Browsers
// read every such host as an IPv4 address ("0x7f.0x1" is 127.0.0.1) or refuse
// it outright ("example.0x1"), so it can never be a domain.
const NUMERIC_LABEL = /^(\d+|0x[0-9a-f]*)$/;

/**
 * Whether a string is written the way PromoBase stores host names: lower-case
 * ASCII (international names in their xn-- form), at least two labels of valid
 * characters, no trailing dot, and not an IP address in any of the spellings a
 * browser accepts (decimal, octal or hexadecimal parts, and shortened forms).
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
  return !NUMERIC_LABEL.test(labels.at(-1) ?? '');
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
