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
