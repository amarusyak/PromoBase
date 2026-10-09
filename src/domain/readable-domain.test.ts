import { describe, expect, it } from 'vitest';
import { deriveMerchantDomain } from './derive-merchant-domain';
import { readableDomain } from './readable-domain';

describe('readableDomain', () => {
  // Pairs as the URL parser of Chrome and Node produces them.
  it.each([
    ['xn--mnchen-3ya.de', 'münchen.de'],
    ['xn--bcher-kva.example', 'bücher.example'],
    ['xn--maana-pta.com', 'mañana.com'],
    ['xn--80akhbyknj4f.xn--p1ai', 'испытание.рф'],
    ['xn--fsqu00a.xn--0zwm56d', '例子.测试'],
    ['xn--zckzah.jp', 'テスト.jp'],
    ['xn--9t4b11yi5a.kr', '테스트.kr'],
    ['xn--hxajbheg2az3al.gr', 'παράδειγμα.gr'],
    ['xn--strae-oqa.de', 'straße.de'],
    ['xn--tda.de', 'ü.de'],
    ['xn--vi8h.ws', '🍕.ws'],
    // A hyphen that belongs to the name, next to the one Punycode adds.
    ['a-b.xn----dhab.com', 'a-b.ü-ü.com'],
    ['xn--caf-mnchen-d7a4u.example', 'café-münchen.example'],
    // Only the encoded labels change.
    ['shop.xn--mnchen-3ya.de', 'shop.münchen.de'],
  ])('reads %s as %s', (stored, readable) => {
    expect(readableDomain(stored)).toBe(readable);
  });

  it.each([
    'dropbox.com',
    'example.co.uk',
    'mystore.myshopify.com',
    'a-b.example.org',
    '4chan.org',
  ])('returns %s unchanged', (domain) => {
    expect(readableDomain(domain)).toBe(domain);
  });

  it.each([
    ['nothing after the prefix', 'xn--.com'],
    ['a character that is not a Punycode digit', 'xn--mnchen_3ya.de'],
    ['an upper-case digit, which a stored domain never has', 'xn--MNCHEN-3YA.de'],
    ['a number that runs off the end', 'xn--mnchen-3y.de'],
    ['a code point beyond the last one', 'xn--99999999999.com'],
  ])('leaves a label with %s as it is', (_label, domain) => {
    expect(readableDomain(domain)).toBe(domain);
  });

  // The browser turns a readable name into the stored form; this is the way back.
  // Names are written the way the browser normalises them: lower case, composed.
  it.each([
    'münchen.de',
    'пример.com',
    '日本語.jp',
    'éa.example',
    'zürich-café.example',
    'ñandú.example',
    'ελληνικά.gr',
    'עברית.example',
    'ไทย.example',
    'a.b.ü.example',
  ])('undoes what the URL parser does to %s', (name) => {
    const stored = new URL(`https://${name}/`).hostname;
    expect(stored).toContain('xn--');
    expect(readableDomain(stored)).toBe(name);
  });

  it('gives the readable form of a derived merchant domain', () => {
    const derived = deriveMerchantDomain('https://www.München.de/angebote');
    expect(derived.ok && readableDomain(derived.domain)).toBe('münchen.de');
  });
});
