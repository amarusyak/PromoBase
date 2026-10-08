import { describe, expect, it } from 'vitest';
import {
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

  it('guesses the last two labels', () => {
    expect(naiveDomain('en.wikipedia.org')).toBe('wikipedia.org');
  });
});
