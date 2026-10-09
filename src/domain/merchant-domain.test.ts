import { describe, expect, it } from 'vitest';
import { hostMatchesMerchant, isCanonicalMerchantDomain } from './merchant-domain';

describe('isCanonicalMerchantDomain', () => {
  it.each([
    'dropbox.com',
    'dropbox.co.uk',
    'mystore.myshopify.com',
    'xn--mnchen-3ya.de',
    'a-b.example.org',
    '4chan.org',
    'example.123abc',
    // Labels that only look numeric: the last one is not a number, so these are ordinary names.
    '0x7f.com',
    '123.com',
    'a.0xg',
    'shop.x0',
    // Form only: the Public Suffix List is not consulted on purpose.
    'www.dropbox.com',
    'co.uk',
  ])('accepts %s', (value) => {
    expect(isCanonicalMerchantDomain(value)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['whitespace', ' '],
    ['padded', ' dropbox.com '],
    ['upper case', 'Dropbox.com'],
    ['a single label', 'dropbox'],
    ['localhost', 'localhost'],
    ['a trailing dot', 'dropbox.com.'],
    ['a leading dot', '.dropbox.com'],
    ['an empty label', 'dropbox..com'],
    ['a scheme', 'https://dropbox.com'],
    ['a path', 'dropbox.com/plans'],
    ['a port', 'dropbox.com:8080'],
    ['a wildcard', '*.dropbox.com'],
    ['an underscore', 'drop_box.com'],
    ['a space inside', 'drop box.com'],
    ['a label starting with a hyphen', '-dropbox.com'],
    ['a label ending with a hyphen', 'dropbox-.com'],
    ['an unconverted international name', 'münchen.de'],
    ['an IPv4 address', '192.168.0.1'],
    ['an IPv4 address with hexadecimal parts', '0x7f.0x1'],
    ['an IPv4 address with a hexadecimal last part', '1.2.3.0x4'],
    ['an IPv4 address with a hexadecimal first part', '0x7f.1'],
    ['a shortened IPv4 address', '127.1'],
    ['an IPv4 address with octal parts', '0177.0.0.1'],
    ['a name ending in a hexadecimal number', 'example.0x1'],
    ['a name ending in a bare 0x', 'example.0x'],
    ['a label of 64 characters', `${'a'.repeat(64)}.com`],
    ['more than 253 characters', `${'a.'.repeat(126)}com`],
  ])('rejects %s', (_label, value) => {
    expect(isCanonicalMerchantDomain(value)).toBe(false);
  });

  it('accepts a label of exactly 63 characters and a name of exactly 253', () => {
    expect(isCanonicalMerchantDomain(`${'a'.repeat(63)}.com`)).toBe(true);
    const name253 = `${'a.'.repeat(125)}com`;
    expect(name253).toHaveLength(253);
    expect(isCanonicalMerchantDomain(name253)).toBe(true);
  });
});

// The rule above is written out, not delegated to the URL parser, so that what
// counts as readable saved data cannot shift with a browser update (D-070). These
// tests tie it to the parser all the same: they fail if the two ever disagree.
describe('isCanonicalMerchantDomain against the URL parser', () => {
  const parsedHost = (value: string): string | undefined => {
    try {
      return new URL(`http://${value}`).hostname;
    } catch {
      return undefined;
    }
  };
  const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

  it.each([
    ['0x7f.0x1', '127.0.0.1'],
    ['0x7f.1', '127.0.0.1'],
    ['127.1', '127.0.0.1'],
    ['0177.0.0.1', '127.0.0.1'],
    ['1.2.3.0x4', '1.2.3.4'],
    ['192.168.0.1', '192.168.0.1'],
    ['0xc0.0xa8.0x0.0x1', '192.168.0.1'],
    ['1.1', '1.0.0.1'],
  ])('rejects %s, which the parser reads as %s', (spelling, address) => {
    expect(parsedHost(spelling)).toBe(address);
    expect(isCanonicalMerchantDomain(spelling)).toBe(false);
  });

  it.each(['example.0x1', 'example.0x', 'a.b.0xff', 'shop.123'])(
    'rejects %s, which the parser refuses as a host',
    (value) => {
      expect(parsedHost(value)).toBeUndefined();
      expect(isCanonicalMerchantDomain(value)).toBe(false);
    },
  );

  it.each([
    'dropbox.com',
    'dropbox.co.uk',
    'mystore.myshopify.com',
    'xn--mnchen-3ya.de',
    'a-b.example.org',
    '4chan.org',
    '0x7f.com',
    '123.com',
    'a.0xg',
    'shop.x0',
    'www.dropbox.com',
  ])('accepts %s, which the parser leaves unchanged and does not read as an address', (value) => {
    expect(parsedHost(value)).toBe(value);
    expect(IPV4.test(parsedHost(value) ?? '')).toBe(false);
    expect(isCanonicalMerchantDomain(value)).toBe(true);
  });
});

describe('hostMatchesMerchant', () => {
  // PRD 8.3: which visited hosts belong to the merchant "dropbox.com".
  it.each([
    ['dropbox.com', true],
    ['www.dropbox.com', true],
    ['shop.dropbox.com', true],
    ['a.b.dropbox.com', true],
    ['WWW.Dropbox.COM', true],
    ['dropbox.com.', true],
    ['notdropbox.com', false],
    ['dropbox.com.example.org', false],
    ['dropbox.co.uk', false],
    ['dropbox.community', false],
    ['xdropbox.com', false],
    ['com', false],
    ['', false],
  ])('%s belongs to dropbox.com: %s', (host, expected) => {
    expect(hostMatchesMerchant(host, 'dropbox.com')).toBe(expected);
  });

  it('keeps stores on a shared platform apart (D-016)', () => {
    expect(hostMatchesMerchant('mystore.myshopify.com', 'mystore.myshopify.com')).toBe(true);
    expect(hostMatchesMerchant('checkout.mystore.myshopify.com', 'mystore.myshopify.com')).toBe(
      true,
    );
    expect(hostMatchesMerchant('otherstore.myshopify.com', 'mystore.myshopify.com')).toBe(false);
  });
});
