/** "*://*.example.com/*" -> "example.com". Undefined for any other pattern shape. */
export function domainFromPattern(pattern: string): string | undefined {
  return /^\*:\/\/\*\.([^/*]+)\/\*$/.exec(pattern)?.[1];
}

/** Covers the domain and all its subdomains, over http and https. */
export function patternForDomain(domain: string): string {
  return `*://*.${domain}/*`;
}

export function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Hostname of an http(s) URL, otherwise undefined. */
export function hostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.hostname
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Spike only: the last two labels. Wrong for suffixes such as co.uk; stage 3
 * replaces it with Public Suffix List parsing (D-016).
 */
export function naiveDomain(host: string): string {
  return host.split('.').slice(-2).join('.');
}

/**
 * Reduces what a person typed (a bare host, or a full address with scheme, port
 * and path) to the domain to request access for. Undefined when no real host
 * can be read out of it. Spike only: uses naiveDomain.
 */
export function domainFromInput(input: string): string | undefined {
  const text = input.trim().toLowerCase();
  if (text === '') return undefined;
  let host: string;
  try {
    host = new URL(text.includes('://') ? text : `http://${text}`).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/\.$/, '');
  // At least two labels, made of the characters a host name can contain.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return undefined;
  return naiveDomain(host);
}
