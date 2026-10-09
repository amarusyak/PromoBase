import { parse } from 'tldts';
import { isCanonicalMerchantDomain } from './merchant-domain';

/** Why no merchant domain could be read out of an input. */
export type DomainProblem =
  /** Nothing but whitespace. */
  | 'empty'
  /** Not something a browser could open as a website. */
  | 'not-a-web-address'
  /** A scheme other than http or https, such as ftp:, mailto: or file:. */
  | 'unsupported-scheme'
  /** A user name or password before an @, which also covers email addresses. */
  | 'has-user-part'
  | 'ip-address'
  /** localhost or a one-word name that only works on a local network. */
  | 'local-name'
  /** A suffix shared by many unrelated sites, such as co.uk or github.io, with no site name. */
  | 'public-suffix';

export type DomainResult = { ok: true; domain: string } | { ok: false; problem: DomainProblem };

const NON_WEB_SCHEME =
  /^(mailto|tel|sms|javascript|data|file|about|blob|chrome|chrome-extension|view-source):/i;

/** What a host can consist of once the URL parser has lower-cased and converted it. */
const HOST_CHARACTERS = /^[a-z0-9.-]+$/;

function problem(reason: DomainProblem): DomainResult {
  return { ok: false, problem: reason };
}

/**
 * Reads the merchant domain out of what a person typed or pasted: a full
 * address or a bare site name (PB-005). The result is the registrable domain
 * according to the Public Suffix List, including its private section (D-016),
 * so "mystore.myshopify.com" is its own merchant and not all of myshopify.com.
 *
 * Scheme, port, path, query, fragment, a leading "www" and any other subdomain
 * are ignored. International names come back in their xn-- form, which is how
 * the browser reports them in tab addresses.
 */
export function deriveMerchantDomain(input: string): DomainResult {
  const text = input.trim();
  if (text === '') return problem('empty');

  let address: string;
  if (text.includes('://')) address = text;
  else if (NON_WEB_SCHEME.test(text)) return problem('unsupported-scheme');
  else address = `https://${text.replace(/^\/\//, '')}`;

  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return problem('not-a-web-address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return problem('unsupported-scheme');
  if (url.username !== '' || url.password !== '') return problem('has-user-part');

  // The URL parser has already lower-cased the host and converted international names.
  const host = url.hostname.replace(/\.$/, '');
  const parsed = parse(host, { allowPrivateDomains: true, extractHostname: false });
  if (parsed.isIp || host.startsWith('[')) return problem('ip-address');
  // URL parsers disagree about characters a host must not contain: for a space,
  // Chrome answers with "%20" in the host where Node refuses the address. Checking
  // the characters here gives the same reason everywhere, before the host is
  // looked at more closely.
  if (!HOST_CHARACTERS.test(host)) return problem('not-a-web-address');
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost')) {
    return problem('local-name');
  }
  // The suffix list does not validate characters, so "*.example.com" would pass it.
  if (!isCanonicalMerchantDomain(host)) return problem('not-a-web-address');
  if (parsed.domain === null) return problem('public-suffix');
  return { ok: true, domain: parsed.domain };
}
