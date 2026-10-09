import { describe, expect, it } from 'vitest';
import {
  domainFromInput,
  domainFromPattern,
  hostMatchesDomain,
  hostOf,
  naiveDomain,
  patternForDomain,
} from './domains';

describe('spike domain helpers', () => {
  it('round-trips a domain through its match pattern', () => {
    expect(domainFromPattern(patternForDomain('example.com'))).toBe('example.com');
  });

  it.each(['<all_urls>', '*://*/*', 'https://example.com/*', '*://example.com/*'])(
    'does not read a domain out of %s',
    (pattern) => {
      expect(domainFromPattern(pattern)).toBeUndefined();
    },
  );

  it.each([
    ['example.com', true],
    ['www.example.com', true],
    ['a.b.example.com', true],
    ['notexample.com', false],
    ['example.com.evil.test', false],
  ])('host %s matches example.com: %s', (host, expected) => {
    expect(hostMatchesDomain(host, 'example.com')).toBe(expected);
  });

  it.each([
    ['https://www.example.com/plans?x=1', 'www.example.com'],
    ['http://example.com:8123/', 'example.com'],
    ['chrome://extensions', undefined],
    ['not a url', undefined],
    [undefined, undefined],
  ])('hostOf(%s) is %s', (url, expected) => {
    expect(hostOf(url)).toBe(expected);
  });

  it.each([
    ['wikipedia.org', 'wikipedia.org'],
    ['en.wikipedia.org', 'wikipedia.org'],
    ['https://en.wikipedia.org/', 'wikipedia.org'],
    ['https://en.wikipedia.org/wiki/Coupon?x=1#top', 'wikipedia.org'],
    ['  HTTP://WWW.Example.COM:8080/path  ', 'example.com'],
    ['example.com.', 'example.com'],
    ['react.dev/learn', 'react.dev'],
  ])('reads %s as %s', (input, expected) => {
    expect(domainFromInput(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'test',
    'localhost',
    'https://',
    'not a site',
    'exa mple.com',
    '*.example.com',
  ])('reads no domain out of "%s"', (input) => {
    expect(domainFromInput(input)).toBeUndefined();
  });

  it('guesses the last two labels', () => {
    expect(naiveDomain('en.wikipedia.org')).toBe('wikipedia.org');
  });
});
