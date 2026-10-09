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
