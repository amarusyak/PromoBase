import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { highlightDomains, pageHost, recordsForHost } from './site-codes';

describe('pageHost', () => {
  it.each([
    ['https://www.dropbox.com/plans?ref=x#top', 'www.dropbox.com'],
    ['http://shop.example.co.uk/', 'shop.example.co.uk'],
    ['https://Example.ORG/', 'example.org'],
    ['https://example.org./cart', 'example.org'],
    ['https://example.org:8443/', 'example.org'],
    ['https://user:secret@example.org/', 'example.org'],
    // Chrome reports international names in their xn-- form, as they are stored.
    ['https://www.xn--mnchen-3ya.de/', 'www.xn--mnchen-3ya.de'],
    ['https://www.münchen.de/', 'www.xn--mnchen-3ya.de'],
    ['http://192.168.0.1/', '192.168.0.1'],
  ])('reads %s as %s', (address, host) => {
    expect(pageHost(address)).toBe(host);
  });

  it.each([
    ['no address (the tab cannot be seen)', undefined],
    ['an empty address', ''],
    ['the new tab page', 'chrome://newtab/'],
    ['Chrome settings', 'chrome://settings/'],
    ["PromoBase's own page", 'chrome-extension://abcdefghijklmnop/library.html'],
    ['a local file', 'file:///Users/someone/codes.txt'],
    ['a file on a network share, which has a host', 'file://fileserver/share/codes.txt'],
    ['a blank page', 'about:blank'],
    ['a data address', 'data:text/html,hello'],
    ['an ftp address', 'ftp://example.org/'],
    ['text that is not an address', 'dropbox.com'],
  ])('gives nothing for %s', (_label, address) => {
    expect(pageHost(address)).toBeUndefined();
  });
});

describe('recordsForHost', () => {
  const dropbox = sampleRecord({ id: 'a', promoCode: 'CLOUD25', merchantDomain: 'dropbox.com' });
  const shoes = sampleRecord({
    id: 'b',
    promoCode: 'RUN10',
    merchantDomain: 'example-shoes.co.uk',
  });
  const dropboxToo = sampleRecord({ id: 'c', promoCode: 'TEAM5', merchantDomain: 'dropbox.com' });
  const noSite = sampleRecord({ id: 'd', promoCode: 'WELCOME10' });
  const records = [dropbox, shoes, dropboxToo, noSite];
  const codes = (host: string) => recordsForHost(records, host).map((record) => record.promoCode);

  it.each([
    ['the domain itself', 'dropbox.com', ['CLOUD25', 'TEAM5']],
    ['a subdomain', 'www.dropbox.com', ['CLOUD25', 'TEAM5']],
    ['a deeper subdomain', 'help.eu.dropbox.com', ['CLOUD25', 'TEAM5']],
    ['another site', 'shop.example-shoes.co.uk', ['RUN10']],
    ['the host in another case', 'WWW.Dropbox.COM', ['CLOUD25', 'TEAM5']],
  ])('finds the codes for %s', (_label, host, expected) => {
    expect(codes(host)).toEqual(expected);
  });

  it.each([
    ['a site with no codes', 'example.org'],
    ['a name that only ends the same way', 'notdropbox.com'],
    ['a name that contains the domain', 'dropbox.com.example.org'],
    ['the shared suffix alone', 'co.uk'],
  ])('finds nothing for %s', (_label, host) => {
    expect(codes(host)).toEqual([]);
  });

  it('never matches a record that has no site', () => {
    expect(recordsForHost([noSite], 'example.org')).toEqual([]);
  });
});

describe('highlightDomains', () => {
  it('lists every merchant domain once, sorted', () => {
    const records = [
      sampleRecord({ id: 'a', merchantDomain: 'example.org' }),
      sampleRecord({ id: 'b', merchantDomain: 'dropbox.com' }),
      sampleRecord({ id: 'c', merchantDomain: 'example.org' }),
      sampleRecord({ id: 'd' }),
    ];
    expect(highlightDomains(records)).toEqual(['dropbox.com', 'example.org']);
  });

  it('includes sites whose codes are all expired or not yet valid', () => {
    const records = [
      sampleRecord({ id: 'a', merchantDomain: 'expired.example', expiryDate: '2020-01-01' }),
      sampleRecord({ id: 'b', merchantDomain: 'upcoming.example', startDate: '2099-01-01' }),
    ];
    expect(highlightDomains(records)).toEqual(['expired.example', 'upcoming.example']);
  });

  it('gives nothing when no record has a site', () => {
    expect(highlightDomains([sampleRecord()])).toEqual([]);
    expect(highlightDomains([])).toEqual([]);
  });
});
