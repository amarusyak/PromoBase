import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import type { PromoCodeRecord } from './record';
import { searchRecords, sortRecords } from './record-list';

const TODAY = '2026-10-09';

const codes = (records: readonly PromoCodeRecord[]) => records.map((record) => record.promoCode);

/** A record created the given number of minutes after a fixed moment; its id follows its code. */
function made(promoCode: string, minute: number, overrides: Partial<PromoCodeRecord> = {}) {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 12, minute)).toISOString();
  return sampleRecord({ id: `id-${promoCode}`, promoCode, createdAt, ...overrides });
}

describe('sortRecords', () => {
  it('puts active records first, upcoming next and expired last (PB-009)', () => {
    const records = [
      made('EXPIRED', 5, { expiryDate: '2026-10-08' }),
      made('UPCOMING', 4, { startDate: '2026-10-10' }),
      made('ACTIVE', 1),
    ];
    expect(codes(sortRecords(records, TODAY))).toEqual(['ACTIVE', 'UPCOMING', 'EXPIRED']);
  });

  it('treats undated, started and not-yet-expired records as one active group', () => {
    const records = [
      made('UNDATED', 1),
      made('STARTED', 2, { startDate: '2026-10-01' }),
      made('ENDS-TODAY', 3, { expiryDate: TODAY }),
      made('IN-RANGE', 4, { startDate: '2026-10-01', expiryDate: '2026-12-31' }),
    ];
    expect(codes(sortRecords(records, TODAY))).toEqual([
      'IN-RANGE',
      'ENDS-TODAY',
      'STARTED',
      'UNDATED',
    ]);
  });

  it('shows the newest first inside each group', () => {
    const records = [
      made('ACTIVE-OLD', 1),
      made('EXPIRED-OLD', 2, { expiryDate: '2026-09-30' }),
      made('UPCOMING-OLD', 3, { startDate: '2026-11-01' }),
      made('ACTIVE-NEW', 4),
      made('EXPIRED-NEW', 5, { expiryDate: '2026-01-31' }),
      made('UPCOMING-NEW', 6, { startDate: '2027-01-01' }),
    ];
    expect(codes(sortRecords(records, TODAY))).toEqual([
      'ACTIVE-NEW',
      'ACTIVE-OLD',
      'UPCOMING-NEW',
      'UPCOMING-OLD',
      'EXPIRED-NEW',
      'EXPIRED-OLD',
    ]);
  });

  it('orders by creation time, not by the dates on the code or the last edit', () => {
    const records = [
      made('OLD-EDITED-LATELY', 1, {
        expiryDate: '2026-10-10',
        updatedAt: '2026-10-09T08:00:00.000Z',
      }),
      made('NEW', 2, { expiryDate: '2027-12-31' }),
    ];
    expect(codes(sortRecords(records, TODAY))).toEqual(['NEW', 'OLD-EDITED-LATELY']);
  });

  it('moves a record between groups as the day changes', () => {
    const records = [made('OTHER', 1), made('ENDS-TODAY', 2, { expiryDate: TODAY })];
    expect(codes(sortRecords(records, TODAY))).toEqual(['ENDS-TODAY', 'OTHER']);
    expect(codes(sortRecords(records, '2026-10-10'))).toEqual(['OTHER', 'ENDS-TODAY']);
  });

  it('gives the same order whatever order the input was in', () => {
    const records = [
      made('A', 1),
      made('B', 1),
      made('C', 2, { startDate: '2026-11-01' }),
      made('D', 3, { expiryDate: '2026-01-01' }),
      made('E', 3, { expiryDate: '2026-01-01' }),
      made('F', 9),
    ];
    const expected = ['F', 'A', 'B', 'C', 'D', 'E'];
    expect(codes(sortRecords(records, TODAY))).toEqual(expected);
    expect(codes(sortRecords([...records].reverse(), TODAY))).toEqual(expected);
    expect(codes(sortRecords([...records.slice(3), ...records.slice(0, 3)], TODAY))).toEqual(
      expected,
    );
  });

  it('returns a new list and leaves the input as it was', () => {
    const records = [made('EXPIRED', 1, { expiryDate: '2026-01-01' }), made('ACTIVE', 2)];
    const sorted = sortRecords(records, TODAY);
    expect(sorted).not.toBe(records);
    expect(codes(records)).toEqual(['EXPIRED', 'ACTIVE']);
  });

  it('handles an empty list', () => {
    expect(sortRecords([], TODAY)).toEqual([]);
  });
});

describe('searchRecords', () => {
  const dropbox = sampleRecord({
    id: 'zzz-1',
    promoCode: 'CLOUD25',
    merchantDomain: 'dropbox.com',
    resourceUrl: 'https://www.dropbox.com/plans?ref=partner',
    note: 'From the Tuesday newsletter',
  });
  const shoes = sampleRecord({
    id: 'b',
    promoCode: 'Run-10',
    merchantDomain: 'example-shoes.co.uk',
    note: 'Знижка на перше замовлення',
  });
  const bare = sampleRecord({ id: 'c', promoCode: 'WELCOME10' });
  const all = [dropbox, shoes, bare];

  it.each([
    ['the whole code', 'CLOUD25', ['CLOUD25']],
    ['part of a code', 'loud', ['CLOUD25']],
    ['a code in another case', 'run-10', ['Run-10']],
    ['the merchant domain', 'dropbox.com', ['CLOUD25']],
    ['part of the merchant domain', 'shoes', ['Run-10']],
    ['the merchant domain in upper case', 'DROPBOX', ['CLOUD25']],
    ['a word from the note', 'newsletter', ['CLOUD25']],
    ['a note in another case', 'TUESDAY', ['CLOUD25']],
    ['a note in another alphabet, ignoring case', 'ЗНИЖКА', ['Run-10']],
    ['text shared by several records', '10', ['Run-10', 'WELCOME10']],
    ['a query with spaces around it', '  cloud25  ', ['CLOUD25']],
    ['a phrase with a space inside', 'tuesday news', ['CLOUD25']],
  ])('finds records by %s (PB-009)', (_label, query, expected) => {
    expect(codes(searchRecords(all, query))).toEqual(expected);
  });

  it.each([
    ['text that appears nowhere', 'nothing-like-this'],
    ['words in a different order than the note', 'newsletter tuesday'],
    // Only code, merchant domain and note are searched.
    ['text found only in the address', 'partner'],
    ['an id', 'zzz'],
    ['the word undefined, for a record without a note or domain', 'undefined'],
  ])('finds nothing for %s', (_label, query) => {
    expect(searchRecords(all, query)).toEqual([]);
  });

  it.each([
    ['an empty query', ''],
    ['a query of spaces', '   '],
  ])('returns every record for %s', (_label, query) => {
    expect(searchRecords(all, query)).toEqual(all);
  });

  describe('an international merchant name', () => {
    const munich = sampleRecord({
      id: 'idn',
      promoCode: 'BREZEL5',
      merchantDomain: 'xn--mnchen-3ya.de',
    });
    const records = [...all, munich];

    it.each([
      ['its readable spelling', 'münchen'],
      ['its readable spelling in upper case', 'MÜNCHEN.DE'],
      ['part of its readable spelling', 'ünch'],
      ['its stored spelling', 'xn--mnchen'],
    ])('is found by %s', (_label, query) => {
      expect(codes(searchRecords(records, query))).toEqual(['BREZEL5']);
    });

    it('is not found by the spelling without the accent', () => {
      expect(searchRecords(records, 'munchen')).toEqual([]);
    });
  });

  it('treats the query as plain text, not as a pattern', () => {
    const odd = sampleRecord({ id: 'd', promoCode: 'SAVE(10%)+.*' });
    expect(codes(searchRecords([...all, odd], '(10%)+.*'))).toEqual(['SAVE(10%)+.*']);
    expect(searchRecords(all, '.*')).toEqual([]);
  });

  it('keeps the order it was given and returns a new list', () => {
    const result = searchRecords(all, '');
    expect(result).not.toBe(all);
    expect(codes(searchRecords([bare, shoes], '10'))).toEqual(['WELCOME10', 'Run-10']);
  });
});
