import { describe, expect, it } from 'vitest';
import { deriveMerchantDomain, type DomainProblem } from './derive-merchant-domain';
import { hostMatchesMerchant, isCanonicalMerchantDomain } from './merchant-domain';

const accepted: [input: string, domain: string][] = [
  // PRD 8.3
  ['https://www.dropbox.com/plans', 'dropbox.com'],
  ['dropbox.com', 'dropbox.com'],
  ['shop.dropbox.com', 'dropbox.com'],
  ['dropbox.co.uk', 'dropbox.co.uk'],
  ['notdropbox.com', 'notdropbox.com'],
  ['dropbox.com.example.org', 'example.org'],
  // PB-005: scheme, port, path, query, fragment and subdomains are ignored
  ['http://dropbox.com', 'dropbox.com'],
  ['HTTPS://WWW.DROPBOX.COM/Plans', 'dropbox.com'],
  ['https://www.dropbox.com:8443/plans?ref=creator#pricing', 'dropbox.com'],
  ['www.dropbox.com/plans', 'dropbox.com'],
  ['dropbox.com:8080', 'dropbox.com'],
  ['//www.dropbox.com/plans', 'dropbox.com'],
  ['  https://www.dropbox.com/plans  ', 'dropbox.com'],
  ['a.b.c.dropbox.com', 'dropbox.com'],
  ['dropbox.com.', 'dropbox.com'],
  ['https://www.dropbox.com./plans', 'dropbox.com'],
  // Public Suffix List, ICANN section
  ['https://shop.example.co.uk/sale', 'example.co.uk'],
  ['www.example.com.au', 'example.com.au'],
  // Public Suffix List, private section (D-016): each site on a shared platform is its own merchant
  ['https://mystore.myshopify.com/products/1', 'mystore.myshopify.com'],
  ['https://checkout.mystore.myshopify.com', 'mystore.myshopify.com'],
  ['creator.github.io', 'creator.github.io'],
  ['https://www.creator.github.io/shop', 'creator.github.io'],
  // International names are stored in their xn-- form
  ['https://www.münchen.de/', 'xn--mnchen-3ya.de'],
  ['MÜNCHEN.de', 'xn--mnchen-3ya.de'],
  ['xn--mnchen-3ya.de', 'xn--mnchen-3ya.de'],
  ['https://приклад.укр/знижка', 'xn--80aikifvh.xn--j1amh'],
  // A suffix the list does not know falls back to the last two labels
  ['shop.example.newsuffix', 'example.newsuffix'],
];

const rejected: [input: string, problem: DomainProblem][] = [
  ['', 'empty'],
  ['   ', 'empty'],
  // Not a web address
  ['https://', 'not-a-web-address'],
  ['drop box.com', 'not-a-web-address'],
  ['https://*.dropbox.com', 'not-a-web-address'],
  ['*.dropbox.com', 'not-a-web-address'],
  ['drop_box.com', 'not-a-web-address'],
  // No dot, and a character a host cannot contain: the character decides, in
  // every URL parser. Chrome's keeps a space in the host as "%20"; Node's refuses it.
  ['drop_box', 'not-a-web-address'],
  ['seen in a video', 'not-a-web-address'],
  ['seen%20in%20a%20video', 'not-a-web-address'],
  ['two words', 'not-a-web-address'],
  ['https://dropbox..com', 'not-a-web-address'],
  ['-dropbox.com', 'not-a-web-address'],
  // Other schemes
  ['ftp://dropbox.com/file', 'unsupported-scheme'],
  ['file:///Users/me/coupon.html', 'unsupported-scheme'],
  ['mailto:deals@dropbox.com', 'unsupported-scheme'],
  ['javascript:alert(1)', 'unsupported-scheme'],
  ['chrome://extensions', 'unsupported-scheme'],
  ['chrome-extension://abcdefghijklmnop/popup.html', 'unsupported-scheme'],
  // A user part, including the classic deceptive form and plain email addresses
  ['https://user:secret@dropbox.com/', 'has-user-part'],
  ['https://dropbox.com@evil.example/', 'has-user-part'],
  ['deals@dropbox.com', 'has-user-part'],
  // IP addresses
  ['http://192.168.1.10/shop', 'ip-address'],
  ['192.168.1.10', 'ip-address'],
  ['127.0.0.1:3000', 'ip-address'],
  ['http://[::1]:8080/', 'ip-address'],
  ['http://2130706433/', 'ip-address'],
  ['0x7f.0x1', 'ip-address'],
  ['http://0x7f.0x1/shop', 'ip-address'],
  ['1.2.3.0x4', 'ip-address'],
  ['127.1', 'ip-address'],
  ['0177.0.0.1', 'ip-address'],
  ['example.0x1', 'not-a-web-address'],
  // Local names
  ['localhost', 'local-name'],
  ['http://localhost:3000/shop', 'local-name'],
  ['shop.localhost', 'local-name'],
  ['dropbox', 'local-name'],
  ['intranet/deals', 'local-name'],
  ['com', 'local-name'],
  // A shared suffix with no site name
  ['co.uk', 'public-suffix'],
  ['https://co.uk/', 'public-suffix'],
  ['github.io', 'public-suffix'],
  ['myshopify.com', 'public-suffix'],
];

describe('deriveMerchantDomain', () => {
  it.each(accepted)('reads %s as %s', (input, domain) => {
    expect(deriveMerchantDomain(input)).toEqual({ ok: true, domain });
  });

  it.each(rejected)('rejects %j as %s', (input, problem) => {
    expect(deriveMerchantDomain(input)).toEqual({ ok: false, problem });
  });

  it.each(accepted)('gives a result for %s that is canonical and stable', (input) => {
    const result = deriveMerchantDomain(input);
    const domain = result.ok ? result.domain : '';
    expect(isCanonicalMerchantDomain(domain)).toBe(true);
    // Deriving again from the result changes nothing.
    expect(deriveMerchantDomain(domain)).toEqual({ ok: true, domain });
  });

  it('never keeps a password or a path in the result', () => {
    const result = deriveMerchantDomain('https://www.dropbox.com/plans?token=abc123');
    expect(JSON.stringify(result)).not.toContain('abc123');
    expect(JSON.stringify(result)).not.toContain('plans');
  });
});

describe('derived domains and visit matching together (PRD 8.3)', () => {
  const saved = deriveMerchantDomain('https://www.dropbox.com/plans');
  const merchant = saved.ok ? saved.domain : '';

  it.each([
    ['www.dropbox.com', true],
    ['dropbox.com', true],
    ['shop.dropbox.com', true],
    ['dropbox.co.uk', false],
    ['notdropbox.com', false],
    ['dropbox.com.example.org', false],
  ])('a visit to %s reminds: %s', (host, expected) => {
    expect(hostMatchesMerchant(host, merchant)).toBe(expected);
  });
});
