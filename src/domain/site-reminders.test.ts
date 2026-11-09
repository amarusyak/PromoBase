import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import type { PromoCodeRecord } from './record';
import {
  accessPattern,
  accessToRemove,
  patternDomain,
  reminderDomains,
  siteReminderState,
  siteRemindersOn,
} from './site-reminders';

let nextId = 0;
function record(merchantDomain: string | undefined, notify: boolean): PromoCodeRecord {
  nextId += 1;
  return sampleRecord({
    id: `r-${nextId}`,
    notify,
    ...(merchantDomain === undefined ? {} : { merchantDomain }),
  });
}

describe('accessPattern and patternDomain', () => {
  it('asks for the domain and its subdomains over http and https', () => {
    expect(accessPattern('example.org')).toBe('*://*.example.org/*');
  });

  it.each(['example.org', 'shop.example.co.uk', 'xn--mnchen-3ya.de', 'a-b.example'])(
    'reads %s back from its own pattern',
    (domain) => {
      expect(patternDomain(accessPattern(domain))).toBe(domain);
    },
  );

  it.each([
    ['access to every site', '*://*/*'],
    ['https only', 'https://*.example.org/*'],
    ['the domain without subdomains', '*://example.org/*'],
    ['a path', '*://*.example.org/shop/*'],
    ['a port', '*://*.example.org:8080/*'],
    ['all urls', '<all_urls>'],
    ['a wildcard in the host', '*://*.*.org/*'],
  ])('ignores a pattern in any other shape: %s', (_label, pattern) => {
    expect(patternDomain(pattern)).toBeUndefined();
  });
});

describe('siteRemindersOn', () => {
  it('is off for a site without records', () => {
    expect(siteRemindersOn([record('other.org', true)], 'example.org')).toBe(false);
  });

  it('is off while every record for the site has notify off', () => {
    expect(
      siteRemindersOn([record('example.org', false), record('example.org', false)], 'example.org'),
    ).toBe(false);
  });

  it('is on when any record for the site has notify on', () => {
    expect(
      siteRemindersOn([record('example.org', false), record('example.org', true)], 'example.org'),
    ).toBe(true);
  });

  it('compares whole domains: a parent or a subdomain is another site', () => {
    const records = [record('shop.example.org', true)];
    expect(siteRemindersOn(records, 'example.org')).toBe(false);
    expect(siteRemindersOn([record('example.org', true)], 'shop.example.org')).toBe(false);
  });
});

describe('reminderDomains', () => {
  it('lists each site with reminders on once, sorted', () => {
    const records = [
      record('zeta.org', true),
      record('alpha.org', true),
      record('zeta.org', true),
      record('beta.org', false),
      record(undefined, false),
    ];
    expect(reminderDomains(records)).toEqual(['alpha.org', 'zeta.org']);
  });

  it('is empty without records', () => {
    expect(reminderDomains([])).toEqual([]);
  });
});

describe('accessToRemove', () => {
  it('gives back access for sites that are off or have no records left (PB-011)', () => {
    const records = [record('kept.org', true), record('off.org', false)];
    const granted = [
      accessPattern('kept.org'),
      accessPattern('off.org'),
      accessPattern('gone.org'),
    ];
    expect(accessToRemove(granted, records)).toEqual([
      accessPattern('gone.org'),
      accessPattern('off.org'),
    ]);
  });

  it('keeps access every site with reminders on still needs', () => {
    const records = [record('a.org', true), record('b.org', true)];
    expect(accessToRemove([accessPattern('a.org'), accessPattern('b.org')], records)).toEqual([]);
  });

  it('leaves access in any other shape alone, such as access given in Chrome itself', () => {
    expect(accessToRemove(['*://*/*', 'https://example.org/*', '<all_urls>'], [])).toEqual([]);
  });

  it('keeps a parent site and a subdomain apart', () => {
    const records = [record('help.shop.org', true), record('shop.org', false)];
    const granted = [accessPattern('shop.org'), accessPattern('help.shop.org')];
    expect(accessToRemove(granted, records)).toEqual([accessPattern('shop.org')]);
  });

  it('lists a pattern granted twice once', () => {
    expect(accessToRemove([accessPattern('a.org'), accessPattern('a.org')], [])).toEqual([
      accessPattern('a.org'),
    ]);
  });
});

describe('siteReminderState', () => {
  it.each([
    [false, false, 'off'],
    [false, true, 'off'],
    [true, true, 'on'],
    [true, false, 'needs-access'],
  ] as const)('switch on: %s, access: %s gives %s', (on, access, expected) => {
    expect(siteReminderState([record('example.org', on)], 'example.org', access)).toBe(expected);
  });
});
